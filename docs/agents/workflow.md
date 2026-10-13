# Agent execution and recovery

## Start or resume

1. Read the applicable repo instructions and domain pointer. Run `bun run agent:doctor`
   before code changes, dependency installation or browser checks. It reports the checkout,
   exact HEAD, dirty paths, actual runtimes, lockfile digest, local index, Chromium executable
   and port status. The supported Node range is broader than the `.node-version` verification
   baseline; the doctor requires both. Missing dependencies/browser/lockfile are setup failures,
   not permission to bypass checks. Install with the pinned Bun and frozen lockfile, select the
   baseline Node, install Chromium, then rerun the doctor.
   Set `--port <number>` when a parallel worker owns a different E2E port.
2. Preserve existing dirty work. Use a separate managed worktree when ownership overlaps;
   initialize it from the named integration branch, never silently reset a dirty checkout.
   Each worker owns its dependencies, build output and browser port. Keep integration and review
   in separate managed checkouts, not in the user's active checkout. Review a pinned commit;
   only one merger writes to the integration checkout. Use the host's managed worktree lifecycle tools when available.
3. For an interrupted task run `bun run agent:resume --id <task-id>`. A changed HEAD, checkout
   path or working-tree fingerprint exits nonzero. Inspect the difference before updating the
   checkpoint; the command never resets files, resumes agents or starts servers.

## Ownership protection

Before writes, pin the exact starting commit and declare owned paths:

```sh
bun run agent:protect --id spec-03-ticket-01 --base codex/spec-03 \
  --allow src/features/downscaling-tasks/,tests/unit/task-service.test.ts
bun run agent:check-protection --id spec-03-ticket-01
```

Use a unique ID. A trailing `/` permits a directory; a file path permits only that file.
The baseline must equal HEAD. The check permits descendant commits within the declared scope,
but rejects changes outside it, branch/checkout switches, and modifications or staging of any
pre-existing Git-visible user work—even within the owned scope. Ignored artifacts are outside
this ownership check; `agent:verify` separately fingerprints ignored root environment files. It never stashes, resets, stages, or restores
files. Run it before worker handoff. The worker does not refresh from a moving integration branch:
that would import other owners' changes into its protected scope. The merger checks the
approved worker SHA/scope, then merges into the current integration tip and verifies the
combined tree. Never expand the worker allowlist to hide imported changes. Protection records live alongside
checkpoints in the Git common directory and cannot be silently overwritten.

For review, use a clean detached worktree at the exact review commit. A dirty checkout's result
is not evidence for its clean HEAD: `agent:verify` binds evidence to both HEAD and content.

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
and integration validation, not a second copy of implementation history. Prefer completion notifications. When blocked on the next dependency, use one bounded long
wait; do not follow an unchanged timeout with repeated status/log reads. Dispatch the ticket,
worktree, baseline, ownership scope and protocol/evidence pointers rather than repeating this
protocol in every prompt. Existing checkpoint fields are the status record; update them on
phase completion, a real blocker, or handoff, not on a timer.

## Browser iteration and visual gates

The default `test:e2e` still rebuilds a production server and never reuses an unknown running
server. For repeated test-only edits in the **same** checkout:

```sh
bun run e2e:build
bun run test:e2e:reuse tests/e2e/workspace-access.spec.ts --workers=2
```

Reuse checks app/public sources, build configuration (including ignored `.env` files), lockfile,
installed direct package manifests, Node/Bun, checkout path, runner version and output digests.
Changed application inputs, failed/interrupted builds, copied or modified output fail closed.
Symlinked app/config/output paths are rejected rather than trusting an unhashed external target.
Only test/docs changes can reuse unchanged app output. Secrets appear only as hashes. Rebuild
for SSR/startup changes and use the default fresh build for final `agent:verify`/CI. Keep builds
and servers private to their worktree; changing `E2E_PORT` does not make shared output safe.

Changes to shell/navigation/account controls must run `test:e2e:layout` and inspect an actual
390px screenshot before handoff, plus 768/1440px and reduced-motion coverage. No overflow and
an axe pass do not prove readable layout. Preserve the existing public geometry and lifecycle
assertions; do not substitute CSS-class snapshots or trim controls to make them pass.

Chromium is the required CI gate. Run `.github/workflows/browser-compatibility.yml` manually
for WebKit or Firefox; it reports failures and uploads evidence, without silently skipping them
or claiming historical smoke results validate current flows.

## Delivery

Follow `docs/agents/issue-tracker.md`. `agent:delivery` is a read-only gate, not a push, PR or
issue-closing command. Report local completion separately until authorized publication and a
successful exact-commit CI run exist. Archive managed worker checkouts only after their changes
are integrated and required ignored evidence has been retained.
