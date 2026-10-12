# UI style contracts

Production host CSS uses host-owned classes and documented Lumen parts. The
`@lumen/app-ui/style-contract` entry exports the typed `LumenStylePart` names,
`lumenPartProps()` and `lumenPartSelector()`. Parts remain stable when internal
class names or wrappers change. A node may expose several parts, so selectors
use `~=` rather than exact attribute equality.

```css
.host-session [data-lumen-part~='conversation.messages'] {
  overscroll-behavior: contain;
}
```

The public registry groups styling points into conversation, composer, sidebar,
tree, page header, tool pane, dialog, menu and form regions. `LumenSurface` also
accepts a typed `contentPart` for its content wrapper. Host content inside a
part retains host-owned selectors and normal semantic HTML flow.

`bun run check:styles` runs Stylelint against all production Web and app-react
CSS. It rejects private `.lumen-*` classes, unknown part names and selectors
that assume a part attribute contains only one value. Development reference
fixtures retain their separate stylesheet boundary.

The same command checks spacing, radius and layer declarations in host CSS and
the actual Lumen workbench stylesheet graph. Gap, margin and padding use the
seven foundation tokens `--lumen-space-2/4/8/12/16/24/32`. At a 16px root font
these represent 2, 4, 8, 12, 16, 24 and 32px. Geometric zero and percentages
remain valid; control dimensions, border widths and chart geometry are separate
contracts. Custom design variables cannot hide an arbitrary spacing literal.

The three radius roles are `control`, `surface` and `panel`. Lumen's existing
corner-size preference chooses the shared values for all three roles, and
square shape sets them to zero. The pill token is reserved for circular or
pill-shaped controls. Components cannot introduce a private radius scale.
Layers use named `--lumen-layer-*` tokens; only the foundation defines their
numeric ordering. Toast depth is a bounded runtime offset within its layer.

`bun run check:responsive` follows the production CSS imports, rejects missing
or escaping imports, and audits the width queries. Viewport boundaries are
40rem, 48rem and 64rem, expressed as half-open ranges with `<` or `>=`.
The shared TypeScript responsive contract uses the same boundaries for sidebar
and floating-surface behavior. Named containers handle the internal width of
resizable workbench regions; their geometry belongs to their component rather
than adding another viewport breakpoint. A named query must have a declared
production container.

Fixed-viewport browser verification also exercises the real tool separator:
at 1440px viewport width the session container changed from 770px to 590px,
crossing its 48rem header boundary while its send action and monitoring tab
remained reachable. Query audits and viewport screenshots alone do not prove
this pane-width behavior.
