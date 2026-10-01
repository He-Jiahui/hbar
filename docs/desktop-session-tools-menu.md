# Session tool entrance hierarchy

The conversation header keeps Find and Activity directly reachable. Files retains its existing direct entrance: the default tab-bar placement owns it; layouts without that tab-bar entrance can still show the header Files action. Secondary management tools are now in a visible, text-labelled More tools menu rather than four peer icon-only header actions.

The menu has four fixed rows: Goals and plans, Child agents, Monitoring, and Session settings. Goals comes first so creating/editing a Goal is not buried behind an unfamiliar icon. The first three are toggles of the existing Session-owned panels and show a check for the current panel. Selecting the same tool still closes it. Settings remains navigation to the actual Session settings page, not a selected tool. More uses `aria-expanded` for its popup and a separate visual selected marker/title for an open secondary panel.

Activity remains an always-reachable reading hub for Tasks, Runs, Workflow and Subagents. It does not inherit Agent creation/patch actions or Goal/Plan mutations. Composer Goal/Plan/model entrances, Goal strip actions, the selected model/thinking policy, and all existing tool commands are unchanged. The menu invokes the existing captured workspace/Session/source-tab toggle and settings commands; it creates no duplicate data owner. Switching Session retires the open menu along with its old target.

## Reference evidence and adaptation

Read-only CC source is `D:/Git/cc-haha` at `e28d0a653481ef41b7a329411eeb2f0fd5656731`. Its `TabBar.tsx` exposes conditional Activity, Terminal and Files; `SessionChatHeader` expresses title/metadata/Goal rather than a second management toolbar. The shipped `docs/images/app/zh-CN/session-main.webp` shows that hierarchy. A fresh isolated original `TabBar` + `ActiveSession` render confirms Activity opening and closing beside the reading column. Captures and the synthetic-store/network boundary are recorded under the ignored `artifacts/session-tools-menu-v13/` (`cc-original-activity-toolbar.png`, `cc-original-toolbar-closed.png`, `reference-manifest.json`). Original reference files are unchanged; Host/provider requests are blocked.

Hbar's More menu is an adaptation of the primary/secondary hierarchy, not a claim that CC has this exact four-item menu or that Hbar has its Terminal/Browser capabilities. It retains Hbar's additional real management tools. The popup is a native top-layer trigger-anchored overlay; its four rows use ordinary flex flow and host-owned English/Chinese copy. Only the exact open overlay container is exempted in the flow guard, with self-tests rejecting positioned rows and the same selector in another file.

## Verification and limits

- Final Web build: 3,376 modules, `index-CPxX-ugm.js` / `index-CpCy4RwG.css`. Existing large-chunk warning is retained.
- Two temporary-real-Host browser paths pass in 9.2 seconds: Chinese primary/secondary navigation with a long unsent draft, Escape/focus, active check, toggle-close, Settings Back, natural narrow menu flow, and Session isolation; English empty Goals entry actually creates and reads back a Host Goal. No paid model or real profile is used.
- The same Chinese flow additionally confirms the direct tab-owned Files entrance remains visible; the final rerun passes in 4.3 seconds (7.0 seconds including setup).
- The new menu-position model and existing Session ownership suite pass 11 tests / 144 assertions. Scoped strict TypeScript, zero-warning ESLint, changed-file formatting, content/icon/flow guards and flow-guard self-test are checked for this slice.
- Existing E2E consumers are mechanically adapted to the actual menu entrance without dropping their business assertions. Their full button/viewport matrices are not rerun; `session-tool-navigation.spec.ts` now follows one continuous core workflow rather than repeating every tool at four widths. Existing broader workbench checks remain available.
- At the menu slice, the independently run `session-tool-visibility.test.ts` failed 2 of 16 Workflow cases: a late read returned `EXECUTION_FAILED` rather than `RESULT_UNKNOWN`, and removal dropped a Goals-owned Workflow entry. The menu did not change that Runtime or fixture. The subsequent focused [Workflow read-lifecycle repair](workflow-read-lifecycle.md) resolves both regressions and adds an Activity cache-retirement check; this historical menu result is not counted as a passing lifecycle run.
- Updated Session header SSR assertions are typechecked, not executed; the known `prop-types`/`react-is` dependency gap remains. Native packaging, installed desktop smoke and full repository checks are not run.

Root inspected the original reference and final Hbar desktop/narrow screenshots. Hbar evidence is `zh-tools-wide.png` and `zh-tools-narrow.png` under the same artifact directory. The first focused attempt used an incorrect Goal pane selector; correcting that fixture selector produced the passing flow without a product workaround. Preview teardown may log `ECONNRESET`; browser page-error assertions pass.

## Remaining execution semantics

CC queued-message Guide now sends the selected message over live `user_message` transport without cancelling the current turn (`ChatInput.tsx:1252-1262`, `chatStore.ts:2656-2697`, covered by `ChatInput.test.tsx:682-720`). Hbar's public contract has durable FIFO submission, edit/remove and cancellation, but no same-turn steering command. Cancelling and resubmitting would not reproduce CC's behavior. This remains a backend-led parity requirement, not an omitted visual button. Goal + Plan combination remains a separate user choice; this menu does not change those execution rules. Overall desktop parity is not complete.
