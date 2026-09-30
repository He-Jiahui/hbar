# Session Location before the first Run

An already-created, still-empty Session uses the existing composer and the same
Location picker as the no-Session landing. The picker only replaces the
read-only project context while the Host/runtime have confirmed the Session is
empty. Its current project row is informational: this slice does not move an
existing Session to a different Workspace, because doing so would require an
explicit migration policy for that Session's complete composer draft and any
attachments in transfer.

Branch discovery and mode/branch selection are local until the first ordinary
Send or Goal Run. Selecting a shared branch does not switch the registered
working tree at menu-click time; the selected ref and observed OID are applied
by first-send preparation, immediately before the Run submission. An isolated
choice prepares a per-Session derived worktree from the selected local base.
Both paths keep the existing Session ID and use the original composer draft and
submission path rather than copying only its text into a replacement landing.
That keeps model, Goal/Plan, mentions, and attachment ownership in the existing
runtime; the browser scenarios below exercise text, not attachment transfers or
mention submission.

New Branch is an explicit exception to the local-only selection rule: pressing
Create immediately creates the named local Git ref from the captured base
commit, but does not check it out. Only an exact acknowledged result is selected
automatically. An uncertain result is reconciled by read-only ref/OID lookup;
the UI does not replay the create request. For a shared choice, the first Run
applies the new branch to the current working tree. For an isolated choice, the
first Run derives the Session's own branch from the newly created ref. The
branch-creation capability remains Host-owned and path-free at the app
boundary.

After an explicitly accepted first Run, the UI releases its local Session
launch draft and selected branch-creation projection. An unknown Run response
does not release these local records, so the user can reconcile rather than
silently treating an uncertain outcome as accepted. Later Workspace
replacement, including a full draft/attachment migration flow, is not part of
this slice.

## Reference and interaction rationale

CC-haha's `desktop/src/components/chat/ChatInput.tsx` places repository launch
controls beside the composer for the empty-session state (line 268), rather
than treating launch location as a global settings page. Its empty-session
replacement and first-send worktree handling are at lines 638–704 and 793–823.
`RepositoryLaunchControls.tsx` returns branch selection to the Location root;
mode selection and explicit branch creation close their local flow. Hbar uses
the same nearby entrance and return path while keeping its own Host-owned
launch contract and existing Session identity for branch/mode choices.

The full-app reference capture is
`D:/Git/hbar/artifacts/ui-reference/cc-haha-runtime/current/session-empty-1440x900.png`.
It shows the empty composer with the model menu closed. Component-level branch
and creation references are under
`D:/Git/hbar/artifacts/ui-reference/cc-haha-runtime/repository-launch-audit-20260929/component-reference/captures-styled-flow-20260929/`;
those use the actual CC component and theme in a synthetic composer wrapper,
not a full native application.

## Verification

The focused browser scenario is
`e2e/session-launch-location.spec.ts`: en-US desktop creates the empty Session
from the sidebar's global New Session action, then uses an ordinary Send with
a shared selected branch; zh-CN narrow layout uses the same global creation
action, an isolated base, and a first Goal Run. Each case verifies that branch
choice does not switch Git or create another Session before first Run, and that
the existing Session ID and original composer payload reach the accepted Run.
Each also checks the return to read-only project context after acceptance and
the absence of horizontal page overflow.

The implementation was verified with both focused browser cases passing
(2/2) against a real temporary Host and local fixture model, the production Web
build passing (3,328 modules; existing chunk-size warning), and scoped strict
TypeScript, ESLint, Prettier, content-contract, icon-scale, and diff checks.
These are not full-repository or installed-native-desktop verification. This
slice does not verify project-row/Ctrl+N creation, attachment/mention sends,
the separate `/agent` launch path, or browser branch creation from this newly
connected existing-Session entrance.

A follow-up boundary check after `70115ecf` caught direct command/Host-contract
imports in the new Session Location UI and the related existing launch
components. The View now imports launch DTOs and `RuntimeCommandError` through
the app-runtime public entry; the File workspace's session-target DTO uses the
same facade. No dependency rule was relaxed. The workspace boundary guard and
focused launch projection/core/branch suites passed 13/13 (72 assertions).
The separate Web composition-root test could not bundle its shared UI imports
because this checkout lacks packages including `prop-types`, `react-is`,
`clsx`, and Emotion; dependencies were not installed and that check is not
claimed as passing.
Scoped strict TypeScript and ESLint passed after the facade correction. Prettier
passed on the changed launch files; the File workspace's pre-existing two
formatting hunks were preserved so its one type-import correction does not
include unrelated mechanical edits.

Browser captures are written outside Playwright's temporary output at
`artifacts/session-launch-location/{en-US,zh-CN}/` when that focused spec is
run. They document this Hbar flow only; earlier CC reference captures used a
synthetic composer wrapper and are not evidence for a full native composer.
