# Review standards

Read during review. Implementation navigation lives in `AGENTS.md`; mechanical rules live in
`check:agent`, the formatter, linter, typechecker and tests. Do not repeat their findings unless
the guardrail is missing, bypassed or wrong.

## Judgement calls

- **Cross-page promises:** When a requirement says “all routes”, “all roles” or “responsive”,
  verify the applicable cases, including direct entry and navigation. One representative page
  does not prove a cross-page contract. State justified exclusions rather than inflating counts.
- **Recovery honesty:** Confirm that an error action can recover the actual failed operation;
  preserve usable navigation and safe diagnostics. Verify the success state, not just an error
  title. SSR, authorization and code-splitting changes need evidence at their interacting boundary.
- **One owned rule:** Related views should share normalization, identity and lifecycle rules
  where duplication would make one change require synchronized edits. Extract meaningful rules,
  not every repeated markup fragment; prefer existing seams to speculative abstractions.
- **Documentation truth:** Distinguish installed libraries, enabled capabilities, planned work
  and historical validation. Verify claims against implementation; a dependency name is not proof
  that its feature is mounted. Keep reasons/gotchas, link cheap-to-inspect configuration instead
  of maintaining competing inventories. Preserve historical records as historical.
- **Scientific scope:** UI placeholders, synthetic data, role permissions and computation claims
  must match the actual public behavior. Respect `GLOSSARY.md` and the originating spec.

## Authority

The originating spec defines scope. `docs/development.md` describes the current framework and
execution boundaries; illustrative Next.js/old-Tailwind snippets in `DESIGN.md` are not migration
instructions. Review Standards and Spec separately and report unresolved findings per axis.
