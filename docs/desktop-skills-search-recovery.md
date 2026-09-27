# Skills search recovery, 2026-09-27

## Reference and current visual evidence

The unmodified cc-haha `SkillList` renders a trailing clear control in a
nonempty search field, a live matching count and a no-results panel with a
second **Clear skill search** action. The original component and styles were
rendered with two synthetic skills at [1440](../artifacts/skills-clear-audit/reference-no-match-1440.png)
and [320](../artifacts/skills-clear-audit/reference-no-match-320.png). This is
component evidence, not a full Electron or personal-skill-file capture.

Before this change, hbar's real Host-paired [1440](../artifacts/skills-clear-audit/hbar-no-match-1440.png)
and [320](../artifacts/skills-clear-audit/hbar-no-match-320.png) Skills views
showed a plain filter and “No matching items.” with no recovery control.
The current [English 1440](../artifacts/skills-clear-audit/after-no-match-en-US-1440.png)
and [Chinese 320](../artifacts/skills-clear-audit/after-no-match-zh-CN-320.png)
capture the new input clear control, confirmed match count and content-grown
empty panel. Hbar retains its existing Settings/workbench frame; the search
control uses normal flex flow and an explicit associated label.

## Interaction contract

Both clear actions invoke the existing collection-scoped
`extensionWorkspace.setQuery` command, which resets that collection's page to
the first 20 items. They focus the surviving input **before** the empty action
unmounts, so keyboard users can immediately type a new term. Plugins receive
the same two clear actions when their own dedicated search has no match; the
legacy combined browser has only one input clear action, not duplicated empty
buttons. No read of Skill body files, install action or new Host permission is
introduced here.

The Host-backed browser test covers English/Chinese at 1440/320, 21 discovered
skills, zero matches, both clear routes, page-two reset, restored input focus,
no horizontal overflow and no mutations. The rendered reference's empty-panel
clear button restores rows but leaves focus on `<body>`; hbar deliberately
improves that keyboard boundary. The screenshots prove the web/Host surface,
not a physical Tauri window.
