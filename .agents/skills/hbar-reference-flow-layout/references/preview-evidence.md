# Preview evidence checklist

Use this checklist when a visual reference includes screenshots plus a captured preview observation.

## Capture the hierarchy, not only rectangles

For every visible region, record:

- its role or native element (`dialog`, `header`, `footer`, `dl`, `label`, `input`, `select`, `menuitem`);
- its parent region and sibling order;
- whether it is a flowing row, column, value pair, action group, or overlay;
- text reading order, inline emphasis, truncation, and alignment;
- what changes between desktop/tablet/narrow views.

Rectangles are evidence for padding, gaps, max-widths, and responsive wrapping. They do not authorize reimplementing the reference as a set of coordinates.

## Infer the minimum layout mechanism

| Observed effect | Preferred implementation |
| --- | --- |
| Centered panel with natural content | overlay parent plus flex/grid child and `margin: auto` / alignment |
| Header title and close control | flex row, `justify-content: space-between` |
| Label left / current value right | flex row, `justify-content: space-between`; inline value fragment group |
| Field label, control, helper | grid or column flex with `gap` |
| Desktop action row becoming narrow stack | media-query `flex-direction`, preserve DOM order |
| Right-side details panel | edge overlay container; flowing panel header/body/footer |
| Menu opened beneath a trigger | trigger-relative overlay; flowing menu rows and separators |

Before using an exception for an overlay, verify that the reference actually overlays sibling content. All text and controls within the overlay still use normal flow.

## Review questions

- Does the DOM say the same thing as the preview, or are continuous phrases fragmented only for positioning?
- Are bold/muted/struck fragments inline variations of one value group?
- Does the action order still make sense with CSS disabled or on a narrow view?
- Would a translated/longer string wrap safely without a coordinate adjustment?
- Can the screenshot mismatch be fixed through a parent flow, gap, width, typography, or breakpoint rule instead of a position or fixed height?
