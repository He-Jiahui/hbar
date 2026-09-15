---
name: hbar-content-contract
description: Build hbar UI with host-owned localized copy and data contracts, not hard-coded visible strings or embedded demo lists. Use when adding or refactoring user-facing React components, forms, lists, or preview fixtures.
---

# Hbar localized content contract

User-visible copy and example records are product data. A reusable hbar UI
component renders typed content supplied by its host; it does not carry an
English demo, an implicit plural rule, or a hidden product taxonomy in its
implementation.

## Copy and localization boundary

- Do not place visible prose, button labels, headings, help text, empty states,
  aria labels, titles, placeholders, or alt text as direct string literals in
  TSX. This includes literal strings selected by a JSX conditional.
- A component package must not import `apps/web/src/locale.ts` or a web store.
  Instead expose a typed `labels`/`copy` prop that the host resolves with its
  locale system. Keep the component package independent of a particular i18n
  library.
- Use a typed bundle per independent surface. It should name every visible
  label and expose formatter functions for counts, dates, and state-dependent
  copy so pluralisation and grammar remain in the host locale.
- Keep stable non-visible identifiers such as action IDs, enum members,
  `className`, test IDs, and DOM relationship IDs separate from copy. They may
  be literal technical values, but must never be rendered as a fallback label.
- Default English fallback copy is not a substitute for localization. If a
  label is required for a meaningful rendered control, make the corresponding
  typed field required. Optional visual adornments may be omitted explicitly.
- Build each locale adapter near the host's `t`/message catalog. When a new
  label is added, update all supported locale maps in that adapter and add a
  non-default-locale rendering test.
- State stores IDs and domain values, not translated labels. Derive rendered
  copy from the current `labels` bundle at render time so changing locale does
  not corrupt application state or require duplicate stores.

## Content and editable-data boundary

- Headers, fields, item rows, suggestions, messages, tabs, code/file labels,
  and document sections that users can edit or that come from a service belong
  in typed props/data models. The view receives an ID and content data; actions
  return the ID/value to the owning ViewModel.
- Do not define sample item arrays, sample documents, or example records in a
  shipped reusable component. Put representative fixtures in the component's
  test file or in a clearly test-only fixture module. A preview application may
  inject those fixtures, but the package API must work without them.
- Preserve an explicit empty-state contract instead of indexing `items[0]` or
  silently selecting a fake record. If the active ID disappears after a refresh
  or mutation, select a documented safe fallback or render the empty state.
- Inputs receive their value, labels, validation messages, and callbacks from
  the owning feature contract. Local React state is only for ephemeral visual
  state or an explicitly owned draft; it must not replace host/domain data.
- Avoid `Record<string, string>` or an untyped `t(key: string)` escape hatch in
  public contracts. Prefer a named interface, discriminated row data, and
  formatter functions with typed parameters.

## List capacity and overflow decision

For every list-like surface, decide and document one of these ownership models
before implementing it:

1. **Content-grown list:** item count is intentionally short/bounded; the
   container grows with its semantic content. Do not add a fake scroll region.
2. **Pane-owned scroll list:** the component lives in a bounded workbench pane;
   use normal flex/grid flow with `min-block-size: 0`, a flexing list region,
   and `overflow: auto`. Keep header/footer actions outside the scroll region.
3. **Large or unbounded collection:** use cursor pagination, incremental
   loading, or virtualization. When dense rows can exceed the documented page
   size or arrive continuously, virtualize with the existing
   `@tanstack/react-virtual` dependency or expose a paged contract. Do not
   virtualize short menus, select options, or a handful of cards merely by
   speculation.

The component contract must state the expected bound or loading strategy.
Never use a fixed pixel height just to conceal overflow; the pane ownership or
the reference behavior must justify the scroll boundary.

## Required test matrix

For every new or materially refactored content/list surface, add behavior tests
with host-supplied fixtures covering:

- a non-default locale and a deliberately long translated label;
- no items, one item, normal items, the documented boundary, and one item over
  the boundary/loading threshold;
- a missing/stale active ID, duplicate IDs, and a callback directed at the
  original item after a list mutation;
- an editable value, save/failure/recovery behavior where the surface owns a
  draft;
- the chosen overflow model: no clipping for content-grown lists, actual
  scrollability for pane-owned lists, or bounded rendered rows/cursor behavior
  for virtualized/paginated lists;
- desktop and narrow layout with long localized content, including keyboard and
  accessible names for interactive rows.

Use test fixtures only in test or preview-test code. Test a visible result or
state transition, not merely that a localization function was called.

## Static review

Run the bundled guard over new/refactored TSX. It detects direct JSX copy and
literal accessible text attributes; use it as a focused backstop, then review
the public props and tests for module-level sample content as well.

```text
bun .agents/skills/hbar-content-contract/scripts/validate-content-contract.mjs <file> [...files]
```

Run `--self-test` after changing the guard. The guard intentionally does not
try to infer every possible data flow; passing it does not authorize hard-coded
module-level example records.

## Routing

For screenshot/iframe recreation, also read
`../hbar-reference-flow-layout/SKILL.md`. For icon tiers in user-facing
controls, also read `../hbar-icon-scale/SKILL.md`.
