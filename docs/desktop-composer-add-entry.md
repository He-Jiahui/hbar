# Desktop composer plus entry, 2026-09-27

## Visual and interaction basis

The unchanged cc-haha `ChatInput` component presents a two-choice popover from
the composer `+`: **Add files or photos** and **Slash commands**. The menu is
anchored above the trigger, with its width bounded on a narrow viewport. The
reference images are renders of that original component in a synthetic session,
not proof of the complete original Electron Host:

- [cc-haha component at 1440](../artifacts/desktop-final-entry-audit/conversation/reference-plus-en-US-1440.png)
- [cc-haha component at 320](../artifacts/desktop-final-entry-audit/conversation/reference-plus-en-US-320.png)

Before this change, hbar's `+` was a `LumenFilePicker`: clicking it immediately
opened the system file chooser. Typing `/` already opened the local command menu,
but the composer gave no visible route to discover it. The new hbar menu uses the
same two-choice hierarchy and keeps the popup attached to the composer trigger:

- [hbar, English 1440](../artifacts/desktop-composer-add/add-menu-en-US-1440.png)
- [hbar, Chinese 320](../artifacts/desktop-composer-add/add-menu-zh-CN-320.png)

The hbar menu uses an opaque surface because the surrounding frosted composer is
translucent; text underneath must not show through the choices. Both entries
remain in ordinary flex flow inside the evidenced trigger-owned overlay.

## Behavior and limits

The file choice invokes the existing bounded attachment intake, upload and
recovery contract. The Slash choice requests a `/` insertion from the existing
CodeMirror editor and focuses its existing completion list; it does not create
another command implementation. Its available entries are a bounded,
Host-capability-dependent subset of hbar's current slash catalog, not a claim
that every cc-haha command is implemented. Local slash actions are recognized
only when the entire composer text is the command; inserting one inside other
draft text does not silently execute it.

The later `c132676` follow-up keeps this choice available with editable text,
file mentions, attachments or an in-progress attachment transfer. The insertion
follows the caret, adds a leading separator when necessary and moves a
programmatically placed caret out of a mention atom before insertion. Escape
closes completion while preserving the inserted `/`, other draft content and
focus, without submitting a Run. The menu still requires the active editor's
session/files capability, a connection and a usable timeline/draft state. Escape
closes the plus menu itself and returns focus to `+`; outside pointer input
closes it without changing the draft. Opening a standalone `/model` from the
editor focuses the model search field, just like opening from its trigger.

The current hbar screenshots and interaction assertions came from the production
web bundle with an isolated temporary Host, not a physical Tauri window. The
Playwright test exercised English and Chinese at 1440 and 320, file selection,
slash completion, focus return, outside dismissal, draft preservation, zero
unintended Runs and no horizontal page overflow. The later follow-up's serial
real-Host `e2e/composer-add-menu.spec.ts` passed 2/2, with focused mention/slash
unit tests 8/8. Its [English open menu](../artifacts/desktop-composer-add/inline-slash-en-US-320.png)
and [Chinese post-Escape composer](../artifacts/desktop-composer-add/inline-slash-escaped-zh-CN-320.png)
show the narrow menu and the retained, unobscured attachment chip respectively.
The menu temporarily overlays nearby composer content; DOM visibility while it
is open is not proof that the attachment is visually unobscured. This evidence
does not claim native file-dialog behavior beyond the browser file chooser
contract.
