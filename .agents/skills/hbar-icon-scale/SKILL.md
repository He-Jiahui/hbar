---
name: hbar-icon-scale
description: Define and audit a small semantic icon-size scale for hbar UI, mapping measured reference icons to shared tiers instead of one-off pixel values. Use when adding or recreating interface icons; do not use for photographs, illustrations, or arbitrary image assets.
---

# Hbar icon scale

Use this skill whenever a component introduces, replaces, or visually audits an
icon. A screenshot is evidence of the icon's role and approximate optical
weight; it is not a reason to create a new size for every measured pixel.

## Default scale

Start with five tiers. This is deliberately small enough to be memorable while
covering the roles present in the hbar workbench:

| Tier | Canonical size | Typical role |
| --- | --- | --- |
| `xs` | `0.75rem` (12px) | Inline metadata, status marks, dense code/file affordances |
| `sm` | `0.875rem` (14px) | Compact toolbar, tab, and secondary action |
| `md` | `1rem` (16px) | Default button, navigation, and form control |
| `lg` | `1.25rem` (20px) | Prominent panel action or section affordance |
| `xl` | `1.5rem` (24px) | Empty-state, onboarding, or other focal icon |

These are semantic tiers, not five mandatory DOM variants. Add another tier
only after evidence shows a repeated product role that cannot be represented by
one of these values. Never encode a one-off `13px`, `15px`, `17px`, or similar
measurement merely because a screenshot differs by a pixel.

When a public preview reports a numeric icon size, map it to the nearest role:

- 11-12px -> `xs`
- 13-15px -> `sm`
- 16-18px -> `md`
- 19-22px -> `lg`
- 23-28px -> `xl`

Use the preview's computed style and surrounding control hierarchy to resolve
ambiguous cases. Do not infer a new tier from anti-aliasing, device scale, or a
single screenshot.

## Implementation contract

- Keep the tier names in one shared token layer, for example
  `--hbar-app-ui-icon-xs` through `--hbar-app-ui-icon-xl`; component styles
  consume the token instead of repeating numeric values.
- Prefer a typed icon wrapper or a component `size: 'xs' | 'sm' | 'md' | 'lg' | 'xl'`
  prop. Do not expose arbitrary numeric sizes in a public hbar component API.
- Pass the chosen tier to the icon and let flex/grid align it with its label.
  Icon dimensions may be fixed as a control token; surrounding content must
  remain normal flow and must not be positioned by coordinates.
- Keep icons optically consistent: use the same `strokeWidth`, `currentColor`,
  and `flex: 0 0 auto` policy within a control family unless the reference
  clearly demonstrates a different role.
- A button's hit area and an icon's drawing box are separate concerns. Size the
  icon by tier and use padding/gap for the hit area; do not enlarge the glyph to
  fake a larger button.
- Do not use icon size tiers to compensate for incorrect text wrapping,
  alignment, or container dimensions. Correct the parent flow first.

## Reference and responsive review

Before editing, record the icon's semantic role, neighboring text, control
size, and desktop/narrow behavior from the public preview. Reuse the same tier
across breakpoints unless the role itself changes. Verify that translated or
longer labels do not force an icon into a new ad-hoc size.

Run the bundled guard on changed TSX/CSS files:

```text
bun .agents/skills/hbar-icon-scale/scripts/validate-icon-scale.mjs <file> [...files]
```

The guard catches non-canonical numeric `size` props and malformed shared icon
tokens. It is intentionally a narrow signal, not proof that an icon matches a
reference; visual and accessibility review still apply.

## Routing

For screenshot/iframe reconstruction, also read
`../hbar-reference-flow-layout/SKILL.md`. For visible copy, list data, or
localized labels, read `../hbar-content-contract/SKILL.md` when that skill is
available.
