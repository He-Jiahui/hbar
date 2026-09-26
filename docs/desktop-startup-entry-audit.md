# Startup Settings entry: pending identity to confirmed Host

Audit date: 2026-09-25. Source baseline: hbar `a56414a5f3d34dcbb8a2daefefe82151a6d0ce57` plus the existing worktree; cc-haha reference source `e28d0a653481ef41b7a329411eeb2f0fd5656731`. This audit did not edit product code, stage or commit. Other dirty runtime/plugin/desktop files were left untouched. Line references describe the source inspected at this baseline.

## Finding

An early Settings interaction is valid and available while the app is connecting, but the first successful Host identity resolution replaces its runtime. The Settings page disappears. Reopening restores its last category, not its original page or Appearance draft. The independent device-language owner survives.

There is a second observable persistence problem: explicitly saving Appearance before that identity resolution reports success and writes the temporary `pending:<origin>` preferences namespace. Once the real Host ID is known, the replacement runtime reads a different namespace and the saved appearance is no longer applied. The old temporary key remains; this is not an automatic migration or a failed localStorage write.

## Actual production-UI reproduction

The ignored reproduction uses the **original production App**, not a recreated Settings component. A new production bundle was built from the inspected tree into `D:/Git/hbar/artifacts/desktop-entry-matrix/startup-entry/web`; its JavaScript asset is `index-b_NtOiYK.js`. Vite preview used port 45067. A temporary demo Kernel/Host used port 45065 and its own temporary directory, with Goal auto-continuation disabled. No Run or Provider configuration was submitted. The existing Host helper initializes its demo session/model/budget; this does not establish commercial Provider capability or access user data.

The only transport fixture is a Playwright WebSocket gate. It forwards the actual UI `system.hello` request to the real Host, holds its actual response, and releases that same response unchanged after the real UI interaction. Every other business response is forwarded unchanged. It does not synthesize Host identity, catalog, preferences or Settings data. The Client therefore still displays connecting/Loading while the user opens Settings. This is a controlled handshake-delay reproduction, not a claim that the unmodified local Host ordinarily takes this long.

Final run: **16 reproduction scenarios completed**, English/Chinese × 1440/320 × four variants. The response was held for only **326–676ms** after receipt. Each before screenshot still shows the connecting state; the script does not wait for connected before clicking Settings. Zero browser page errors and zero Host Runs were observed. These are successful reproductions of the defect, **not passing acceptance tests for preserved navigation**.

| Variant                   | Before releasing the actual handshake                                      | After release                                                                                                     | After the user explicitly reopens Settings                                                            |
| ------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| General                   | Settings mounted, General selected; switch to the other supported language | Settings count 1 → 0, original DOM node disconnected; document language and dedicated saved language value remain | General restored and language remains selected                                                        |
| Providers                 | Settings mounted, Providers selected; no add/edit/save action              | Settings count 1 → 0, original DOM node disconnected                                                              | Providers restored after its real schema finishes loading                                             |
| Appearance, dirty         | Dark, small controls and large text selected; Unsaved visible; no Save     | Settings count 1 → 0, original DOM node disconnected                                                              | System theme, medium controls/text, no Unsaved marker: original draft lost                            |
| Appearance, explicit Save | Dark/small/large confirmed locally with Saved feedback                     | Settings disappears; pending preferences key remains                                                              | System/medium/medium, with neither Saved nor Unsaved; saved values were not read from the pending key |

The saved variant wrote this temporary key, with a real revision-3 envelope:

```text
hbar:web:hbar:pending:http://127.0.0.1:45067:preferences
value = { theme: "dark", "appearance.controlSize": "s", "appearance.textSize": "l" }
```

The report records this harmless fixture-local value; it does not record pairing tokens or Provider secrets. Reopening Providers initially renders before its schema is ready, so a native select can briefly show its first available client option. The final report waits for the actual Providers value before sampling; it does not misreport that transient read as lost category persistence.

Evidence and harness, all ignored:

- `D:/Git/hbar/artifacts/desktop-entry-matrix/startup-entry/reproduce.ts`
- `D:/Git/hbar/artifacts/desktop-entry-matrix/startup-entry/verification.json`
- `D:/Git/hbar/artifacts/desktop-entry-matrix/startup-entry/appearance-en-US-1440-before.png`
- `D:/Git/hbar/artifacts/desktop-entry-matrix/startup-entry/appearance-en-US-1440-after.png`
- `D:/Git/hbar/artifacts/desktop-entry-matrix/startup-entry/appearance-en-US-1440-reopened.png`
- `D:/Git/hbar/artifacts/desktop-entry-matrix/startup-entry/general-zh-CN-320-before.png`
- `D:/Git/hbar/artifacts/desktop-entry-matrix/startup-entry/general-zh-CN-320-after.png`
- `D:/Git/hbar/artifacts/desktop-entry-matrix/startup-entry/appearance-save-zh-CN-320-{before,after,reopened}.png`

Desktop and narrow screenshots were manually inspected. They show the Settings/Appearance page being replaced by the Select a session empty state, not merely covered by another overlay. At 320 the real hbar mobile group selector was used; no hidden desktop button was force-clicked.

The initial audit-harness attempt timed out because a generic snapshot waited for an Appearance element while General was selected. The fixture was corrected to make absent optional surfaces a non-waiting observation, and the final matrix was rerun. That harness error is not a product failure or evidence of a slow handshake.

## Source and Git evidence

- `D:/Git/hbar/apps/web/src/App.tsx:689` initializes `hostId` as `pending:${clientUrl}`.
- `App.tsx:699-700` constructs the runtime with `hostId` and includes it in memo identity. `App.tsx:766` replaces that value with the successful `system.hello` Host `instanceId`.
- `App.tsx:783` disposes the replaced runtime. `App.tsx:804` also keys workbench cleanup by Host ID. This is a deliberate Host-scoped lifecycle boundary, not an ordinary localized rerender.
- `App.tsx:706` creates the Appearance editor per runtime; `App.tsx:174-195` binds its save/read port to that runtime's commands and preferences. Reusing the editor without rebinding its captured port would still address the disposed runtime.
- `D:/Git/hbar/packages/client/src/index.ts:98-107` opens the socket, awaits the actual `system.hello`, marks connected and resolves Host info. The fixture gates precisely this response, rather than faking an offline UI flag.
- `D:/Git/hbar/packages/app-runtime/src/client-persistence.ts:119-121,224` derives the key from the creation-time `options.hostId` and persists preference writes under it. Browser adaptation prepends `hbar:web` (`D:/Git/hbar/apps/web/src/client-persistence.ts:3-14`). Removing `hostId` from App memo dependencies alone would leave reads/writes permanently bound to the temporary namespace.
- `App.tsx:93-110` separately saves the last known global Settings category under `hbar:web:last-global-settings-group`. That explains why manually reopening can restore a category even though the page and Appearance owner were destroyed. It is not proof that the original interaction survived.

History was checked before reproduction. Commit **`3b5f35b`**, `feat(web): connect command-driven workspace shell`, introduced the pending identity → confirmed identity memo/dispose chain. Its recorded validation covers the early command-driven workspace and disconnected rendering, not this delayed-handshake interaction. Commit **`80861aa`**, the device-language unit, removed locale from runtime identity and added the stable language owner; it intentionally did not remove the real Host lifecycle boundary. The current issue therefore predates the language unit. The recent per-runtime Appearance draft work correctly preserves a draft across categories/Back within one runtime, but cannot preserve it across this replacement by itself.

No historical version was checked out into the dirty worktree. The attribution is source/commit-diff evidence plus a current-tree reproduction, not a completed historical-version binary bisect.

## cc-haha reference comparison

Published images inspected:

- `D:/Git/cc-haha/docs/images/app/en/settings-general.webp`
- `D:/Git/cc-haha/docs/images/app/zh-CN/settings-general.webp`

They establish the stable Settings tab, selected General rail item, direct language options, and ordinary content hierarchy. They do **not** demonstrate a startup handshake, offline behavior or 320px acceptance.

Reference source uses a different ownership model:

- `D:/Git/cc-haha/desktop/src/components/layout/Sidebar.tsx:1461-1473` opens the stable `SETTINGS_TAB_ID`.
- `D:/Git/cc-haha/desktop/src/stores/tabStore.ts:10,116-140` owns `__settings__` and activates an existing Settings tab instead of generating a new identity per server connection.
- `tabStore.ts:462-490` snapshots the restore-start state and refuses a late restore if tabs/active selection changed meanwhile. Special Settings tabs are retained as valid. This is source evidence for protecting a user's early navigation from a late restore, not a claim that every reference async path has been live-tested.
- `D:/Git/cc-haha/desktop/src/pages/Settings.tsx:26-35,63-64,88` derives category from the independent UI store.
- `D:/Git/cc-haha/desktop/src/stores/uiStore.ts:368-370` owns/persists that category independently of Host identity.

Hbar need not copy the reference tab implementation. It needs the same observable promise: a local Settings action made during connection is not silently discarded merely because background identity discovery succeeds.

## Minimum truthful fix boundary — proposal, not implementation

Existing `system.hello` already supplies the authoritative Host identity. No new Host permission or RPC is needed. A small typed startup binding/handoff is needed at the Web/runtime composition boundary; no existing generic state-migration API should be assumed.

Recommended first independent unit:

1. Preserve **only initial endpoint-generation-owned, global Settings navigation** across the first pending → confirmed identity transition: page open/closed state, validated category, original settings panel identity and keyboard focus intent. Do not carry pinned workspace/session targets, tools, pending Host writes or receipts to another Host.
2. Keep local language in its existing device owner. Keep editable Appearance choices in a client owner that can be explicitly rebound to the confirmed runtime's preference port. Do not reuse closures targeting a disposed runtime and do not imperatively copy another feature's private store.
3. Before Host identity is confirmed, local Appearance editing can remain usable, but **Host-namespaced persistent Save/Reset must not claim a durable confirmed save**. Disable them with a typed local explanation until the real namespace can be read, or use a separately explicit volatile owner that cannot write `pending:*` keys. General's dedicated device language write remains independent and usable.
4. After confirmation, read authoritative preferences/revision from that Host namespace. Rebase a still-editing startup draft only when safe; if confirmed values differ, retain the user's choices and expose existing explicit conflict/readback recovery. Never silently overwrite stored values with a full old draft. Restore/read failure must remain distinguishable from empty defaults.
5. Guard the handoff by endpoint identity, connection generation and the user's latest page/category choice. If the user closes Settings while discovery is pending, the late reply must not reopen it. A later actual Host change/revocation is not permission to migrate Host-owned objects or unknown operations.

A possible public seam is a bounded `initialSettings` DTO for runtime construction (global section + stable panel ID) and an Appearance-owner `bind` action accepting the confirmed preference reader/mutation port and generation. This must initialize navigation before the replacement runtime is exposed to React, rather than briefly rendering an empty page and issuing a late `app.openSettings` effect that steals focus. The exact exported names are an implementation choice; the required ownership/generation semantics above are the contract. This audit has not added those APIs.

Likely touched implementation paths: `apps/web/src/App.tsx`, a small Web startup-binding owner, `appearance-editor.ts` and its typed port seam, plus a local runtime initial-global-Settings seam if required. `client-persistence.ts` may need an explicit unbound identity guard, rather than interpreting any nonempty ID as safe persistence authority. Localized readiness copy belongs to the host. This is not a proposal to add a general cross-Host state copier or rewrite all application navigation.

Acceptance should promote the ignored reproduction into focused tests: delayed real handshake while General/Providers/Appearance are open; Back/close and category changes before release; dirty dark/small/large retained; no new pending preference key; confirmed-namespace Save and reload; stored-value mismatch/restore failure recovery; endpoint-generation change; bilingual wide/narrow focus and no page flash; zero Runs, Provider mutations or commercial model requests. Actual read-only Providers queries remain permissible. Existing language, Appearance CAS/partial/unknown and connected Settings entry tests should remain green. Actual native delayed-host-start smoke is a separate gate, not proved by the browser transport fixture.

## Verification limits

The isolated production build and the controlled browser reproduction ran. No product fix, new tracked E2E, full repository check or native launch was performed by this audit. Only this document is a new tracked candidate; the fixture, bundle, reports and 48 screenshots remain ignored. The preview/Host use no user instance and no native CDP port 9441. Cleanup is verified separately when handing off.
