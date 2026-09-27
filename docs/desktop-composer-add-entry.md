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
another command implementation. Hbar currently offers only `/model` and
`/settings` as local commands, not cc-haha's entire slash catalog. To avoid
mixing a local command with an unsent prompt or attachments, this choice is
disabled until the draft is empty and editable; the disabled reason is provided
by localized Host copy. Escape closes the plus menu and returns focus to `+`;
outside pointer input closes it without changing the draft. Opening `/model`
from the editor now focuses the model search field, just like opening from its
trigger.

The current hbar screenshots and interaction assertions came from the production
web bundle with an isolated temporary Host, not a physical Tauri window. The
Playwright test exercised English and Chinese at 1440 and 320, file selection,
slash completion, focus return, outside dismissal, draft preservation, zero
unintended Runs and no horizontal page overflow. The attachment and existing
slash regression suites also passed. This evidence does not claim native file
dialog behavior beyond the browser file chooser contract.
