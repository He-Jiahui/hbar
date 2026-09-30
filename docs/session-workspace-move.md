# Move an empty Session to another Workspace

`sessionWorkspaceMove.move` transfers the canonical composer draft from a selected empty Session into a new Session in a chosen Workspace. The source remains intact until the transfer is confirmed. On success, its Session is archived so it can be restored later.

## Preconditions

The Runtime checks the source Session, target Workspace, current draft revision, Host timeline snapshot, and local timeline projection before creating anything. A move is rejected when the source has messages, Runs, approvals, user inputs, live streams, older timeline pages, a parent Session, or child agent Sessions. The Session cursor may be nonzero for creation or settings events; emptiness is based on timeline rows and `hasOlder`, not cursor zero.

The source draft must not have a submitting or unknown Run, an attachment transfer, or active upload. Existing Host Goals, prepared composer Goal submissions, unresolved model/permission/Plan writes, and unresolved first-send or launch preparation also block the move. The source draft must still match `expectedDraftRevision` when asynchronous checks finish.

## What moves

The move copies text and confirmed attachment references from the Runtime's canonical draft state. Artifact IDs are reused because they are Host-wide. Upload reservations and transfer IDs never move; finish or resolve those transfers first.

File mentions are workspace-bound. Before Session creation, the Runtime lists the corresponding parent paths in the target Workspace and confirms each exact path and file/directory kind. A matching mention receives the target Workspace ID. If a mention is missing, the operation fails before creating a Session. Retrying `move` with `confirmUnresolvedMentions: true` preserves the visible draft text and drops only the unresolved mention metadata so the user can select a new target file later.

The Runtime carries explicit Session-level model and thinking selections, the Host permission choice, Host Plan mode, and an unsubmitted composer Goal intent through their existing session-owned commands. An explicit Session model carries its effective thinking level as well. Without either a Session model choice or a Session thinking override, the destination retains its inherited defaults. An `allow` permission choice requires `confirmAllow: true`.

## Progress and recovery

The reader is indexed by source Session ID. Each entry reports the target Session ID, status (`busy`, `failed`, `unknown`, `paused`, `succeeded`, or `cancelled`), phase, error code, and unresolved mention count.

The Runtime creates the destination Session with one stable idempotency key. If the response is unknown, call `sessionWorkspaceMove.continue` with the same source Session ID; it reuses that key and recovers the same created Session. If navigation changes during the move, the entry pauses. Continue only after selecting the source or target Session; the Runtime does not take navigation back.

After a model, permission, or Plan write becomes unknown, Continue uses the existing reconcile command and checks the confirmed reader state. It does not issue another setting write for an unresolved operation. A settings read that is still unknown or differs from the captured source choice leaves the source unarchived.

The target draft is seeded before the Runtime selects the target Session. Once all draft and setting facts are confirmed, it replaces the captured source tab in place, then archives the source. After archive confirmation, the composition root releases only the source's local launch-choice and completed branch-creation owners through their existing close/cancel commands, preventing repeated moves from consuming the 32 launch-draft slots. Unresolved source branch creation must be reconciled or adopted before the move. The canonical source draft remains available under its original Session ID; no Host branch or worktree is deleted.

`sessionWorkspaceMove.cancel` stops the local workflow from starting further steps and never deletes a Session, draft, or artifact. Cancellation is logical: an already dispatched Host command or the timeline snapshot request may still finish remotely. If Session creation was in flight, continue can recover its outcome with the original key. No Run is created or submitted by this workflow.

## Verification scope

Five targeted tests exercise the confirmed draft/settings handoff, unresolved mention confirmation, pending-upload rejection, same-key Session creation recovery, and permission receipt reconciliation. The tests use typed public command clients around injected ports; they are not evidence of a real Host or installed desktop run. Scoped strict TypeScript, zero-warning ESLint, formatting, and the workspace dependency-boundary tests passed. The UI's real Host and screenshot evidence is recorded separately in `session-workspace-move-ui.md`.

The original Workspace's branch/launch choice is not copied to the destination. Already completed preparation may leave a checkout or worktree in the source Workspace; this workflow does not remove or roll it back. Unsaved Goal/Plan tool-panel forms are owned by their original tool instance and are outside this composer-draft handoff.
