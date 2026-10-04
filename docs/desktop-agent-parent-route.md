# Parent-session Agent entrance

This user-approved slice replaces the composer-only direct child dispatch introduced in
`9cd48ed7`. It does not change the explicit Agent management workspace or claim that all
CC Agent profiles, Teams, foreground waiting or result aggregation have been ported.

## Reference basis

Read-only CC-haha source: `D:/Git/cc-haha` at
`e28d0a653481ef41b7a329411eeb2f0fd5656731`.

- `desktop/src/components/chat/ChatInput.test.tsx:2481-2542` demonstrates that selecting
  an Agent suggestion inserts `/agent <type> `; the configured send shortcut submits a
  parent `user_message`, not a child Session command.
- `desktop/src/components/chat/ChatInput.tsx:706-850` keeps serialized text and attachments
  on the ordinary send path. `src/commands/agent.ts:14-42` converts the request to a parent
  prompt requiring the registered Agent tool, requested `subagent_type` and exact task.
- Root inspected `artifacts/activity-agents-reference-v7/en-1440-activity.png` and
  `zh-320-activity.png`: real original CC Activity components with synthetic records,
  not a live full application. Their missing image assets are fixture limitations, not
  a reason to reproduce broken icons. The short child list uses status and navigation
  rows within its existing menu; this slice adds no new sidebar or duplicate composer card.

## Owned behavior

- Existing-session Agent suggestions remain completion-only. Invalid or unavailable profile/task input
  retains the draft with a localized nearby error. A failed initial profile read can
  be retried on Send; returning from that read rechecks the original navigation and
  draft revision. A valid `/agent` is not a local action:
  it uses the ordinary parent `composerIntent.submit` path, including images, files,
  workspace/chat references, model/thinking, permission and captured-mode checks.
- Acceptance consumes only the original draft revision. Unknown submission uses the
  ordinary Run receipt and original key, without calling direct `agent.create` or
  inventing a second Run. Legacy direct-creation recovery remains for already-owned
  Agent workspace transactions; it is not the new slash dispatch.
- The Host exposes a real registered model `agent` tool. It is not simulated by a UI
  notice or an instruction mentioning an unavailable capability. It inherits the parent
  model/thinking/approval, uses the existing Explore profile and normal tool execution
  gates, and returns canonical child identity for the existing Activity/workspace views.
- hbar's existing Agent objective contract trims surrounding whitespace and bounds the
  task at 4,000 characters. Attachments remain in the parent conversation; they are not
  silently copied into the child. The parent model may include relevant context in the
  explicit child prompt. Read-only Plan does not gain a child-creation bypass.
- Child workspace binding is not inherited by the existing Agent service. A parent
  executing in a different isolated checkout must fail clearly instead of creating
  a child against the default project path. That isolated-target migration remains
  separate; the ordinary shared-project route is the current supported scope.
- The no-tab first-send catalog was not expanded with Agent profile suggestions in
  this slice. A manually entered `/agent` remains ordinary first-send text; the new
  profile/task validation and completion evidence below concern an existing Session.
  The subsequent [first-send Agent slice](desktop-agent-first-send.md) closes that
  separately recorded gap without changing the parent-tool dispatch ownership.

## Verification boundary

- Production Web: 3,385 modules built to `artifacts/agent-parent-v31/web`,
  `index-34LmyYqg.js` / `index-BUG_tiWa.css`; the existing large-chunk warning remains.
- Registered-tool/real-Kernel tests: 8 passed / 30 assertions. They cover real model
  advertisement and gateway execution, parent model/thinking/permission inheritance,
  canonical identity, same-call idempotency and conflicting arguments, archived and
  foreign parents, settled Runs, Plan denial, instruction capacity and isolated paths.
  The duplicate-create check reuses the tool service with the same call key inside
  a live parent Run; it does not claim duplicate `toolStart` events are accepted.
- Existing Agent management/recovery, composer intent and slash tests: 44 passed /
  316 assertions. The new parent-prompt test preserves image/file attachments through
  a lost Run receipt and reconciles the original receipt without another Run or child
  command. This is a Runtime contract test, not a live network interruption test.
- Real temporary Host + current production Web: English and Chinese focused paths
  passed together, 2/2 in 13.5s. A deterministic test-only driver invokes the production Agent
  tool gateway; no paid model is used. Invalid requests retain the draft without a Run,
  completion creates nothing, Send creates one parent Run, approval gates the child,
  and Activity opens the exact child and returns to the parent with its new draft.
  The screenshots contain test-owned tasks/assistant text, not shipped demo copy.
- Root inspected the final Chinese 1440px completion menu and 320px Activity capture.
  The menu belongs to the composer; the short child row is within the existing
  pane-owned Activity scroll area. The localized heading/actions remain in view,
  long task text truncates in its row, and the real open/return flow passes without
  page errors or document horizontal overflow. No new stylesheet/icon tier was added.

Captures are retained under `artifacts/agent-parent-v31/screenshots/`:
`agent-menu-{en-US,zh-CN}-1440.png` and `agent-created-{en-US,zh-CN}-320.png`.
Changed-path strict TypeScript and ESLint (zero warnings), formatting, diff checks
and content/icon guards passed. Full-repository/native checks are not certified, and the
existing Lumen/MUI SSR dependency-resolution limitation is unchanged. No paid Provider,
user configuration, dependency installation, native startup, push or merge is part
of this slice. The broader desktop-experience goal remains active.
