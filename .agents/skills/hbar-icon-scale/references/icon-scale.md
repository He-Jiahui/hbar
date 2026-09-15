# Icon tier reference

## Token definition

The shared token layer should define exactly these defaults unless a documented
product-wide change is approved:

```css
:root {
    --hbar-app-ui-icon-xs: .75rem;
    --hbar-app-ui-icon-sm: .875rem;
    --hbar-app-ui-icon-md: 1rem;
    --hbar-app-ui-icon-lg: 1.25rem;
    --hbar-app-ui-icon-xl: 1.5rem;
}
```

The values are design tokens, not a coordinate system. A component may use a
token for both inline and block size, or rely on the icon library's intrinsic
aspect ratio. Do not add a token for every observed width.

## Role-to-tier examples

| Observed role | Tier | Notes |
| --- | --- | --- |
| status dot, small code-tab glyph | `xs` | Keep the adjacent text in the same flow row |
| toolbar formatting glyph, close affordance | `sm` | Preserve the button's padding separately |
| navigation item, ordinary action | `md` | Default choice when the role is unclear |
| panel toggle, prominent action | `lg` | Confirm that the reference gives it more optical weight |
| empty-state illustration glyph | `xl` | Use only when it is the focal visual |

If a preview contains a 14px icon beside a 16px icon, first ask whether the
different size expresses a semantic role. If not, use one tier consistently;
pixel-perfect variation caused by font or browser rasterization is not a new
design token.

## Review checklist

- Is the tier selected from a measured/computed preview role rather than a guess?
- Is the size expressed through a shared token or typed tier?
- Is the icon's hit area created with padding and gap rather than a larger glyph?
- Does the icon stay aligned when the label wraps or changes locale?
- Are all breakpoints using the same semantic role and tier?
- Did the icon guard and the relevant visual/interaction tests run?
