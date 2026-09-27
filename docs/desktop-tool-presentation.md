# Desktop tool identity and requested-target presentation

## Scope and reference evidence

This work addresses a production integration gap introduced with the compact
message renderer (`c49412b`): `describeTool` existed for test-owned examples,
but ordinary production messages still used a generic Wrench and raw tool name.
It does not reopen the canonical outcome contract (`b86ed9a`) or quiet
disclosure behavior (`bb250b1`).

The reference is `D:/Git/cc-haha` at
`e28d0a653481ef41b7a329411eeb2f0fd5656731`. A new isolated preview directly
rendered its unmodified `ToolCallGroup` / `ToolCallBlock`, theme and i18n for
en-US/zh-CN at 1440/320. The final matrix has 120 PNGs and DOM observations in
`artifacts/tool-presentation/reference/`; `report.md` distinguishes actual
observations from source-only fallbacks. These are original-component fixtures,
not a claim that the full cc desktop or a provider Run was exercised.

The observed hierarchy is a compact family glyph, operation name, requested
filename or command/search summary, then result metadata and disclosure.
Clicking the path is ordinary disclosure, not a separate file-navigation action.
The reference uses FileText / FilePlus / FilePen for read/write/edit, Terminal
for commands, Search for Glob/Grep and Wrench for unknown tools. The compact
glyph role maps to hbar's existing `sm` tier, not a new one-off size.

There are reference limitations that must not be copied:

- Its basename split only recognizes `/`, not Windows `\\`.
- At 320, a result summary can reduce the requested filename span to zero width.
- A long unknown tool name can overflow the document (observed width 1141).
- Ordinary path spans have no full-path tooltip.
- Malformed Bash command/description can disappear from detailed input.
- Some successful file-tool outputs, or inputs before a result, are not exposed.

hbar must retain complete original JSON Input, Output and Copy, honest outcomes,
keyboard disclosure and requested targets without inventing a file-open action.

## Verified pre-change baseline

`artifacts/tool-presentation/baseline/report.md` records two passing production
browser cases (en-US 1440 and zh-CN 320), four actual read-only local-fixture Runs
and eight new PNGs. Both `read_file` and `search_text` used Wrench, raw names and
no compact target preview. Complete Input/Output and real clipboard checks,
disclosure focus, composer draft and owned-file preservation passed.

The frozen bundle was `index-Dxd--v8b.js`, SHA256
`80942BE9996A9AFB227ED8ED92CAAA2A93B08131F9E6D99CED3DCCAF1B8A02D7`.
Both fresh port-zero Hosts exited through their own stdin; both exact owned
temporary roots were removed and verified absent. No shell, approved write,
paid provider or native launcher was used. This is baseline evidence, not
acceptance evidence for the future production presenter.

## Canonical prerequisite

`ToolDefinition.presentation` is an optional typed declaration of requested-input
semantics. A canonical `tool_call.presentation` captures version 1 of that
declaration. It contains only a semantic kind and a few bounded top-level
argument field names; no locale strings, extracted argument copies, executable
expressions, URLs, arbitrary icon paths or translation keys.

| Kind             | Descriptor fields                                            | Shipped tool     |
| ---------------- | ------------------------------------------------------------ | ---------------- |
| `file-read`      | `pathField`                                                  | `read_file`      |
| `file-write`     | `pathField`                                                  | `write_file`     |
| `file-edit`      | `pathField`                                                  | `edit_file`      |
| `directory-list` | `pathField`                                                  | `list_directory` |
| `command`        | `commandField`, optional `descriptionField`                  | `shell`          |
| `text-search`    | `patternField`, optional `pathField`                         | `search_text`    |
| `file-search`    | optional `queryField` / `includeField`, optional `pathField` | `find_files`     |

File search requires at least a query or include field in the declaration; the
call itself may omit either filter. `find_files` actually uses `nameQuery` and
`include`, not the reference's singular `pattern`. The local `shell` schema has
no description argument. No default directory or missing search query is
invented from display metadata.

Field names are 1–64 ASCII identifier characters; `__proto__`, `prototype` and
`constructor` are rejected. Each union member is strict, so irrelevant/extra
fields are invalid. This gives a small structural bound without duplicating
potentially large command or file bodies.

The Host owns which registered declaration supplies display metadata. The
driver/model cannot stamp it: its tool-call presentation is removed for every
role, and only assistant calls can receive a captured declaration. Raw args,
name and call ID remain unchanged. Unregistered, unselected, undeclared and
legacy calls have no guessed semantics. No current catalog or name heuristic
is consulted when reading history.

Registration validates and clones the declaration without freezing the caller's
definition. The registry-owned declaration slot is non-writable and
non-configurable, including when absent, and its value is frozen. After
`tools.select`, the Host captures by selected names from the actual scoped
registry, not substitute objects returned by a hook. This preserves tools
legitimately registered during selection while preventing a hook from changing
the same registry object's declaration for this or a later Run. The captured
primitive-only snapshot stays stable across later disposal/replacement. A
local same-name registration without metadata does not inherit its parent's
metadata.

`DriverInput.emit` reserves `message.committed`; drivers must use `commit` for
canonical messages. This prevents append-only fake messages from bypassing
enrichment or appearing differently in live state and rebuilt history. Other
ordinary driver events retain their existing route. The general plugin
`SessionService.append`, public StoragePort and Kernel administration remain
trusted APIs; this is not a blanket sandbox of arbitrary plugin code.

This is **requested-input presentation authored by a registered tool**, not a
trusted/built-in badge, authorization, proof of execution, final effective path
after `tool.before`, or rollback guarantee. Tool outcomes remain separate.
Plugins are not sandboxed by this declaration. Nested sequence events retain
their separate parent envelope; this change does not inject children into
ordinary model messages or add declarations to those event envelopes.

The additive optional field uses existing canonical JSON persistence. No new
table, network catalog, request per row, UI store, or history rewrite is needed.
The existing Pi message conversion must continue sending only the original
tool name, ID and arguments to the model, not UI presentation metadata.

## Persistence and incremental boundary verification

Maintained tests include:

- `tests/tool-presentation.storage.test.ts`: all seven declaration shapes and
  original arguments survive snapshot, events, context, restart and JSONL
  projection rebuild; recovery does not relabel calls; message forks retain
  declarations and legacy omissions without creating Runs.
- `tests/tool-presentation.runtime.test.ts`: live duplicate updates retain
  metadata and the existing 1000-message bound for 0, 1, 60, 61, 100, 101, 1000
  and 1001 messages, without extra snapshot requests; paged orphan matching
  still requires the exact original session, Run, call ID and tool name.

Storage tests create fresh owned roots, validate realpaths and exact prefixes
before cleanup, and close the storage worker before removing their roots. Their
history is explicitly synthetic; no tool command or filesystem action is
executed from stored calls.

## Canonical prerequisite acceptance

- Final aggregate: **52 passed, 0 failed, 2681 assertions**, 33.48 seconds.
  Command: `bun test tests/tool-presentation.contract.test.ts tests/tool-presentation.host.test.ts tests/tool-presentation.storage.test.ts tests/tool-presentation.runtime.test.ts tests/tool-outcome-contract.test.ts tests/tool-outcome-host.test.ts tests/tool-outcome-storage.test.ts tests/session-timeline.test.ts --timeout 20000`.
  Existing outcome fault-injection tests intentionally log controlled storage
  failures; those assertions passed, not suppressed errors from this feature.
- Separate implementation-owner regression: **75 passed, 0 failed, 504
  assertions**, 44.89 seconds, across eight files including the 13 new
  contract/Host tests plus kernel, extensions, workflow sequence, local tools
  and native query regressions. These overlap the aggregate; do not sum them
  into a unique-test count.
- Registry slot replacement/deletion tests were observed red before the fix
  (0/2), then green. Independent static review identified this and the driver
  emit bypass and re-reviewed both corrections; it did not claim an independent
  runtime test execution.
- Root `bun run typecheck`: exit 0. Strict scoped ESLint: exit 0. Prettier
  checking all 12 changed files: exit 0 after normalizing the owned registry
  file's mixed line endings. Shared kernel/SDK foreign hunks were not formatted.
- Root `bun run lint`: exit 1 for the existing missing
  `react/no-unused-prop-types` rule at
  `hbar-ui/packages/lumen-app-ui/src/authentication/primitives.tsx:44`.
  This unrelated dirty submodule was not changed to hide the failed gate.
- Full Bun suite, web build and native smoke were not rerun for this additive
  canonical prerequisite. New UI acceptance and desktop resource/native checks
  belong to the visible integration below; no launcher was built or started.

The ignored `artifacts/tool-presentation/benchmark-canonical.ts` measured 100
samples after ten warm-ups for capture plus 25 call enrichments, with a shared
1,000,000-character argument body. At 7 declared tools median/p95 were
0.0172/0.0313 ms; at 1000 registered tools with seven declarations they were
1.2774/1.7230 ms. Original argument identity was checked on every iteration.
This is a local microbenchmark, not end-to-end UI latency or a release threshold.
It executes no tools and starts no Host; no speculative optimization was added.

## Remaining visible integration

The canonical prerequisite alone does not change the desktop. Production locale
adapters, per-kind icons/titles, bounded basename/command/query summaries,
full-target inspection, narrow layout and ordinary/Plan message-path wiring
still require implementation and new rendered acceptance evidence. The old
test-only `describeTool` examples are not proof of this production capability.
Do not report this visible migration as complete until that closure is verified.
