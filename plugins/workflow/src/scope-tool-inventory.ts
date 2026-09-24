import type { ToolDefinition } from '@hbar/plugin-sdk'

// Keep common repository repair signatures immediately available for known-input batches.
const immediate = new Set(['read_file', 'write_file', 'edit_file', 'list_directory', 'search_text', 'shell'])

/** Presentation only: selected, out-of-focus capabilities remain discoverable without eagerly sending schemas. */
export function scopeToolInventory(tools: readonly ToolDefinition[], scopeGatedNames: ReadonlySet<string>) {
  const names = new Set<string>()
  const entries: string[] = []
  const render = (values: readonly string[]) =>
    [
      '<workflow_deferred_tools>',
      'Selected capabilities outside this focus (names, effects, full descriptions; NOT call signatures). To use one within the authorized task, first workflow_expand_scope with its name, bounded paths and reason. Its full native schema returns next request. Inspect that schema before calling; never guess arguments. Expansion grants no new user permission. In-scope tools stay native for full text/images.',
      ...values,
      '</workflow_deferred_tools>',
    ].join('\n')
  for (const tool of tools) {
    if (!scopeGatedNames.has(tool.name) || immediate.has(tool.name)) continue
    const entry = `${JSON.stringify(tool.name)} ${tool.effect}: ${JSON.stringify(tool.description)}`
    // Oversized inventories fall back to the existing signature/native advertisement, never silently hide a tool.
    if (render([...entries, entry]).length > 4_000) continue
    names.add(tool.name)
    entries.push(entry)
  }
  return { names, text: names.size ? render(entries) : '' }
}
