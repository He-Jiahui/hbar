# Durable same-Run queue guidance foundation

This is an internal StoragePort and projection foundation. It is **not yet a delivered Guide button**: the production Kernel, public command/receipt routing, Client action owner and queue-row action are still required. The overall desktop migration remains active.

## Reference and interaction target

The CC reference is the read-only `D:/Git/cc-haha` checkout at `e28d0a653481ef41b7a329411eeb2f0fd5656731`. Original `ChatInput.tsx:1180–1267` renders a bounded stack of dashed pending rows above the input, with Guide, Edit and Delete beside each message. `chatStore.ts:2656–2697` sends only the selected queued message through live `user_message`, without cancelling the active task. Its idle branch uses ordinary sending instead; this foundation addresses the **active Run** branch only.

Root inspected the original-component captures `D:/Git/hbar/artifacts/reference-ux-v2/queued-cards-reference-1440.png` and `queued-cards-reference-320.png` again during this work. They establish placement and readable narrow-screen action order. The fixture uses the unchanged CC component with synthetic session/catalog data and isolated I/O; these images do not prove a live CC backend or new hbar UI parity. No new button/viewport matrix was generated.

The corresponding hbar requirement is: choose one queued user operation, commit its canonical user content under the captured active Run, and make that queued operation unclaimable. Cancelling the current Run and resubmitting would be a different interaction.

## State and ownership

- The original queued operation ends as `guided`, with no execution start. It is neither cancelled nor independently completed.
- The guide receipt is `accepted`, not “model read”, “applied” or “completed”. It binds the exact Session, queued operation, active Run, expected queue revision, actor and idempotency key to one canonical message/event.
- The active Run keeps its identity, original request ID, model, thinking, mode and approval policy. The safe initial admission policy requires queued and active selections to agree; it does not silently migrate a differently configured operation into another execution policy.
- Only a still-queued user item with the exact current revision may be guided. Claim, edit, remove and Guide must have one durable winner. Other queue items are untouched.
- The active target must still be running in the same Session, uncancelled and owned by an open steering gate. Opening requires its durable `run.status` running boundary, not merely SQLite's non-journalled claim projection. Approval waiting and closed/settled targets are not silently bypassed.
- Admission retains the full normalized text and attachment references. It does not create demo content, alter tool permissions, rewrite Goal/Plan semantics or replace the composer draft.

## Durability and delivery boundary

A single durable `message.committed` journal fact contains the canonical user message and its queue-guidance metadata. The same Storage Worker transaction projects the message, guided operation and receipt. JSONL is fsynced before acknowledgement; orphaned journal recovery must reconstruct all three together. Replay with the same actor/key/input returns the original receipt/event without another message or sequence. Reusing the identity with different input is a conflict.

Steering gates are owned by the current Storage Worker lifetime, not restored as open after restart. This is a single-owning-Host/Worker foundation, not a distributed multi-Host admission protocol. The canonical message and receipt survive restart; they must not be automatically replayed as another Run.

The exact-Run reader returns at most 20 canonical guided user messages after its delivery cursor, in sequence order. It reads indexed persisted guidance facts rather than treating compacted conversation history as fresh input. Unread admission is capped at 20 and process-local Run gates at 4,096; settled gates retire without evicting a still-running closed owner. An ordinary empty read keeps admission open. At the driver's last natural-stop probe, `closeWhenEmpty` performs the empty check and seal under the same immediate transaction: a guide wins and continues, or the seal wins and a later guide is rejected with the queue item retained. A cursor ahead of the Session, or a final cursor that skipped unacknowledged messages, is rejected rather than falsely sealing pending input.

Driver support is explicit and two-part: `supportsCanonicalSteering` plus `supportsSteeringAdmissionClosure`. The handshake was independently delivered in `909bcd6e` and `74eccf88`. Pi poll entries only wake its loop; its next actual provider request is rebuilt from authoritative Host history, including attachment hydration against the actual next model. The driver never commits the guided user message a second time.

Cancellation, Goal termination and provider failure remain authoritative. A guide accepted before such a terminal transition may remain unread; the receipt must remain truthful and recoverable, and the original Run outcome must be reported. Acceptance is not a delivery guarantee. Natural completion is different: it must not accept a late guide after the last empty probe and silently finish.

## Projection boundary

The application timeline must validate the embedded guidance ownership before applying it. A valid fact projects the guided queue operation and exactly one user message, while retaining the original in-flight assistant stream. It must not remove live text merely because a user message was committed during inference. Queue reads refresh from this same durable fact. Malformed or foreign guidance cannot create a message-only false projection.

Host-owned Chinese/English labels distinguish guided from cancelled/completed. Stop cannot target a consumed queue operation; a stale Stop reconciliation must report its actual guided terminal state instead of claiming cancellation.

## Verification and remaining delivery

`tests/queued-run-guide-driver.host.test.ts` deliberately uses a fixture-owned bridge, real Kernel/Storage/Pi and a temporary localhost OpenAI-compatible service. It holds the first inference, guides exactly one queued item, observes the second HTTP request under the original Run, and then allows only the untouched queue item to drain normally. It also verifies same-key replay, truthful operation state/no-op cancellation and rejection of a new `run.retry` for consumed input. This is not evidence that the production Kernel or UI command has been connected.

The storage suite verifies exact scope and policy, admission capacity/release, concurrent guide/edit/remove, both ordered final-probe/Guide races, cursor fencing and orphaned JSONL reconstruction of the same message, guided Run and receipt. Restart recovery interrupts the original Run and keeps admission closed without automatically replaying the guide. Pure gate tests verify idempotent open, closed-owner fencing, owner retirement and bounded capacity. Projection tests verify stream retention, one message/Run update and replay deduplication; malformed receipt identity causes fresh snapshot recovery with no false message/queue state. The combined driver/storage/runtime/queue/Agent/usage run passed **65 tests / 4,577 assertions across 13 files** (the fast 4,096-gate capacity test accounts for most assertions). After independent replay/start-boundary hardening to require a durably running, uncancelled active owner, the storage/real-Host pair passed another **9 tests / 85 assertions**. Scoped strict TypeScript, zero-warning ESLint over every changed TS file, content/icon guards and Web production build passed. Build retains the existing large-chunk warning and unchanged CSS asset; no layout was redesigned by this foundation.

React/SSR checks for Run activity and Stop could not execute because this existing checkout lacks `prop-types`, `react-is` and direct test resolution for `@lumen/app-ui`. Whole-repository TypeScript also encounters existing preview/shared-UI resolution/type failures; no full-green claim or dependency installation is made. Existing unrelated whole-file formatting differences in contracts index, usage/Agent files and cancellation were preserved after checking their HEAD baselines. No native build/launch, paid provider, real profile, primary-checkout edit, merge or push was used.

Before exposing Guide, complete the public exact-target command and receipt reconciliation, production Kernel source/gate lifecycle, cancel/Goal/failure closure paths, host-localized queue action and one continuous real-Host UI flow. Also verify provider message order: a canonical guide admitted during inference precedes that inference's later assistant commit in the journal. The next authoritative request must represent the pending guidance as the next user instruction without manufacturing a second transcript message or losing tool-call/result pairing. Merely proving that its text appears somewhere in the second request is not full interaction parity. CLI and other operation watchers must observe embedded guidance for their original queued operation rather than wait forever for a separate `run.settled` event. Keep the chosen model/thinking preservation on empty-project switching. Goal+Plan and `/agent` parent-prompt choices remain separate and unchanged.
