# Issue tracker: GitHub

Issues and specs live in GitHub Issues. Use the `gh` CLI.

Run commands from this repository so `gh` resolves the repository from
`origin`. When running elsewhere, pass `--repo CodTin/meteo-weave`.

## Ticket operations

- Create: `gh issue create --title "..." --body-file -`.
  Use a heredoc for multiline bodies.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments`.
  Add appropriate label and state filters.
- Comment: `gh issue comment <number> --body-file -`.
- Label: `gh issue edit <number> --add-label "..."`.
- Remove a label: `gh issue edit <number> --remove-label "..."`.
- Close: `gh issue close <number> --comment "..."`.

Use `docs/agents/triage-labels.md` for triage label names.

When a skill says “publish to the issue tracker”, create a GitHub issue.
When it says “fetch the relevant ticket”, read the GitHub issue.

## Delivery gate (before closing work)

A local commit is **local-complete**, not remotely delivered. Before closing any implementation
issue or treating it as a completed remote dependency:

1. Integrate the implementation and run `bun run agent:verify` against the final content.
2. Publish the exact branch with the user's authorization; this workflow does not grant push
   permission. Otherwise report local completion and leave the remote issue open.
3. From the clean published checkout, run `bun run agent:delivery`. It requires origin's branch
   tip to equal HEAD and a completed successful `.github/workflows/verify.yml` run for that SHA.
   Missing remote code, missing/failed CI or an API error is a blocked gate, not success.
4. Attach that commit and CI evidence to the issue before closing it. Local log paths alone
   are not reproducible remote delivery evidence. Use the PR's normal closing flow if applicable.

The gate only reads Git/GitHub. It never pushes, changes protection rules, opens a PR or closes an
issue. See `docs/agents/workflow.md` for checkpoint and evidence retention.

## Pull requests as a triage surface

PRs as a request surface: no.

## Parent and child issues

Use GitHub sub-issues:

- Create a child: `gh issue create --parent <parent> ...`.
- Link an existing child:
  `gh issue edit <parent> --add-sub-issue <child>`.

If sub-issues are unavailable, add `Part of #<parent>` at the top of the
child body and link the child in the parent's task list.

## Wayfinding

- The map is one issue labelled `wayfinder:map`.
- Child tickets use `wayfinder:research`, `wayfinder:prototype`,
  `wayfinder:grilling`, or `wayfinder:task`.
- Create missing wayfinding labels when this workflow is first used.
- Represent blockers with GitHub native issue dependencies.
  Resolve an issue's database ID with:
  `gh api repos/{owner}/{repo}/issues/<number> --jq .id`.
- Add a blocker with:
  `gh api --method POST repos/{owner}/{repo}/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  Use the numeric database ID, not the issue number or node ID.
- If native dependencies are unavailable, use a `Blocked by: #<number>`
  line in the child body.
- Select the first open, unassigned child in map order with no open blockers.
- Claim with `gh issue edit <number> --add-assignee @me`.
- Resolve by commenting with the outcome, closing the child, and adding
  a concise outcome and ticket reference to the map's Decisions-so-far.
