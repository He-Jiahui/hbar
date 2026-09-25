# Composer materials: input and recovery

This unit moves existing attachment upload capability into the composer’s local interaction flow. It does not introduce remote directory selection, media preview, or a second Run-submission path.

## Reference and implementation

The reference is cc-haha’s `desktop/src/components/chat/ChatInput.tsx`, `AttachmentGallery.tsx`, and `ComposerDropOverlay.tsx`. The gallery puts file names and per-item removal above the input in a wrapping row; the drop prompt is a real overlay of the composer, not coordinate-positioned ordinary content. Read-only fixtures rendered those original components with their original theme CSS at desktop and narrow widths. No reference Host or user workspace was opened.

In hbar, `composer-attachment-input.ts` owns bounded browser File references during intake. `composer-attachments.tsx` is a controlled Lumen view; `draft-attachments.ts` owns reservation and result transitions through the existing Zustand draft state. Host-owned English and Chinese copy lives in `apps/web/src/composer-attachment-copy.ts`. Confirmed materials reuse the existing composer chips.

- The existing picker, file drag/drop, and file/image paste share one intake path. Plain clipboard text is not intercepted or uploaded. Empty picker selection does nothing.
- Selection reserves all requested slots before SHA preparation starts. Confirmed files plus all outstanding reservations cannot exceed twelve; an over-capacity selection is rejected visibly rather than silently truncated. Invalid files remain named, removable rows without uploading bytes.
- Reservation ID, original session, owning revision, and original Run operation ID remain explicit. Typing while an upload finishes preserves both the new text and the file. Switching session does not redirect late results.
- If a Run has meanwhile advanced the draft, a confirmed late upload waits for explicit “Add to current draft” or removal. The existing Run receipt and retry semantics are unchanged.
- Known rejection is removable beside the original file. After dispatch, arbitrary exceptions, disconnection, cancellation, timeout, invalid output, and content mismatch remain unknown. There is no blind upload retry or “cancel means the Host received nothing” claim.
- Unknown recovery uses the existing authenticated `attachment.query` with the original SHA, then verifies SHA, size and MIME before attaching. A not-found result can still mean an in-flight upload, so it retains the original reservation and descriptor.
- Completed-item removal uses an expected draft revision instead of overwriting a render-time attachment array. Removing a preparing item invalidates its reservation; late preparation releases its source and cannot resurrect it.
- Twelve verbose failure rows can exceed a narrow window. Their bounded queue owns vertical scrolling inside the composer; text and action controls remain outside that scroll region. Individual cards and their actions remain flex-based and wrap naturally.

The queue and selection recovery live for the runtime lifetime, not across a browser restart. File bytes never enter Zustand. Browser source handles are released in `finally`; this unit creates no object URLs. Images have named chips only. Authenticated thumbnail/full-media reading and preview are deliberately a separate capability boundary, not an unauthenticated artifact URL workaround.

## Confirmed SDK issue

The real-Host browser test exposed a pre-existing error-boundary issue introduced with `cedaed2` (`feat(attachments): command client uploads`): the HTTP upload transport returned a typed `HbarError`, but the command registry converted that class to generic `EXECUTION_FAILED`. Even an explicit `UNSUPPORTED_TYPE` rejection therefore appeared uncertain and had no safe removal path.

The attachment adapter now translates only that typed transport error to `CommandError`, preserving its code. Arbitrary errors remain generic and are treated conservatively as unknown. Tests cover both known rejection and uncertain response loss. The command registry’s general error policy was not changed.

## Verification

Validated on Windows with Bun 1.4.0:

- Focused runtime, React content, browser source, existing prompt/session workspace, and migration inventory suites: 27 tests, 324 assertions passed.
- Production build using an isolated `artifacts/composer-attachments/dist` output passed.
- Real Host Playwright: English and Chinese flows both passed, including file drop, image paste, untouched text-paste handling, actual upload before lost response, read-only recovery without a second upload, known rejection and removal, twelve/over-twelve capacity, and late response across two sessions. Four widths were exercised per locale: 1440, 980, 480, 320. No page errors or horizontal viewport overflow were observed.
- Desktop/narrow reference and product screenshots were manually inspected. Runtime state tests separately cover preparation cancellation, stale revisions, metadata mismatch, not-found recovery, and an intervening Run generation.
- Focused strict ESLint and repository TypeScript check passed. Content, icon and flow guards passed; the design-system and workspace boundary suites passed five additional tests (ten assertions). Final formatting and diff checks passed.

The browser fixture uses temporary Host roots and ports 44717/44729 for the isolated run. It does not read or modify user project files, start a paid model, or close any user process. Screenshots and fixture build configuration stay under ignored `artifacts/composer-attachments/`; committed behavior coverage is `e2e/composer-attachments.spec.ts` and the focused test files.
