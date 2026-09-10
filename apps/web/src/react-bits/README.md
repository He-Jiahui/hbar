# React Bits adapter

The components in this directory are adapted from the copy-ready TypeScript/CSS
variants in `D:\Git\cc-haha\.references\react-bits` at source commit
`4bb4491b3879b115eb6758fae7f5b6c3ec7eb0a3`.

Selected components:

- `SpotlightCard`: pointer-proximity radial highlight for dense interactive rows;
  pass `as="button"` when the highlighted surface itself must remain a native button.
- `GlassSurface`: SVG displacement glass with the source component's browser
  fallback, mapped to hbar's semantic surface and accent tokens.
- `GlassIconButton`: the layered `GlassIcons` button treatment, constrained to
  the existing desktop tool-rail dimensions.
- `GlareButton`: the `GlareHover` highlight adapted for native send and approve
  buttons without changing their keyboard or disabled behavior.
- `AnimatedList`: the `AnimatedList` entry reveal and scroll-edge gradients,
  adapted around existing browser-page list markup without adding `motion`.

The source project is distributed under the MIT + Commons Clause license. This
adapter is kept in the application rather than adding the reference site as a
runtime dependency, and the source notice must remain with substantial copies.
