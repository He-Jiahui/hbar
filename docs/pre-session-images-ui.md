# Photos in the first-send composer

The no-tab composer now displays confirmed photos as the same image tiles used
by a Session composer. The same named Open control opens the shared gallery;
Escape closes it and returns focus to the photo. Files remain removable name
chips, photos keep their own remove control, and the attachment group stays
above the editor in wrapping flow.

The Web composition root passes its existing `images.resources` capability into
the no-tab image layer. It does not create another decoder, cache or ObjectURL
controller. The React model scope has an explicit pre-session draft owner and
subscribes to its canonical Runtime state. Text-only revisions reuse confirmed
photo resources; removal, source loss and selection of a real Session invalidate
the local preview. Gallery and thumbnails retain/release the existing ephemeral
resource leases, not URLs stored in draft business state.

## Visual basis

CC `e28d0a653481ef41b7a329411eeb2f0fd5656731` places its original
`AttachmentGallery` above the editor in `desktop/src/pages/EmptySession.tsx`:733,
just as its Session `ChatInput` does. The original-component fixture
[narrow gallery reference](D:/Git/hbar/artifacts/composer-attachments/reference-gallery-narrow.png)
shows file entries and a composer photo tile in ordinary wrapping flow.
The fixture uses original CC component/theme code and synthetic attachment data;
it is not a native CC Host test. That particular fixture's photo is blank, so it
supports layout and entry placement, not successful decoding of a real photo.

Hbar's final captures use the production Web bundle and an isolated temporary
Host with an original generated colored PNG fixture:

- [Desktop composer](../artifacts/pre-session-images/plan-en-US-1440.png).
- [Narrow Goal composer](../artifacts/pre-session-images/ready-goal-zh-CN-320.png).
- [Open gallery](../artifacts/pre-session-images/gallery-goal-en-US.png).

Root inspected the desktop, narrow Goal and open-gallery images. No fixed
screenshot coordinates or new content positioning were used; the existing
composer, tile and gallery layout styles are reused.

## Verification

Production bundle: `artifacts/pre-session-images/web`, `index-vog1mDoz.js` and
`index-CNnIh6g1.css`. The browser is headless Edge; the actual Host artifact upload
and authenticated read endpoints are exercised, while the provider driver is a
local fixture and makes no paid model call.

- First-send Plan/Goal acceptance: **2/2 passed**, each exercising English and
  Chinese at desktop/narrow widths. Confirmed PNG decoding, gallery opening,
  Escape/focus return, no early Session/Run creation, and unchanged file/image
  artifact references in the first accepted Run.
- Existing Session image-viewer regression: **2/2 passed**, English and Chinese,
  including its existing 1440/900/320 layout checks.
- Local draft React image-scope test: **1 passed, 12 assertions**, using canonical
  commands to verify text-edit reuse, gallery opening and removal cleanup.
- Runtime projection/viewer/thumbnail regressions: **71 passed, 479 assertions**.
- Scoped strict TypeScript, ESLint, Prettier and content/icon guards passed.

The initial browser attempts stopped at two incorrect test assumptions that a
composer tile would have visible filename text or a named child image. The shared
tile intentionally gives its named Open button the accessible name and treats
the inner bitmap as decorative. Acceptance now checks that actual named control
and decoded bitmap; the product code did not need a fix for those assertions.

This is production-Web evidence, not a native Tauri window/file-dialog run. The
full repository typecheck was not rerun; its unrelated baseline issues are not
claimed fixed by this work.
