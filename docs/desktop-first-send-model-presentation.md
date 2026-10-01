# First-send model entrance consistency

This is a focused UI delivery, not a full desktop-parity or native-window certification. Changes are confined to the isolated `codex/session-launch-target` worktree. The dirty primary checkout and the read-only CC source were not changed.

## Reference and observed difference

The original CC `desktop/src/components/controls/ModelSelector.tsx:250` uses a mobile sheet only for a narrow browser, not a narrow desktop runtime. Its `:597-604` search field uses the original `SearchField`, with a magnifier and a separately labelled clear action. Root inspected the original component's new captures:

- [Wide search with clear](../artifacts/first-send-model-reference/screenshots/en-us-1440x960-desktop-query-with-clear.png)
- [Narrow desktop-runtime branch](../artifacts/first-send-model-reference/screenshots/zh-cn-320x800-desktop-open.png)
- [Narrow mobile Web branch](../artifacts/first-send-model-reference/screenshots/zh-cn-320x800-mobile-web-open.png)
- [Source, transitions and fixture boundary](../artifacts/first-send-model-reference/manifest.json)

These mount the unmodified original component and theme at CC revision `e28d0a653481ef41b7a329411eeb2f0fd5656731`, using three synthetic controlled model records. The narrow desktop case changes only the in-memory browser Host's desktop flag. It proves the component branch, not an Electron application or native window. No original Host, profile, provider, OAuth or paid model was used. Material Symbols did not activate in this fixture; some check/close/chevron ligatures are fallback text. The Lucide search/clear glyphs rendered normally.

At hbar `e8d639ec`, the existing Session picker already accepted a Host-owned `native | web` presentation. The no-Session first-send picker did not: it unconditionally became a sheet below 40rem and focused Close solely by width. Its search lacked the same explicit clear affordance. History confirms this was the separate first-send implementation, not a recent deletion from the Session picker.

## Delivered behavior

- The Web Host passes the same native/Desktop context to both entrances. The first-send `menuPresentation` prop defaults to Web for existing reusable consumers. Only narrow Web presentation uses the full-width bottom sheet; narrow desktop presentation retains a trigger-owned, viewport-constrained menu.
- Desktop search receives focus, including a narrow desktop window. A narrow coarse-pointer Web sheet instead focuses Close to avoid invoking the soft keyboard before the user chooses search. Local `/model` open requests use the same rule.
- Search has a semantic small magnifier, typed Host-localized clear label, and clear action that restores search focus and the 60-row initial window. Provider groups, the selected check, model-ID search and the off-page selected-row bound are preserved.
- Arrow Down from search enters the first available choice; choice arrows/Home/End move inside the current visible choices. Enter on a choice confirms locally; Enter in search does not submit the composer. This is hbar internal entrance consistency, not a claim that CC's original model selector provides that arrow-key behavior.
- The evidenced menu shell alone is positioned from its trigger. Search, headings and rows remain ordinary flex flow. The menu remeasures on viewport resize/scroll and has a content-limited maximum size. The mobile-sheet layout guard remains path- and exact-container-scoped; its self-test rejects positioned descendants and other files.
- Canonical model/thinking writes and first-send transactions are unchanged. The user's chosen empty-Session Workspace-move rule remains the previously delivered `f7065019`: preserve the displayed model and thinking selection, without changing target Workspace defaults.

## Proportionate verification

Final production Web bundle: `artifacts/first-send-model/web/assets/index-ByTPSwXZ.js` and `index-BhtZGGeS.css`, 3,353 modules. The build passed with the existing large-chunk warning; this is not a performance certification.

The final real temporary-Host run passed **4/4 tests in 13.2s** (`test-results/first-send-model-v3`): two-locale model search/clear/keyboard selection/Escape/draft preservation and two existing first-send thinking confirmation flows. Model-only paths created no extra Session or Run and had no page errors. The thinking paths intentionally send to the local mock provider and verify the confirmed effort on the first Run. English uses 1440px and Chinese 320px. Root inspected the final [wide search](../artifacts/first-send-model-reference/hbar-e2e/en-US/selected-model-id-search.png) and [narrow Web sheet](../artifacts/first-send-model-reference/hbar-e2e/zh-CN/selected-model-id-search.png).

Root also ran and inspected the current TSX/Lumen component with its real `menuPresentation="native"` prop: [wide](../artifacts/first-send-model-reference/screenshots/hbar-en-us-1440x960-native-query-with-clear.png) and [320px anchored menu](../artifacts/first-send-model-reference/screenshots/hbar-zh-cn-320x800-native-query-with-clear.png). The two normal flows confirm automatic search focus, query/clear, Arrow Down/Enter selection and Escape return. Its synthetic choice state and Host-owned locale bundle do not connect to a Host or represent a physical native window. The final combined capture produced 7 states, no capture/page/console errors and no blocked external requests; its owned Vite server and browser closed, and ports 49146/49147/49148 were no longer listening.

The pure choice/model suite passed **4 tests / 12 assertions**. The affected App/first-send/test dependency graph passed strict TypeScript; scoped TS/JS ESLint, Prettier, content/icon/flow guards and the flow guard self-test passed. The existing SSR component test's required copy fixture was updated, but SSR was not run because the previously documented app-ui `prop-types` resolution limitation remains; no dependency was installed. Native/full-repository checks were not run.

Failure records: the first scoped lint invocation included a stylesheet and therefore failed on ESLint's ignored-file warning; the corrected TS/JS-only invocation passed and CSS was checked by its applicable guards. The new qualified mobile-shell selector initially failed the flow guard until its exact existing overlay exception and non-leak self-test were updated. After the first 4/4 browser pass, an attempted extra outer search focus ring duplicated the Host field treatment; a stricter diagnostic run failed 2 model cases expecting zero inner outline. The added competing ring/reset and that abandoned zero-outline ownership assertion were removed, retaining the Host's existing visible focus behavior. The original functional assertions were not weakened, and the final 4/4 pass uses the final bundle. The preview logs report WebSocket `ECONNRESET` during fixture Host teardown; no zero-warning claim is made.

## Current adjacent audit

Independent gpt-6-luna/max reviews found no new confirmed high-priority Goal/Plan entrance defect in the latest code. The in-flight `HbarPlanExitDecision` and `plugins/plan` `exit_plan_mode` approval continue the same captured Run; completed `proposed_plan` text has a distinct detached-Run action. They must not be conflated into a missing in-flight workflow. Existing Goal replacement/clear confirmation is an intentional safety guard.

CC organization modes remain a separate incomplete slice. The delivered activity query already supports accurate recent-project ordering across all unarchived Sessions within its bounded pages. A name-order entrance is not yet delivered, and global display-name ordering needs an appropriate Host page contract. Time organization needs a cross-Workspace Session timeline query; the current per-Workspace query and expanded-group cache cannot be presented as a global timeline. No placeholder organization choice was added. The overall desktop-experience goal remains active.
