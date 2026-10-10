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
