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
