# Lumen application design

Lumen provides a quiet, content-first workbench. Hosts supply localized copy, real records and controlled actions. Production pages use shared primitives; reference variants retain their independently observed brand layouts.

## Hierarchy

`LumenSurface.surfaceRole` separates canvas, navigation, reading, raised and overlay roles from glass, frost and solid materials. Existing calls without a role retain their appearance. Reading shares the canvas; navigation uses a restrained neutral tone; overlays retain a visible, readable boundary. Avoid nested cards around ordinary prose.

`LumenContentText.context` defines content flow. Control labels and status text stay complete on one line. Dialog bodies and descriptions wrap. Navigation records are left aligned and clip at the trailing edge without ellipses. Code preserves source whitespace and owns local scrolling. Font and spacing derive from Lumen tokens and host appearance settings.

## Composition and interaction

`LumenPageHeader` groups the title, context and actions. Page titles may wrap; workspace titles own a local single-line reading area. `LumenToolPane` owns a header, scrollable body and optional footer. `LumenRecordRow` and `LumenMetricRow` express compact information without another card. Large collections remain host-paged or virtualized.

`LumenAdaptiveToolbar` measures complete controls, retains higher-priority actions inline and moves others to the shared More surface. A trailing mandatory action remains visible. It never abbreviates a label or clones interactive controls. Item IDs are stable; the host owns business state and callbacks.

Toolbar items keep their mounted portal containers when moving between inline and More locations. A programmatic reveal request can expose a lower-priority action without opening a second copy. Composer send, stop and background stop actions stay outside capacity-managed controls. `LumenActionMenu.labelVisible` exposes a full single-line trigger label when an icon alone is insufficient.

When supported, the foundation moves connected containers with `Element.moveBefore` to preserve focus, open popovers and animation state. It skips moves into the current parent. `focusLumenControl` asks the owning toolbar to reveal an overflowed control before restoring focus; hosts do not reach into toolbar internals. `LumenFloatingSurface.contentRef` exposes the shared surface container for stable docking and focus ownership. See [Chrome's state-preserving move API](https://developer.chrome.com/blog/movebefore-api).

`LumenAppShell` supports split and drawer tool presentation. The host chooses widths and preserves the panel identity; the shared floating surface supports a persistent dock target, backdrop, dismissal and focus return. Allocate a reading budget before opening a side-by-side tool. The navigation footer owns bounded scrolling in short windows so the record tree remains usable.

`LumenProvider.surfaceRole` sets an optional default for surfaces in a production scope. References that omit it keep their existing material and appearance. Do not apply a production migration to independent brand references.

## Color and motion

Contained, outlined and text controls preserve MUI interaction semantics. Glow follows the existing control contour. Blue indicates active work, green success, amber no result or attention, and red failure. Category accents are separate from result status. Body text is sharp and never glows.

State transitions and breathing use separate effect layers. Geometry stays stable; rapid reversal continues from the presented value. Reduced motion, motion off, zero glow and forced colors retain understandable states. Default text contrast is at least 4.5:1 and visible focus remains independent of glow.

## References and validation

Structure: [ReactBits App Shell 9](https://pro.reactbits.dev/docs/app-ui/app-shell/app-shell-9). Interaction: [Prompt Input 1](https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-1). Raycast and Cursor inform compact navigation and tool chronology; Apple and Runway inform quiet reading; MiniMax informs model metadata. All are translated into Lumen semantics rather than copied palettes.

Verify light/dark, desktop/narrow, long multilingual copy, empty and paged collections, keyboard focus, source copying, state transitions and reduced motion. A static screenshot does not prove interaction or capacity.
