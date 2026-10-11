# Runtime IPC

`@hbar/runtime` provides a validated, bounded IPC peer for Bun runtime owners.
It is an internal process port; public Host commands continue to use the existing
command catalog and WebSocket protocol. The Host adapters and generation manager
attach these peers to their own lifecycle and execution authority.

Each peer binds two immutable process incarnations. Register a named procedure
with local input/output Zod schemas and a local handler. The remote caller sends
plain data and checks the declared result schema. Functions, schema instances,
AbortSignal, Cordis contexts and other object instances do not cross the channel.
An AbortSignal becomes a correlated cancellation message and a new local signal
in the receiving process. Optional positional arguments retain `undefined`.

Calls capture their serialized input before queue admission. Defaults are 64
physical calls, 256 queued calls, 32 MiB per message and 64 MiB for each bounded
transfer/admission buffer. Large messages are fragmented at Unicode boundaries;
each fragment needs an acknowledgement before the next is sent. Invalid sequence,
stale incarnation, broken transfer and process exit settle the affected peer.

Cancellation or timeout ends the caller's wait but retains its physical call slot
until the reply or channel disposal. Channel disposal does not prove that a
noncooperating operation has stopped: the generation supervisor must confirm the
owner's exit before releasing execution, write or native resource authority.
Unserializable replies fail the individual request, and event observers are
isolated. Diagnostics never include payloads or credentials.

`tests/runtime-ipc.test.ts` covers actual Bun IPC, fragmentation, admission,
captured targets, cancellation, timeout, late replies, observer failure,
serialization failure and incarnation rejection.

`RuntimeCoordinator` is the stable authority for Session claims, dependency version
bindings, shared resource gates and the Host-wide 64-tool physical capacity. Its
persistence adapter must atomically claim/release/fence ownership. Candidates have
no production write authority; only the default Kernel can admit new Runs. A claim
with a missing durable receipt blocks that Session until explicit reconciliation.

Revocation immediately rejects late commits and fences Runs depending on a failed
unit. Physical tool/resource permits remain held until their actual owner releases
them or its supervisor confirms exit. Handoff also requires the old Run executor to
stop and all failed dependencies to exit. Retained Runs keep their bound dependency
versions, so replacing a plugin cannot silently change an already running tool.

`ManagedProcess` hosts an immutable module artifact in a Bun subprocess using
`prepare / activate / drain / dispose`. Preparation validates its reported public
contract and storage schema. Candidates that fail never activate or restart. An
activated generation retains its artifact and generation number through recovery,
but receives a new incarnation and PID. Default and draining roles remain distinct
during recovery so an old generation cannot briefly restart new-work admission.

Heartbeat loss, abnormal exit and timed-out physical IPC calls terminate the owning
process. Fault callbacks fence authority, and exit callbacks reconcile resources;
failed reconciliation keeps the generation unavailable. Explicit disposal cancels
recovery and kills a stuck owner at the shutdown deadline. Actual process tests
exercise compatibility failures, repeated crashes, heartbeat stalls and disposal.

`RuntimeArtifactStore` builds registered units with Bun metafiles and stores bundles
by content hash. Dependency ownership comes from actual build inputs, explicit
capability dependencies and declared dynamic resources. Bundle and resource bytes
are immutable, and their hashes are checked again before loading. Dynamic resources
are copied into the artifact version; callers use its registered resource references
so old Runs cannot read a later source revision. Compilation failure keeps existing
registered artifact sets. Sets and artifacts have bounded in-memory registration.

`RuntimeManager` exposes early reload operation IDs, current/selected generation
routing and bounded incremental state. It prepares at most two candidates at once
and retains at most two serving generations plus one candidate per unit. Further
edits supersede unswitched candidates; retained physical Run/resource/request owners
prevent old-generation disposal. Group preparation failures preserve other targets.
Cancellation disposes unswitched candidates and never reverses a committed switch.

These components provide the production composition ports. They do not replace an
existing monolithic Host merely by adding a status row or a proxy. Host Controller,
Kernel, capability, Storage and maintenance modules must wire their real work and
authority through these lifecycle, routing and coordination contracts.

Storage migration 24 adds durable execution ownership and recovery identities.
Claims, revocation, release and recovery acceptance are canonical Session journal
records and rebuild their SQLite projections. The database Worker checks each
protected managed write against its durable lease, so a fenced incarnation cannot
submit a late message, tool intent or Run outcome. Run observers may finish their
journal updates after settlement, before that lease is released.

Scoped recovery requires prior revocation, retains queued request identities and
pending approvals, and preserves the interrupted Run as history. Planning and
queueing a continuation are idempotent by predecessor and recovery identity. Unknown
effects and pending approvals wait; cancellation, archive and the two-attempt limit
require manual action. User queue entries take precedence over automatic recovery.
The Kernel still has to recheck permissions, Goal control and budgets before using
this port; these storage primitives do not themselves run or authorize a task.

The Kernel's managed lifecycle defers global recovery and scheduling. Goal startup
loads projections without repairing accounting or creating continuation intents.
Explicit activation begins admission; draining stops new claims while existing Runs
finish. `KernelExecutionPort` claims and releases the stable Session lease, and an
AsyncLocalStorage scope carries that lease to every execution storage call. Run
cleanup and interruption acknowledgement still execute when fencing rejects its
late terminal write. Summary timers and external observers do not inherit expired
execution authority. Stable release wakes the currently selected Kernel so queued
work automatically crosses the version boundary.

`RuntimeRecoveryService` reconciles only supplied Run identities. It holds a durable
recovery record while models, permissions, sandbox snapshots, execution mode, Goal
control or budgets are unavailable. Original approval and sandbox authority cannot
expand silently. Goal and budget reconciliation uses the predecessor's restricted
accounting port before admission. The resumed driver receives settled context and
an explicit instruction to continue unfinished work; its initial user message is
reused when already committed. Duplicate failure notifications do not produce
duplicate Run identities. These use cases are exercised with the real Kernel and
Storage Worker, including user-priority queues and interrupted-before-message work.

`StableStoragePort` bounds physical and waiting calls across all Kernel generations.
Writer handover stops admission, drains accepted calls and requires actual process
exit before installing another writer. Deadlines and unknown outcomes fence the
port; requests already dispatched are never replayed to a replacement. Explicit
shutdown rejects waiting calls and has a bounded exit-confirmation deadline.

The Storage process performs read-only schema/integrity preflight and owns its
SQLite Worker only after activation. An OS-lifetime writer lease rejects a second
process while the original Worker is alive. Bun bundles the Worker into the same
immutable artifact as its owner, so source edits cannot change an old generation's
Worker entry. The generated public method catalog bounds RPC names and validates
ownership descriptors. Real process tests verify sole-writer authority, deferred
candidate writes, committed-state retention and actual exit before handover.

The isolated Pi driver receives plain Run, model and parameter descriptions. Named
callbacks preserve the original Kernel execution context for message commits,
before-request hooks, tool execution and steering. It returns a start acknowledgement
and a separate terminal notification instead of holding a model execution in an IPC
call slot. Cancellation carries its original cause; stopped callback owners cannot
receive late replies after disposal. Streams coalesce within a bounded buffer, and
the active driver has a 64-invocation limit. Model parameter descriptions never
replace the actual tool input validation and permission gateway in its owner.

Managed channels reserve eight of their 64 physical slots for named lifecycle and
control procedures. Normal callbacks can queue while blocked model/tools wait, but
approval, cancellation and shutdown still have physical admission capacity. The
receiver enforces this independently of the sender. Queue, bytes and cancellation
accounting retain the same bounds; a logical timeout still does not release the
physical work slot. Additional Kernel control names are supplied by its composition.
