# Composer running actions: reference and acceptance

## Scope and reference evidence

This unit changes only the running composer's action presentation. It does not change Run submission, queue scheduling, cancellation, permissions, or Goal/Plan routing.

The read-only reference is `D:/Git/cc-haha/desktop/src/components/chat/ChatInput.tsx`: the main action switches between Send and Stop at lines 1509–1530; the active-session submission branch queues at lines 826–835; Enter invokes that submission path at line 931. An isolated fixture imports the actual, unmodified `ChatInput`, `MentionComposer`, and controls, with local callback counters and read-only mock catalogs. It does not use the reference application's live Host.

Evidence is under the ignored local directory `artifacts/reference-ux-v2/`:

- `reference-chat-input.html`, `.tsx`, `.css`, and `verify-reference-chat-input.ts` reproduce the capture.
- `27-reference-chat-input-{idle,running,running-draft}-{1440,390,320}.png` capture nine real-component states.
- `reference-chat-input-observations.json` records no browser errors or horizontal overflow. The primary control keeps the same slot across the three states at each width: 32×32 at 1440px, 44×44 at 390/320px.
- The actual reference shows Stop while running, including with a draft. Clicking it stops; pressing Enter with a draft queues. hbar intentionally makes this otherwise hidden distinction explicit: the running draft gains a named queue action, while Stop remains the rightmost action. Enter and the named queue action have the same behavior.

These screenshots are local verification artifacts, not checked-in assets or pixel-coordinate layout specifications. Earlier `01-closed.png` and `19-running-status.png` did not capture the actual reference ChatInput action and are not evidence for this unit.

## Public component contract

`LumenPromptComposerProps.runningActions` is optional:

```ts
runningActions?: {
  submit: 'hidden' | 'queue'
  queueLabel: string
  queueTitle: string
}
```

The component consumes it only when `canStop` is true. Omitting it preserves the existing shared-component Stop plus Send behavior. The hbar workspace opts in using typed, host-owned bilingual labels and current draft content.

| State                                          | Visible actions                             | Enter in the textarea                    |
| ---------------------------------------------- | ------------------------------------------- | ---------------------------------------- |
| No active Run                                  | Send                                        | Existing normal submission               |
| Active Run, empty or whitespace-only draft     | Stop                                        | No submission and no cancellation        |
| Active Run, text or attached artifact          | Add to queue, then Stop                     | Same submission callback as Add to queue |
| Submission blocked, uploading, or disconnected | Queue disabled where present                | No submission                            |
| Cancellation pending or uncertain              | Stop disabled through existing action state | No cancellation shortcut                 |

An attachment-only draft can queue. Upload-in-progress and attachment recovery guards remain owned by the workspace. Stop still targets `currentSessionRun` and its existing `operation.cancel` command, not whichever Run was most recently queued. No additional direct Host calls or alternate submission state are introduced.

The queue label wraps naturally; the right-hand action group uses bounded flex wrapping. At narrow widths model/usage controls and queue/Stop may form separate rows without removing controls. An initial screenshot revealed Stop being clipped despite Playwright `toBeVisible()` passing; the final regression additionally checks the control's viewport bounds and the action group's scroll width.

## Verification

- Shared component: 10 interactive Vitest tests cover legacy compatibility, idle Send, running empty draft, queue click/Enter equivalence, Stop ordering and independent callback, Shift+Enter, attachment-only content, translated long labels, pending cancellation, and submission blockers.
- Existing hbar workspace/run-activity/design-system suites: 17 tests, 111 assertions passed.
- New production `e2e/composer-running-actions.spec.ts`: two tests passed, one per English/Chinese locale. A real Host and local-fixture `write_file` approval keep the original Run active; Enter and keyboard activation of the queue button enqueue exactly two additional Runs. Stop cancels the original approval-blocked Run, both queued Runs then complete, the target file is not created, and idle Send returns. No fake approval or receipt states are used.
- Production screenshots cover empty/drafted states at 1440, 390, and 320px in both locales. Their current local path is `artifacts/plan-proposal-v2/running-actions-results/composer-running-actions-c-{c3554-eues-drafted-messages-en-US,1dfda-eues-drafted-messages-zh-CN}/running-{empty,draft}-{locale}-{width}.png`.
- `artifacts/reference-ux-v2/28-hbar-running-actions-long-320.png` and `verify-running-actions-preview.ts` separately verify a long host-supplied Chinese queue label at 320px, visible Stop, native keyboard activation, and empty Enter no-op. This is an actual shared-component fixture, not the production Host test.
- Root TypeScript, scoped hbar lint, content/icon/flow guards, and new shared test/config lint passed. Shared TypeScript passed using the one-shot pnpm compatibility flags below.

Shared commands use the repository's required pnpm runner. The installed pnpm is 11.19.0 while the shared repository declares 12.3.4, so normal `pnpm -F @lumen/app-ui typescript`, `pnpm proptypes`, and `pnpm docs:api` are blocked by the engine check. TypeScript and the focused tests were run without changing repository configuration:

```text
pnpm --config.engine-strict=false --config.manage-package-manager-versions=false --config.verify-deps-before-run=false exec tsc -p packages/lumen-app-ui/tsconfig.json
pnpm --config.engine-strict=false --config.manage-package-manager-versions=false --config.verify-deps-before-run=false exec vitest run --project node:@lumen/app-ui packages/lumen-app-ui/src/session-composer.test.tsx
```

The existing `session-components.tsx` shared ESLint baseline contains seven `no-nested-ternary` violations and one `default-case` violation. Running the same command against the current file and the pre-change HEAD confirms the same eight violations; this unit adds none. API-generation commands remain unverified because of the pnpm engine mismatch. The complete repository gate is coordinated separately after the parallel attachment unit becomes stable.
