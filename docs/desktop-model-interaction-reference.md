# Composer model interaction: cc-haha → hbar

## Evidence and correction

The first migration (`54cd963`) made the model name actionable, but sent users to a full settings page. This differs from cc-haha's local model picker and adds navigation and a separate save step to a frequent composer action.

Reference evidence reviewed on 2026-09-24:

- `D:/Git/cc-haha/docs/images/app/zh-CN/model-picker.webp`: full application capture, model and separate reasoning entry at composer bottom-right, model menu above the trigger.
- `D:/Git/cc-haha/desktop/src/components/controls/ModelSelector.tsx`: current source, provider grouping, current selection, fixed search/header, scrolling list and responsive bottom sheet.
- `artifacts/reference-ux-v2/01-closed.png` through `09-model-narrow.png`: current original reference components rendered in an isolated fixture, not a recreation. The shell and model catalog are test fixtures; these captures do not prove real provider connectivity. `observations.json` records measured geometry.

The reference menu is a true overlay: desktop model width 360 CSS px, content-limited maximum height 420 CSS px, thinking overlay width 300 CSS px. At 390 CSS px the model menu is a bottom sheet. hbar expresses these widths as rem limits, measures only the overlay anchor, and keeps all menu content in flex flow. No screenshot coordinate layout is used for ordinary controls.

## Behavior contract

- Model and reasoning controls live beside Send, using the shared composer's `modelPicker` slot. Opening them preserves the conversation, draft, attachments and current navigation.
- Models come from Host `model.list`; provider names, IDs, capabilities and current configuration are actual contract data. There are no product demo models. The list renders 60 rows per explicit page, while search covers the contract-bounded 4,096-record catalog. Header and search do not scroll.
- Selecting a model writes the explicit originating session's configuration with baseline revisions and an idempotency key. Confirmed selection immediately updates the composer and closes the menu; no settings-page save is required.
- Reasoning is a separate discrete slider using only the selected model's supported levels. Pointer/key release commits once. It can be used without first opening the model menu.
- During a pending or unknown model write, sending is blocked. Unknown results expose a local same-key reconciliation action; repeated clicks do not start a second write. Old session/read responses cannot replace another session's state.
- Search with no matches, no configured models, read failures, unavailable configuration, rejected writes and unknown results are distinct states. Provider configuration is an explicit empty-state recovery route, not the default model-selection action.
- Escape/outside click close without selecting. Selection restores keyboard focus to the trigger. Opening search focuses the search field; Arrow Down/Up moves through model options.
- Host-provided Chinese and English labels include accessible names, capability text, errors and remaining-item counts. Long names truncate in the compact trigger but wrap in model rows and retain the full title.

## Verification artifacts

`e2e/composer-model-entry.spec.ts` exercises the real temporary Host and Web application with mock providers (no paid model traffic), covering immediate model/thinking persistence, search, 60-row page bound, draft retention, focus, cancellation and 1440/900/390/320 viewports in both locales. It writes `artifacts/reference-ux-v2/hbar-model-*.png` and `hbar-effort-*.png` for manual comparison. The scoped flow-layout guard only exempts the demonstrated popover container, not its descendants.

This document records this subfeature only. It does not claim Goal/Plan, navigation, message actions, project management or every reference interaction is already migrated. Those remain part of the broader interaction audit.
