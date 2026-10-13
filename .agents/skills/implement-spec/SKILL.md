---
name: implement-spec
description: "Implement the result of /to-spec and /to-tickets in code."
disable-model-invocation: true
---

You have been provided a spec. This spec should have tickets associated with it, describing how to implement the spec.

The issue tracker should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.

The goal is the entire spec implemented on a single **integration branch**, with every ticket resolved the way the issue tracker closes work.

The tickets are not a list of steps. They are a **task graph** with blocking relationships between them. This means there is always a **frontier** of tickets which are ready to be grabbed.

Communication to and from subagents should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

**Implementer subagents** should be run in the background where possible for maximum concurrency.

## Steps

1. Read `docs/agents/workflow.md` and run `bun run agent:doctor`. On resume, compare the saved
   checkpoint with the actual checkout before any writes. Read the spec and only its relevant
   tickets/blockers; use `agent:snapshot` rather than printing every issue body. Keep the task
   frontier beside the snapshots. Reuse test seams explicitly confirmed in the spec.

2. (optional) Use an **exploration subagent** to conduct any exploration required by the tickets - relevant codebase files or external documentation. Ensure the exploration subagent can save files - it should save its markdown notes in a directory outside the repo, accessible by all future subagents. This lets **implementer subagents** focus on implementation rather than exploration.

3. Create the integration branch. If the issue tracker closes work through PRs, or the user asks for one, open a draft PR after the first merge in step 5 (a branch with no commits ahead of main can't open one), marked as closing the spec and tickets.

4. Use **implementer subagents** to implement each ticket, each in its own worktree on its own branch. Each implementer subagent:
   - confirms its worktree is based on the integration branch before starting; for a mismatched dirty checkout, preserves the work and resolves ownership rather than resetting it;
   - uses `tdd` to build the ticket (read its `SKILL.md` when no Skill tool is available);
   - merges the integration branch tip into its own branch before reporting done; writes a checkpoint and a short SHA/checks/next-action handoff with detailed evidence behind pointers

5. Once an **implementer subagent** completes, merge its work to the integration branch with a **merger subagent**. The merger owns the integration checkout exclusively and reports merge/conflict/check results, not a duplicate implementation narrative.

6. If this changes the **frontier** of available tickets, kick off more **implementer subagents** to work on the new tickets. This allows for maximum concurrency.

7. Once all tickets are complete, use `code-review` on the integration branch (read its `SKILL.md` if needed). Fix all issues raised in a single **implementer subagent**. Map acceptance requirements to evidence and run `bun run agent:verify` on the final integrated content.

8. Follow the issue tracker delivery gate: require user-authorized publication and successful exact-commit CI (`bun run agent:delivery`) before resolving remote work. Otherwise report **local-complete** and leave remote issues open. Mark a draft PR ready only after its required checks; report the integration branch and evidence.

9. Clean up all **implementer subagent** worktrees.
