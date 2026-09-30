# No-tab composer attachments

The initial landing composer can accept files and images before a Workspace is chosen. The Plus menu exposes the same Files or photos picker used by the session composer; dropping files or pasting an image into the composer uses the shared attachment intake. Attachment reservations and progress remain owned by the pre-session draft, so selecting a file does not create a Host Session or Run.

The UI shows accepted artifacts as removable composer chips and pending, failed, unknown, or ready transfers in the bounded transfer list. Text remains editable while a file is prepared or uploaded. Send stays unavailable while any transfer remains unresolved. Ordinary first-send input may contain attachments without text; a Goal first send still requires its objective text. Local slash actions are not executed with attached artifacts, so attachments cannot disappear into a local-only action.

## Normal acceptance

`e2e/pre-session-attachments.spec.ts` exercises ordinary Plan and Goal first sends in English and Chinese at 1440 px and 320 px widths. It captures the landing after attachments are present and checks that the hero and composer remain in their normal flow, the narrow page does not overflow horizontally, attachment selection does not add a Session or Run, and the first send creates exactly one Session and one Run containing the same uploaded artifact references.

The production Web build (`artifacts/pre-session-attachments/web`,
`index-FtzXXSYz.js`) and isolated temporary Host passed both tests on 2026-09-30:
**2/2 passed**, comprising Plan/Goal with both locales. The test uploads a file
and image through the actual artifact endpoint, including the Goal image drop
route, and compares all accepted first-Run artifact IDs, names, MIME types and
sizes against those upload responses. Root inspected the English desktop and
Chinese narrow screenshots. Scoped strict TypeScript and ESLint passed; the
existing broad repository typecheck remains red for unrelated Lumen/app-shell
fixtures and is not a passing gate. Native Tauri file dialogs and paid providers
were not exercised.

This was the name-chip stage of the implementation. Its screenshot paths were
refreshed during the subsequent photo-preview work, so they are not immutable
base-build evidence. Current images and gallery acceptance are recorded in
[the photo UI follow-up](pre-session-images-ui.md); the base build and test
results above remain the historical acceptance of the intake/send feature.

## Reference basis

CC `e28d0a653481ef41b7a329411eeb2f0fd5656731`
`desktop/src/pages/EmptySession.tsx` has attachment gallery content above the
editor (:733), Files/Photos beside Slash in the Plus popover (:785), paste/drop
intake (:520/:549), and attachment-only first send (:395). The observed Plus
hierarchy also appears in the unmodified original `ChatInput` component renders:
[1440 reference](D:/Git/hbar/artifacts/desktop-final-entry-audit/conversation/reference-plus-en-US-1440.png)
and [320 reference](D:/Git/hbar/artifacts/desktop-final-entry-audit/conversation/reference-plus-en-US-320.png).
Those images use original component/theme code with synthetic stores and no CC
Host; they are not full native EmptySession screenshots or current hbar evidence.
The hbar landing retains ordinary flex flow, with the shared drop overlay scoped
only to the composer footer rather than covering the welcome hero.

Run it through the coordinated full-app E2E preview after that preview is built, with ports unique to the active workspace task:

```powershell
$env:HBAR_E2E_PORT = 49006
$env:HBAR_E2E_HOST_PORT = 49007
$env:HBAR_E2E_PREVIEW_DIST = 'artifacts/pre-session-attachments/web'
bun run test:e2e -- e2e/pre-session-attachments.spec.ts
```

This acceptance covers the normal intake/send path; it is not a claim that unsupported upload capabilities or transport failures are available on every Host.
