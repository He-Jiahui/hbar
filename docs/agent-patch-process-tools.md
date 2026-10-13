# Process tools in isolated Agent patch tasks

Isolated Agent patch tasks use an Agent-owned Git worktree and a declared
`patchTask.scope`. That scope restricts the paths exposed to the patch and
the file tools. It cannot constrain side effects performed by a process.

Patch tasks therefore deny process-effect tools by default. An explicit
`patchTask.allowProcessTools: true` opt-in permits a process-effect tool only
when that tool name is also included in `patchTask.scope.tools`. Omitting the
field has the same behavior as `false`, including for patch records created
before this field existed. Read-only review tasks continue to reject process
tools regardless of the patch-task option.

The opt-in does not directly start a process or bypass the ordinary execution
path. Tool validation and hooks, Host policy, the child Run's approval mode,
durable tool intent, execution, and result settlement remain in force. The
file path scope and patch collection/apply rules are unchanged. Because a
process is not confined to those file paths, it may alter other locations that
the current Host OS user can access. It does not imply administrator access,
elevation, or OS-level confinement. Use the option only for tasks whose
process side effects are understood and bounded by the caller.

The model-facing `agent` tool creates an ordinary child and does not create an
isolated patch task. The `allowProcessTools` setting belongs to explicit
`agent.create` requests that include a `patchTask`.
