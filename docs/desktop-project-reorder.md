# Desktop project movement: CC-haha reference migration

## Reference and entrance

Read-only reference: `D:/Git/cc-haha`, commit `e28d0a653481ef41b7a329411eeb2f0fd5656731`, original `desktop/src/components/layout/Sidebar.tsx`. Root inspected its actual exported Sidebar in the existing isolated fixture, with three synthetic projects, seven Sessions, and an in-memory preference receipt. A native browser mouse drag moved the last project before the first and changed the original persisted manual order. Captures and source/interaction manifest are under the ignored `artifacts/project-drag-reference-v6/` directory. No CC source or real profile was changed. The reference font has existing Material Symbols fallback ligatures; it is not full-native pixel evidence.

The original project title is the drag handle, and the whole project section determines before/after placement. The source dims during dragging; a thin line marks insertion. Pins always stay before ordinary projects. Selecting a sort condition, including the selected condition, or choosing Project/Time clears manual order. Manual ranking takes effect only in Recent projects: the original also permits a drag in Project mode, but continues name-sorting and thus shows no movement there.

## hbar adaptation

- Recent-project titles use the same direct drag entrance and whole-section midpoint. There is no extra grip row or toolbar. Project and Time views do not expose ineffective dragging.
- A flow border marks before/after placement without overlay coordinates or changing section height during the gesture. The source uses the same dimming cue. Existing Lumen theme and semantic icons are retained, rather than copying the CC color palette.
- The existing project More menu also offers typed, host-owned English/Chinese Move up/Move down actions for keyboard and non-drag use. The first/last item in its pin partition has the relevant action disabled. Lumen restores focus to the stable menu trigger after the action.
- Dragging does not trigger project disclosure or Session navigation. The selected Session, unsent composer text, model and thinking level remain unchanged during movement. This does not add cross-reload draft persistence.
- Pin/unpin remains the entrance for moving between pinned and ordinary sections; cross-partition drag is not accepted. Batch selection, pending pin/organization writes and unavailable preference/page state disable movement.
- Runtime owns the bounded confirmed order, not the React gesture hook. Version 2 of the existing organizer preference atomically stores mode, previous grouped mode, sort and manual order. Legacy settings are read without a migration write. The captured visible order/sort is checked before a move; failures retain confirmed order and use the existing sidebar feedback/retry.
- Manual order covers the loaded prefix only (200 projects plus 20 pin reserves); it is not a complete second roster. Unranked, newly loaded projects follow in Host order. Hidden projects remain filtered. See [Runtime ownership](sidebar-activity-runtime.md).

## Delivery and normal-flow verification

Runtime core: `8363c903`, independently committed after four Runtime tests / 35 assertions, affected strict TypeScript and scoped ESLint passed. The new Runtime flow checks persistence after owner recreation, pin sections, same-sort reset, mode restriction and unchanged navigation. Existing activity/persistence/time tests remain passing.

Final UI production bundle: `artifacts/project-reorder/web`, JS `index-wSV1ALWq.js`, CSS `index-oTsKW7fN.css`, 3,362 modules. Build passed with the existing large-chunk warning, not a performance certification. Root ran `e2e/sidebar-organization.spec.ts` plus the existing `e2e/workspace-sort.spec.ts` against those exact assets: **4/4 passed in 25.2 seconds**, output `test-results/project-reorder-final-v6`. Normal paths include native mouse drag and insertion cue, no disclosure click, keyboard menu movement, persisted order after reload, mode/sort reset, selected Session/draft/model/thinking preservation, English 1440px and Chinese 320px menu bounds, and the previous organization/time/sort regressions. The temporary real Host uses only synthetic data and a mock Run that is never dispatched; no paid provider is called.

Root inspected the original reference captures and final hbar drag and wide/narrow menu images. The capture manifest under `artifacts/sidebar-organization/hbar-e2e/` identifies the final asset and both original references. The affected App/UI/Runtime/E2E graph passes strict TypeScript, scoped zero-warning lint, formatting, content/icon/flow guards and diff checks.

An intermediate combined run accidentally let the old sorting fixture serve `dist/web/index-DsK_zHOB.js`, not this feature's assets, and failed its initial order assertion. Root checked fixture environment selection and build HTML rather than changing product ordering or weakening the test. The final combined run sets both fixture asset directories and asserts both exact script identifiers. That intermediate attempt is diagnostic, not passing delivery evidence.

Native installation, full-repository typecheck and dependency-blocked SSR rendering were not run or certified in this slice. The requested luna/max subagents could not obtain a reliable filesystem/tool surface in this turn; Root completed implementation and verification, and does not count those attempts as independent review. This completes project movement, not the overall desktop-parity goal.
