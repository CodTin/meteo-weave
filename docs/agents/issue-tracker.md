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
