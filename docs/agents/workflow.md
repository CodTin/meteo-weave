# Agent execution and recovery

## Start or resume

1. Read the applicable repo instructions and domain pointer. Run `bun run agent:doctor`
   before code changes, dependency installation or browser checks. It reports the checkout,
   exact HEAD, dirty paths, actual runtimes, lockfile digest, local index and port status.
   Set `--port <number>` when a parallel worker owns a different E2E port.
2. Preserve existing dirty work. Use a separate managed worktree when ownership overlaps;
   initialize it from the named integration branch, never silently reset a dirty checkout.
   Each worker owns its dependencies, build output and browser port. Only one merger writes
   to the integration checkout. Use the host's managed worktree lifecycle tools when available.
3. For an interrupted task run `bun run agent:resume --id <task-id>`. A changed HEAD, checkout
   path or working-tree fingerprint exits nonzero. Inspect the difference before updating the
   checkpoint; the command never resets files, resumes agents or starts servers.

## Checkpoints

At a completed red→green slice, before a handoff, and before stopping, run:

```sh
bun run agent:checkpoint --id spec-03-ticket-01 --status active \
  --next "Verify direct-entry failure recovery" --evidence /absolute/path/to/check-log
```

Statuses are `active`, `blocked`, or `local-complete`; none means remote delivery. Include the
concrete remaining operation, not “continue work”. State is written atomically under the Git
common directory's `agent-runs/<id>/`, outside all worktree source trees. Use a unique ID per
worker. It contains the repo path, branch, HEAD, dirty paths and a fingerprint of tracked and
non-ignored untracked content, runtime versions, and digests of `.env` / relevant build flags
(without their values). Ignored logs/screenshots must be preserved separately before
archiving a worktree. The checkpoint's evidence field is a pointer, not a copy of logs.

## Scope and evidence

- Fetch issue titles first. `bun run agent:snapshot --id <task-id> --issues 2,18,19`
  saves only the requested issue bodies and native blockers outside the checkout and prints
  a compact index. Read additional comments only when required. API errors are not “no blockers”.
- Maintain a small task frontier (ticket → blockers → owner/worktree → status) beside the
  snapshot. A completed dependency means its implementation is present in the integration
  branch, not merely reported by a worker.
- Map each acceptance requirement to an existing test, a new public-boundary test or specific
  visual evidence. See the lifecycle matrix in `docs/development.md`; a test count is not a map.
- Read the installed framework source or primary docs for version-sensitive behavior; keep
  the relevant source/version and why it matters with the evidence, not in every worker prompt.
- If a Skill tool is unavailable, read the named `SKILL.md` and follow it. If the checkout has
  no `.codegraph/`, use source tools without creating an index. Tool results with source count
  as reads; retrieve only missing sections, not the same files again.

## Verification and handoff

`bun run agent:verify` runs the repository's single `check:all` entry point, streams output and
writes `reports/verification/<head>-<run>/result.json` plus its log. Evidence includes HEAD,
working-tree/configuration fingerprint, runtime versions, exact command, exit code and log digest. A tree change during the run
invalidates the result. A dirty tree may be locally validated, but cannot pass the delivery gate.
Run targeted red→green checks while implementing; run complete integration checks at the gate.

Keep the handoff summary to: ticket/status, branch/SHA, changed ownership scope, checks and
remaining risk/action, with pointers to detailed logs. Reuse results only when HEAD/content and
runtime configuration match; report that reuse explicitly. Merger reports cover merge/conflicts
and integration validation, not a second copy of implementation history. Avoid polling agents
when independent work is available; wait for the next result needed on the critical path.

## Delivery

Follow `docs/agents/issue-tracker.md`. `agent:delivery` is a read-only gate, not a push, PR or
issue-closing command. Report local completion separately until authorized publication and a
successful exact-commit CI run exist. Archive managed worker checkouts only after their changes
are integrated and required ignored evidence has been retained.
