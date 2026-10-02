# Empty-session workspace move

The empty Session Location picker now offers registered Host workspaces as move targets. It reuses the pre-session directory list, search, and 100-row cursor contract; choosing another workspace does not call app.setSession from React or copy a composer draft into component state. The Runtime owns the captured draft and the navigation/tab transition.

The interaction follows CC's empty-session replacement boundary in `desktop/src/components/chat/ChatInput.tsx`:638 (`replaceEmptySession`) and :684 (`handleLaunchWorkDirChange`), with `RepositoryLaunchControls` providing the Directory row. The review captures live at `D:/Git/hbar/artifacts/ui-reference/cc-haha-runtime/repository-launch-audit-20260929/component-reference/captures-styled-flow-20260929/desktop-1440x900-repository-root-open.png` and `mobile-390x844-repository-root-open.png` are styled-flow captures backed by `mockedStore`, not a complete native Host execution. They show the desktop root popover and narrow bottom sheet used as layout evidence.

The UI captures the canonical state.drafts[sourceSessionId].revision immediately before sessionWorkspaceMove.move. A command result only advances the picker after the Runtime reader reports status: succeeded; failed preflight and incomplete recovery stay on the current Session. Operations are indexed by their source Session ID, so the visible Location also searches targetSessionId when the replacement tab is active.

Pending progress, failure, confirmation, and recovery actions render beside Location. CONFIRMATION_REQUIRED asks the user to explicitly confirm Allow permission mode. UNRESOLVED_MENTIONS_CONFIRMATION_REQUIRED shows the unresolved count and separately asks whether to keep those visible tokens as plain text. When the target Session already exists, Continue resumes the source-keyed operation instead of creating another Session. Continue and Cancel call the Runtime commands; neither simulates a tab change.

While an operation is busy, unknown, or paused—or a partial operation has already created a target—the composer locks text editing, Send, attachment intake/removal, model/thinking, permission/Plan, and agent entry. A terminal preflight failure with no target leaves the source draft editable and allows an explicit retry.

Compared with the CC replacement path, Hbar copies the confirmed canonical draft, remaps file mentions against the target Workspace, archives rather than permanently deleting the old Session, and starts the target with its default branch/location instead of inheriting the source branch reference.

e2e/session-workspace-move.spec.ts covers two normal real Host flows: desktop English carries a confirmed file attachment, a target-resolvable file mention, model/thinking, and Plan mode into the replacement Session, then Sends once and checks the target run plus untouched source; narrow Chinese carries an unsubmitted local Goal intent and checks the responsive target path. These two cases do not claim failure/recovery matrix coverage.

## Verification record

The production Web build passed to `artifacts/session-workspace-move/web` (JavaScript asset `assets/index-B0j9JECy.js`, stylesheet `assets/index-BeA99X64.css`). Vite emitted its existing bundle-size advisory because the minified JavaScript chunk is larger than 1.5 MB.

The scoped strict TypeScript, ESLint, Prettier, content-contract, reference-flow-layout, icon-scale, Runtime workspace-boundary, and `git diff --check` gates passed for the changed paths. The full-repository `bun run typecheck` was also attempted, but the repository has unrelated existing type failures in `apps/hbar-app-ui-preview` fixture/model code and unresolved `@lumen/app-ui` imports in existing tests; the changed UI paths pass the scoped strict TypeScript check.

The final production-preview E2E run passed both cases in `e2e/session-workspace-move.spec.ts` (2 passed). The desktop case verified the first Send against the temporary Host snapshot: the target run contains the remapped target-relative mention, Plan mode, and the same Host-confirmed attachment ID, while the archived source has no user run. The narrow Chinese case verified the draft and unsubmitted Goal intent remain on the replacement tab without horizontal overflow. The existing `e2e/session-launch-location.spec.ts` regression also passed both cases (2 passed; shared-branch Send and isolated-worktree Goal) against the same production asset.

Captured screenshots are under `test-results/session-workspace-move/`:

- Desktop: `session-workspace-move-des-43e7a--a-replacement-Host-Session/location-root-1440.png`, `project-list-1440.png`, `move-success-1440.png`, and `send-result-1440.png`.
- Narrow Chinese: `session-workspace-move-nar-e4966-or-retaining-the-source-tab/location-root-390.png`, `project-list-390.png`, and `move-success-390.png`.
- Existing Location regression output: `test-results/session-workspace-move-launch-regression/`.

These checks exercise the production Web preview with temporary real Hosts, not the native desktop/Tauri shell. They cover the two stated normal move paths and do not establish the unrun confirmation, failure, cancellation, or recovery matrix. The CC reference images likewise remain mocked styled-flow evidence, not native runtime captures.
