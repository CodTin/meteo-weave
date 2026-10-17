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
- **Spec fidelity:** Implement what the spec describes, not what seems useful. Live updates,
  generic components, and convenience features beyond spec scope should be proposed in spec
  comments before implementation. When uncertain, implement the minimal literal reading first.

- **Semantic assertions:** Distinguish requirements from incidental representation. A safe
  return URL should preserve origin, pathname, query values and hash; `%20` versus `+` is not
  a product requirement unless the spec says so. SSR checks must inspect returned server HTML,
  not a later hydrated page. Tag-regex syntax is mechanically rejected by `check:agent`.
- **Readable shared chrome:** Shared navigation/account changes need actual narrow-screen
  evidence, not only overflow/axe passes. Inspect 390px screenshots and existing geometry tests;
  controls and breadcrumbs must remain readable while pending, loaded and in dialogs.
- **Shared test boundaries:** Reuse `demo-login`, `browser-guard`, `held-session-response` and
  `workspace-cases` when testing those same behaviors. Keep scenario-specific assertions local;
  extract real repeated coordination, not a generic testing framework.

## Shared utilities

- **Mathematical functions**: Pure calculation functions (RMSE, MAE, correlation, statistical operations) belong in `src/features/[domain]/service/metrics-utils.ts` or a shared `[domain]-utils.ts`.
- **Domain utilities**: Feature-specific helpers stay with their feature.
- **Cross-domain utilities**: Shared across multiple features go in `src/lib/utils.ts`.

## Authority

The originating spec defines scope. `docs/development.md` describes the current framework and
execution boundaries; illustrative Next.js/old-Tailwind snippets in `DESIGN.md` are not migration
instructions. Review Standards and Spec separately and report unresolved findings per axis.
