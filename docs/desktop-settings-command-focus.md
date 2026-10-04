# Plugins command entry: return focus after a modal

The Plugins Settings page has a nearby **Open system and diagnostic commands** action. It opens the existing Commands palette with the `system.` filter; it does not manage plugins or execute a command by itself. This is a hbar-specific adjacent entry, not an identically named cc-haha control.

## Symptom and cause

The direct Plugins/Skills Settings entries were introduced in `39f9177`. The Plugins button opened the palette but did not own focus return. A real Host browser reproduction showed that the first Escape correctly cleared `system.` and the second closed the native dialog, leaving focus on `BODY` despite the Settings filter and trigger remaining visible. Native dialog teardown occurs after React layout effects; the Plugins content can also remount on Host updates, disconnecting the original button element. A component-local ref or an immediate `.focus()` therefore cannot reliably find the still-current trigger.

## Boundary and behavior

The button captures a return-focus request through a typed callback into the stable Web Settings composition. A persistent React ref identifies the current semantic Plugins trigger if the original node is replaced. When the exact Commands modal closes, restoration waits one animation frame for native dialog teardown, then checks the same Settings page instance, no newer modal, an unclaimed/invalid active focus, and a visible enabled trigger. If the original trigger became disabled, the group/page changed, another modal opened, or the user deliberately focused something else, the request is discarded. Failure to open the palette cancels its request.

The contextual `system.` filter is applied only to the same Commands panel incarnation after the palette's own mount-time empty-query initialization. It never reuses a stale panel or changes the generic Commands entry. A quick close or navigation invalidates the prefill guard. There is no Host write and no Run submission in this entry/return interaction.

## Verification

The real-Host browser fixture freezes the production Web asset and uses a paired, disposable Host on port 0 with one synthetic project/session. It confirms pointer and keyboard openers, both Escape steps, filter preservation, current semantic trigger focus, and no focus theft when the original trigger is disabled across English/Chinese and 1440/320px. It also captures the pre-fix `BODY` state and verifies fixture cleanup. Focused Settings, Plugins, palette, design-boundary, TypeScript and lint checks cover the local integration. Native WebView2 acceptance uses a copied release launcher and isolated temporary profile; its evidence is recorded separately.
