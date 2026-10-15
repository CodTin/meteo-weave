# Domain docs

## Layout

This repository uses a single-context domain model.

- Canonical glossary: `GLOSSARY.md` at the repository root.
- Architecture decision records: `docs/adr/`.

## Before exploring

Read `GLOSSARY.md`, then read ADRs relevant to the area being investigated.

If these files or directories do not exist, proceed silently. The
`domain-modeling` skill creates them lazily when terminology or decisions
are resolved; do not create speculative terms or decisions during setup.

## Use the glossary's vocabulary

Use established glossary terms in issue titles, proposals, hypotheses,
code, and tests.

If a needed concept is absent, reconsider whether it belongs to the domain.
Record genuine vocabulary gaps for the `domain-modeling` workflow.

## Surface decision conflicts

When a proposal contradicts an existing ADR, identify the ADR explicitly
and explain why the decision should be reconsidered.

## Data boundaries

- **Client**: User input collection, display formatting, client-side validation preview
- **Server**: Authoritative validation, timezone conversion (uses server `now`), persistence

Timezone conversion happens server-side to avoid client clock drift creating invalid records.
See `configuration-admission.ts` (admission rules) and `downscaling-tasks.server.ts` (persistence).
