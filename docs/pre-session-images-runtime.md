# Pre-session image projection

The no-tab composer owns a real `PreSessionDraftState`, not a Session. Runtime image requests therefore use the discriminated source `{ kind: 'pre-session-draft', draftId, draftRevision }`; they never synthesize a `sessionId`.

`projectPreSessionDraftImages` projects only image entries already present in `draft.attachments`. It excludes files and does not treat reserved, in-flight, or unaccepted attachment transfers as confirmed image membership. The Host identity and draft ID form a stable collection identity; the revision is captured for membership checks but is not part of that identity, so a newer text-only revision can retain the same thumbnail leases.

`containsPreSessionDraftImages` verifies that a captured request still has the exact ordered image occurrences and artifact metadata from a canonical draft. `isPreSessionImageRequestCurrent` also requires that the draft remains the selected pre-session owner. These are client-side projection checks, not Host authorization.

The projection and currentness helper do not fetch or cache image bytes. A composition root can pass the same `ImageResourcePort` used by Session images to the existing bounded thumbnail and viewer owners. Those owners retain/release ephemeral image-resource leases; the draft projection stores only artifact references and does not add ObjectURLs to business state.

This document covers the runtime contract only. It does not claim that a React pre-session preview or gallery is wired into the application.

## Scoped verification

The focused image regression invocation covered the new projection/currentness tests and the existing session source, viewer, and thumbnail suites. Root reran the Runtime-only subset after review: **71 passed, 479 assertions**. The separate React scope test passed as well, but belongs to the UI follow-up. Scoped strict TypeScript, ESLint and Prettier passed for the Runtime entry closure and targeted tests. Full-repository typecheck was not rerun for this runtime-only change. UI build/browser/E2E evidence belongs to the separate follow-up.
