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
