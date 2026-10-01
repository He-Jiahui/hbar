# Canonical same-Run steering foundation

This is the driver foundation for the remaining CC “Guide now” composer flow, not a delivered Guide button or a queue promotion command. The production Kernel does not yet supply the new optional source. Ordinary queued Runs still follow the existing FIFO dispatcher. The overall desktop migration remains incomplete.

## Reference and purpose

The read-only reference is cc-haha `e28d0a653481ef41b7a329411eeb2f0fd5656731`. `desktop/src/components/chat/ChatInput.tsx:1252–1262` puts the labelled Guide action beside each queued message. `desktop/src/stores/chatStore.ts:2656–2697` sends that selected message through live `user_message` while the session is active, flushes pending assistant text into its transcript, and removes only the chosen queue item. It does not cancel the active task. The adjacent focused ChatInput test verifies the optimistic user message is not duplicated on completion/replay.

Root inspected the original-component queue captures `D:/Git/hbar/artifacts/reference-ux-v2/queued-cards-reference-1440.png` and `queued-cards-reference-320.png`: pending cards sit above the input, with Guide, Edit and Delete beside each item. The adjacent fixture imports original `ChatInput`, editor and controls, but supplies synthetic session/catalog data and isolated I/O handlers. Its maintained observations cover the running action slot; they do not document the later queue screenshot capture steps or prove live backend steering. Current source establishes action semantics; these historical images establish placement only. No new browser/native parity claim is made by this backend foundation.

hbar already has durable queue reads, editing, removal and FIFO dispatch (`04244d34`, `8e65c793`, `bf3adfff`, `f4636444`, `ea402c85`). Its DriverInput previously exposed only a fixed original request, authoritative `beforeRequest` rebuilding, canonical `commit` and tool/step callbacks. The pinned Pi agent loop supports `getSteeringMessages`, but PiDriver did not connect it. Cancel then submit would be a different interaction, so this foundation does not use that substitute.

## Driver contract

- `HarnessDriver.supportsCanonicalSteering` is explicit opt-in. A future Host must not infer support from the optional callback alone; existing custom drivers remain compatible.
- Optional `DriverInput.getSteeringMessages` receives the exact Session ID, active Run ID and a bounded read signal. It returns the next unconsumed canonical, **already committed** user messages in sequence order. The source owns a delivery cursor; it must not rescan compacted history as fresh input. The driver must not commit them again.
- The source owner must ensure `beforeRequest` includes those messages in authoritative history. The poll's Pi user entries only keep its loop alive; Pi continues to build the provider payload exclusively from that Host request. Attachments are hydrated once against the next request's actual model, not during polling against the prior model. It does not splice an unpersisted text queue into a second transcript.
- The adapter validates exact Session/Run, user role, positive canonical sequence, unique batch identities and admitted text/image/file content. It reuses the ordinary input's text/artifact limits, rejects empty user input, and accepts at most 20 rows per read. User providerData is ignored by the Pi user-message converter.
- Initial history and replayed steering IDs are de-duplicated. Fresh messages must advance the observed sequence. Whole batches validate before any delivery identities advance.
- Each read has a 5-second deadline and Run cancellation. Failure retires the reader: it never starts a replacement physical request, even when the source ignores abort. Logical timeout is not a claim that the old source physically stopped.
- Pi requires its poll callback not to reject. The adapter retains a failure and returns an empty poll; the Run then fails before another provider request rather than silently dropping the problem or falling back to the original prompt.
- `supportsSteeringAdmissionClosure` separately opts into the final `closeWhenEmpty` probe. A future Host must require both capabilities. Pi uses its outer-loop `getFollowUpMessages` callback only when it would naturally stop: a nonempty canonical batch continues the same Run; an empty batch requires the source to atomically close admission. Ordinary polls leave admission open during tool work. Polling-only custom drivers must not gain live queue admission by accident.
- Original tool calls settle before the following steering poll. Run cancellation and the existing bound-Goal completion stop remain authoritative. The driver does not alter approval, model, thinking, Goal/Plan mode, queued-operation state or continuation ownership.

## Verification

`tests/driver-steering.test.ts` uses the real PiDriver and local mock protocol. It proves same-Run second inference, no duplicate user commit, replay handling, no-source compatibility, Goal stop, initial/after-turn source failure, exact-owner and content rejection, empty/oversized input, cancellation and the actual 5-second ignored-abort deadline. An image-capability change between turns confirms no attachment read occurs before the next authoritative model is selected.

`tests/driver-steering.host.test.ts` uses a disposable real Kernel/Storage plus PiDriver, a localhost-only OpenAI-compatible test server and a fixture driver wrapper. It holds the first response, commits one canonical user message through the real DriverInput commit port, then exposes that message to the reader. The second actual HTTP payload contains both original and guided user messages. Storage contains one original Run, four messages (two user/two assistant), one guided message identity, and no cancellation. This proves authoritative-history integration, **not** a real queued-item promotion, admission command, receipt or production Kernel bridge.

The final driver/Host suites passed 20 tests / 90 assertions; the combined driver/Host/Goal-completion/model-context/tool-presentation run passed **39 tests / 183 assertions** across five files. Scoped strict TypeScript and zero-warning ESLint passed. Formatting passed for new/changed Pi/test files and the document; the SDK index has pre-existing whole-file formatting differences at unrelated declarations. Those were preserved after baseline comparison rather than bundled as an unrelated rewrite. Web production build still succeeds with the unchanged UI asset; the existing large-chunk warning remains. No native build/launch, paid provider, user profile, merge or push was used. An independent agent attempted whole-repository TypeScript and encountered the known unrelated preview/shared-UI resolution failures; no full-green claim or dependency installation follows from the scoped pass.

The subsequent natural-stop protocol tests passed **22 tests / 109 assertions** across the driver/Host pair. A guide arriving only at the final probe starts a second inference under the same Run, followed by an empty closing probe; failure to close admission fails the Run instead of reporting natural completion. This proves the driver handshake, not yet the production atomic storage gate. Cancellation, provider failure and Goal completion still stop through their existing authoritative paths; the Host must close its gate on those paths without treating acceptance as proof that the model read the input.

## Next required delivery

The following work is still required before exposing Guide:

1. A public exact-target queue-to-active-Run command with actor/idempotency key and queue revision, plus a durable receipt/read-only reconciliation. Edit/remove/claim/Guide races must have one winner.
2. One atomic durable transition that settles the selected queued operation as consumed/guided and commits its user message under the captured active Run. It must not later be claimed as another Run, nor be reported merely as ordinary cancellation.
3. A bounded exact-Run storage reader and Kernel bridge for supported drivers, including the final-poll/terminal race: accepted Guide input must not disappear between polling and Run settlement. Restart and disconnect need truthful recovery, not implicit replay.
4. Explicit handling of approval-waiting Runs, bound-Goal termination, attachment/context replay validation and model/permission differences. These cannot be solved by changing driver text alone or overriding existing safety facts.
5. The host-localized queued-card action and one real continuous UI flow proving selected-item scope, pending/unknown recovery, same-Run inference, untouched remaining queue and composer draft, and natural content layout.

Goal+Plan combined behavior and `/agent` parent-prompt semantics remain separate user choices. This foundation does not decide either of them.
