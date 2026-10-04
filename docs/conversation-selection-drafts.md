# Conversation selections in Session drafts

A selected passage from a loaded user or assistant message can be added to the current Session draft as a `chat-selection` context. The persisted context records the source Session ID, message ID, source role, quote, and context ID. It has no workspace path or line range; its source identity remains explicit when a draft is carried elsewhere.

`draft.addConversationSelection` accepts the target draft Session, source message ID, expected authored text, visible quote, and expected draft revision. The runtime reads the source only when navigation is idle on that Session and its timeline is ready for that same Session. The message must still be loaded, retain the requested identity, and have a `user` or `assistant` role. Missing, unloaded, mismatched, or changed source messages are rejected without changing the draft. Tool and system messages are not accepted.

The expected-text value is a transient stale-source fence: it must exactly match the source message's `text` content blocks joined with `\n\n`. It is not stored in the context and is not sent as additional Run material. Thinking blocks, tool calls/results, and image/file attachments are not included. The quote is the text selected from the rendered message; because rendered Markdown is not the authored Markdown source, the runtime does not claim to prove character offsets or that the quote is a literal substring of the authored text.

Chat selections use the shared 12-context limit, 20,000-character quote limit, and 200,000-character serialized composer limit. They serialize under `Referenced chat context:` with an encoded `chat://` address containing source Session, role, and message identity. File selections and comments keep their existing `Referenced workspace context:` format. Context deduplication includes source Session, message, role, and quote. The generic `draft.addWorkspaceContext` command remains limited to file-backed input; `draft.setWorkspaceContexts` accepts persisted chat contexts for carrying an existing draft snapshot.

Conversation quotes are Run context, not Goal objective text. The existing accepted-Run draft clearing behavior applies to them as it does to other draft context.

## Verification

The focused Runtime, Goal intent, localized context-copy, and Workspace move suites passed together: 37 tests and 252 assertions. Scoped strict TypeScript, ESLint, and Prettier checks passed for the changed core and context-card dependency graphs. The context card accepts message sources without a fabricated file name or range; the selection menu itself is a separate follow-up implementation.

The production Web build passed with output in `artifacts/conversation-selection-core/web` (`index-C1ap2ZMV.js`, `index-DTf7FUNR.css`). The build retained its large-chunk warning. Content-contract and semantic icon-scale guards passed for the context card. This core stage did not claim a browser-level selection interaction or a native desktop build.

A broader check also ran `tests/prompt-drafts.test.ts`. Its existing attachment-upload test failed at its immediate `uploading: 1` assertion (the observed value was `0`), followed by an unresolved pending command during disposal. The attachment implementation and that test were not changed here. This is not reported as a proven baseline failure or as a passing full draft suite.
