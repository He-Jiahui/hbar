# Runtime skill discovery

hbar's runtime catalog reads the configured global skills directory and the
current execution workspace's `.hbar/skills`, `.agents/skills`, `.claude/skills`,
`.codex/skills`, `.opencode/skills`, and legacy `.opencode/skill` directories.
Workspace hbar entries override compatibility entries and global entries with
the same name. Discovery includes nested bundles and `.system` skills. Empty
directories are not skills. The existing import and inspection UI remains the
management entry for global skills.

The catalog reads bounded YAML frontmatter for a name, description and invocation
policy. Legacy entries without YAML use their directory name and first prose
line. Codex's `agents/openai.yaml` policy `allow_implicit_invocation: false` and
Claude's `disable-model-invocation: true` mark a skill as explicit-only. Invalid
metadata produces bounded discovery warnings, without preventing valid siblings
from loading. Catalog discovery does not eagerly inject instruction bodies.

Metadata search supports Latin words and continuous Chinese text. Search pages
carry a revision-bound cursor; installing, deleting or renaming skills invalidates
old cursors. Search and reads refresh discovery, while context callers can use a
short bounded workspace cache. Reads resolve names or stable opaque IDs against
the current catalog, accept only contained relative resources, reject symlinks,
binary text and oversized files, and check cancellation. Large text resources
are paged on Unicode character boundaries and require a matching file revision
for continued reads, preventing mixed instruction versions.

Limits are declared in `packages/kernel/src/skills/files.ts`: four simultaneous
operations, sixteen cached workspaces, five directory levels, 4,096 scanned
entries, 1,024 discovered skills, twenty search results per page, 256 KiB per
file, 24,000 characters per read page, and one hundred sampled resource files.
A truncated catalog is reported explicitly instead of claimed complete.

The built-in `tools.skills` plugin adds three read-only native tools to the
ordinary Run tool selection:

- `skill_search({ query?, cursor?, limit? })` searches metadata or browses the full
  catalog when the query is empty. Follow `nextCursor`; a stale cursor requires a
  fresh search.
- `skill({ name })` loads the selected `SKILL.md`, its current directory and a
  bounded resource listing. Names and catalog IDs are accepted.
- `skill_read({ name, path, offset?, revision? })` reads required references or
  continues a long instruction file. Follow `nextOffset` with the same revision
  until it is null. File paths are relative to the selected skill directory.

Each model request receives a bounded metadata catalog in the existing dynamic
context. It prioritizes current task wording, including continuous Chinese text,
and instructs the model to proactively select a skill for an explicit request or
a clear semantic match. The model announces the selected skills and reads their
complete instructions before applying them. Omitted entries remain discoverable
through `skill_search`; only selected instructions and required references enter
conversation history. No additional model request generates a skill summary.

Explicit-only entries are omitted from automatic suggestions unless named in
the current task. Their invocation policy is also included in search results.
The prompt requires a user request before applying them. Skill results remain
ordinary persisted tool results; after compaction, the model is told to reread
relevant instructions when they are absent, and to handle missing or changed
entries with an accurate fallback.

Plan mode and Explore child agents can use these read-only tools. Focused
workflows keep bounded skill instruction reads available independently of task
file scopes; script execution and task writes still pass the original workflow,
approval and Plan mode gates. A Run's selected tools remain the hard ceiling: if
skill tools are excluded, its model context does not advertise the catalog.
Discovery uses the actual Run workspace, including isolated execution roots, and
the configured global skills root from storage locations.

Resource listings are capped at 100 files and 8,000 path characters. Metadata
context is capped at 24 entries and 12,000 characters, with a smaller budget for
small model windows. Full catalogs and file contents remain paginated rather
than silently represented as complete.

The reference mechanisms were inspected in the user's local checkouts:

- Codex: `codex-rs/ext/skills/src/catalog_prompt.rs`, `host_roots.rs`,
  `selection.rs`, and `loader/metadata.rs`: advertise metadata, select by task or
  explicit mention, read selected instructions progressively, respect invocation
  policy and resolve project/user roots.
- OpenCode: `packages/core/src/skill/guidance.ts` and `tool/skill.ts`: add the
  available skill summaries to model context and expose a native `skill` tool
  returning the entry, base directory and sampled resources.

This implementation reuses hbar's Bun toolchain, typed tool schemas and normal
tool gates. Skill text and metadata are task data; loading a skill does not
grant permissions or execute scripts.
