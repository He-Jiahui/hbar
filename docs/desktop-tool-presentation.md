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

## Production visible integration

The web host now supplies `createSessionToolPresenter(locale)` to the actual
session workspace and all three canonical rendering branches: current proposed
Plan, historical assistant/Plan, and ordinary messages. The view consumes that
public presentation seam; it does not maintain a second tool catalog or infer
semantics from raw tool names. Current streaming rows contain only text/thinking.

The seven captured kinds receive host-localized English/Chinese action labels,
the corresponding semantic `sm` glyph, and a requested-target summary. File and
directory summaries recognize both path separators. Commands prefer a declared
nonblank description, otherwise the command; text search shows the pattern;
file search prefers its query, otherwise up to eight declared include values.
Descriptions use ordinary text while command/path/query summaries use monospace.
Missing values are not replaced with invented defaults. Legacy, unknown and
invalid declarations retain the generic glyph and original name.

The title includes the action, raw tool name and labeled requested input, within
a 4000-code-point limit. A localized notice directs users to expanded Input when
that budget is exceeded. Compact summaries are limited to 160 code points;
source-string scans are capped at 8192 UTF-16 units and array inspection at eight
items. The adapter reads own data properties without invoking getters or string
coercion, validates the small captured declaration, handles surrogate boundaries,
and makes control/bidi characters visible. These are display bounds, not input
validation, filesystem authorization or a plugin sandbox.

Production presentation never overrides detailed Input: the complete original
JSON arguments and result text remain available, and Copy receives the full
original result. An actual error preview retains precedence over the target
summary; its requested target remains in the bounded title and original Input.
Paths remain part of the disclosure, not misleading file-navigation links.

Activity grouping still counts by raw tool name. Distinct names with the same
localized caption are disambiguated with their raw names. Same-name calls with
different captured/legacy semantics fall back to the raw name for the aggregate.
Changing locale, results or captions does not change the original row identity
or intentionally reset disclosure state.

Normal flex flow keeps action and target on one line when space permits and
stacks them at the existing narrow breakpoint. The target retains usable width
at 320 instead of disappearing behind result metadata. Long unknown names can
wrap. No CSS Grid, screenshot coordinates, fixed content height, extra UI store,
per-row network request or new action surface was introduced.

## Visible acceptance and evidence limits

Maintained coverage consists of the host adapter/model tests, SSR tests for the
real workspace and Plan wrappers, a controlled production-React browser fixture,
and a real-Host production-browser suite. Controlled history is synthetic; real
Host cases submit one local-fixture Run per session. Neither fixture calls a paid
provider. Write/edit/shell cases stop at approval and are cancelled through the
actual UI Stop action: no approval is granted and the proposed tools do not run.

The first real-browser matrix incorrectly required composer drafts to survive a
full page reload. All 28 cases reached that final assertion and failed it. Source
and history inspection confirmed that current drafts are runtime-local;
`client-persistence` stores layout/preferences, not drafts. The assertion was
moved to the end of tool interactions, before reload; durable call/result/
presentation and Copy checks still run after reload. Cross-reload draft recovery
is a separate existing UX gap, not implemented or claimed by this unit. The first
red evidence is retained in the ignored `browser-final` directory.

The corrected functional matrix passed 28/28, but manual image review found
that some long-output screenshots had followed the message bottom instead of
showing the requested tool row. Those images are not accepted as visible-row
evidence. The final visual matrix adds real reading intent and stable viewport
geometry checks; the intermediate `browser-verified` evidence is retained.

Verification for this visible integration:

- Host projection: **16 passed, 0 failed, 244 assertions**, including all seven
  kinds in both locales, invalid/legacy metadata, getters, large strings/arrays,
  Unicode boundaries, complete original arguments and absence of Input override.
- Renderer/workspace regression: **40 passed, 0 failed, 565 assertions** across
  `session-tool-presentation`, `session-message`, `session-tool-outcome-copy`,
  `proposed-plan-message` and `session-workspace` tests. This covers all production
  branches, localized grouping collisions, errors, legacy/orphan rows and
  0/1/100/101 capacities. These are SSR/model assertions, not native screenshots.
- Controlled React browser: **12/12 passed**, 48 PNGs, en-US/zh-CN at 1440/320,
  zero console/page errors or unexpected requests. It includes original content,
  injected clipboard-port equality, keyboard/disclosure lifetime, locale changes,
  long names and capacity boundaries. Clipboard here is controlled, not the OS.
  See `artifacts/tool-presentation/controlled/report.md`.
- Final real-Host production browser: **28/28 passed**, 124 PNGs, en-US/zh-CN at
  1440/320, with sixteen actual read-only completions and twelve cancellations
  before approval or execution. All 56 before/after-reload real clipboard comparisons,
  original JSON, captured metadata, stable visible-row geometry and draft
  preservation during tool actions passed; diagnostics were empty. All 28 owned
  Hosts exited 0 through stdin, and every exact temporary root was removed and
  verified absent. See `artifacts/tool-presentation/production-verification.md`
  and `browser-visible/`. In-place locale changes and unknown/legacy synthetic
  messages are covered by controlled tests, not actual producer Runs here.
- Actual Windows WebView2: **28/28 passed**, 124 PNGs, en-US/zh-CN at 900×600 and
  1440×960. Sixteen real local read-only Runs completed; twelve proposed
  write/edit/shell Runs were cancelled without approval or execution. Original
  persisted metadata, raw Input, full Output, real clipboard, keyboard focus,
  default collapse and reload passed with zero browser errors/warnings. Reading
  screenshots require real wheel intent plus four stable frames and a visible,
  center-hit-tested trigger. Source files stayed unchanged; no proposed write
  file appeared. See `artifacts/tool-presentation/native/`.

The frozen production browser and desktop web resource is `index-CIKkS6ia.js`,
SHA256 `25E0A1B800A31F35489DB35498CFA7B4526E9787C851DC2EC33EB12A72C372CD`,
with `index-Blyvl1Jc.css`. Web and Host/resource builds passed; Vite retained its
large-chunk warning. The existing debug desktop launcher was **not rebuilt**;
its verified SHA256 is
`4291021868BCD834859BC22C96546E886FE6C3CFAC64B3878B37B21BCB765632`.

Native verification used only fresh owned profile/workspace roots, with the
launcher/Host/supervisor executable, full decoded argv, creation time and parent
chain checked before attachment or cleanup. Its exact owned process chain
closed without cleanup errors; both temporary roots were removed and their
absence independently checked. Protected user instances and historical retained
roots were not queried or touched. These results do not claim a release-installer
build, every desktop workflow, provider execution or legacy-history enrichment.

An independent source review found no blocking issue in the frozen visible
scope; it is recorded in `artifacts/tool-presentation/visible-review.md`.

Repository-wide gates are not all green:

- `bun run typecheck`: exit 0, including the final visible source and maintained
  fixtures. Strict scoped ESLint and the content/icon/reference-flow guards pass.
- Full `bun test tests --timeout 20000` under the Visual Studio environment:
  **2965 passed, 2 failed, 33264 assertions across 411 files**, 341.39 seconds.
  The Wizard registry still expects the old variant-3 plan-list markup, while
  committed `referenceUpgrade` renders upgrade-plan. The canonical Lumen boundary
  test finds seven native controls in four Authentication components. Both were
  independently reproduced; source and actual commit diffs locate them outside
  this tool UI change. No historical baseline checkout was run, and neither
  failure was hidden by changing the tests. See
  `artifacts/tool-presentation/full-suite-failures.md` for exact paths and commits.
- `bun run lint`: exit 1, one missing `react/no-unused-prop-types` rule at
  `hbar-ui/packages/lumen-app-ui/src/authentication/primitives.tsx:44`, no warnings.
  No unrelated shared-library edit or configuration exemption was made.

These failed whole-repository gates remain open; passing focused feature checks
does not certify the entire checkout or complete the broader desktop UX goal.
