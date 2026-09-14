---
name: hbar-reference-flow-layout
description: Recreate hbar application UI from a rendered reference preview while preserving the reference's semantic, flow-based HTML/CSS layout. Use for visual component work that has screenshots or iframe-visible structure; do not use for unrelated UI changes.
---

# Hbar reference flow layout

Recreate the behavior and visual hierarchy of the observed component, not a single frozen screenshot. Treat a rendered preview as evidence of document flow, semantics, responsive rules, and visual tokens.

## Required interpretation before editing

1. Inspect all available desktop, tablet, and narrow-preview screenshots. Inspect iframe-visible text, element roles, control types, bounding rectangles, and computed styles when those observations are available. Use the observations to infer parent/child ownership, reading order, whether controls share a row, and breakpoint behavior. Do not claim access to protected source markup or styles unless it was actually supplied.
2. Read the text as content before choosing elements. A phrase with a bold fragment, strike-through previous value, muted domain prefix, keyboard shortcut, or status marker is normally one semantic sentence or value row: keep it in one parent text flow and use inline descendants for its style. Do not split continuous text into separately positioned blocks merely to make a screenshot line up.
3. Identify the alignment model per region: left/center/right text alignment, `space-between` value rows, stacked field flow, footer action order, and responsive reorder. Keep the DOM reading order meaningful and use an accessible native control where the preview represents a control.

## Layout rules

- Build content with normal document flow first. Use `display: flex`, `display: grid`, intrinsic sizing, `gap`, `flex`, `minmax`, wrapping, and `margin-inline: auto` to express rows, columns, centering, and responsive stacking.
- Pixel values are permitted only for visual rhythm and component tokens: padding, margin, gap, border width/radius, icon/control dimensions, typography, shadows, and bounded max/min widths or heights when the component contract actually needs them. They are not permitted to place content at a screen coordinate.
- Do not use `position: absolute`, `fixed`, `top`, `right`, `bottom`, `left`, `inset`, `translate`, or coordinate-like offsets to arrange ordinary text, fields, buttons, panels, menus, or cards. Do not encode reference screenshot coordinates as `top`/`left` or fixed content heights to force alignment.
- The only narrow exception is a true overlay relationship demonstrated by the preview: a modal backdrop may cover its owning component; a drawer may be anchored to a component edge; a menu may be anchored to its trigger. In that case position only the overlay container, keep its internal contents in flex/grid flow, and prefer a trigger-relative anchor over viewport pixels.
- Width should be intrinsic, percentage, `min()`, `max()`, or `clamp()` where possible. A reference's observed modal width can justify `width: min(...)`, but its height must generally come from content. Use `min-height` only for a true interaction affordance, not to make a screenshot match.
- At small widths, let the same semantic layout wrap or change flex direction; preserve reading and action order. Do not create a separate coordinate map for each viewport.

## Semantic text and values

- Use one text container for continuous prose. Inline `<strong>`, `<span>`, `<s>`, `<kbd>`, and status dots may style fragments without breaking the sentence's flow.
- Use a single flex row with `justify-content: space-between` for label/value metadata and change rows. Put prior/current values in an inline value group instead of creating visual columns with offsets.
- Use heading, paragraph, list, definition-list, label/input, and button semantics consistent with the preview. Labels stay associated with their controls. Footer actions remain a semantic action group even when a narrow layout stacks them.
- Do not invent labels, descriptions, calls to action, or content blocks that change the meaning observed in the reference.

## Verification and correction

1. Verify DOM geometry and computed layout with Playwright at each reference viewport. Check that no selector uses coordinate placement for ordinary content and that long text/narrow layouts wrap without overlap or clipping.
2. Capture screenshot comparisons using the repository's visual audit tools. Use a diff to discover real deviations, then correct the underlying flow, text semantics, spacing, typography, or responsive rule—not by adding coordinate offsets.
3. Inspect the resulting desktop and narrow screenshots manually. A low pixel delta is not sufficient when the DOM semantics, text grouping, or responsive behavior is wrong.
4. Run the relevant typecheck, lint, build, interaction checks, and `git diff --check`. Follow `hbar-engineering` for component boundaries, i18n contracts, and independent commits.

## Reference evidence routing

For a detailed extraction checklist and a review rubric, read [references/preview-evidence.md](references/preview-evidence.md) before rebuilding a component family from preview artifacts.
