<!-- rtk-instructions v2 -->

# Command output

Command output here is condensed to save tokens, keeping every signal and
dropping costly noise. Treat it as the complete result: run commands
normally, and batch related commands into one call to avoid extra turns.
Truncated results state their recovery path in their own output. Re-run a
command as `rtk proxy <cmd>` only when its result is unusable: empty when
output was clearly expected, contradicting its exit code, or garbled.
<!-- /rtk-instructions -->

## Agent skills

### Issue tracker

Use GitHub Issues. Before creating, reading, or updating tickets, read
`docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical triage labels. Before triaging or labelling issues,
read `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo. Before exploring the codebase or proposing
domain changes, read `docs/agents/domain.md`.
