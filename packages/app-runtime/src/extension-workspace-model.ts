import type { ExtensionWorkspaceEntryState } from './types'

/** Both Host collections are rendered as bounded pages, never a 10,000-row DOM. */
export const EXTENSION_PAGE_SIZE = 20

export function extensionWorkspacePage(entry: Readonly<ExtensionWorkspaceEntryState>) {
  const query = entry.query.trim().toLowerCase()
  const plugins = entry.plugins.filter((plugin) =>
    `${plugin.name} ${plugin.id} ${plugin.description}`.toLowerCase().includes(query),
  )
  const skills = entry.skills.filter((skill) => `${skill.id} ${skill.path}`.toLowerCase().includes(query))
  const pluginPage = Math.min(entry.pluginPage, Math.max(0, Math.ceil(plugins.length / EXTENSION_PAGE_SIZE) - 1))
  const skillPage = Math.min(entry.skillPage, Math.max(0, Math.ceil(skills.length / EXTENSION_PAGE_SIZE) - 1))
  return {
    plugins: plugins.slice(pluginPage * EXTENSION_PAGE_SIZE, (pluginPage + 1) * EXTENSION_PAGE_SIZE),
    skills: skills.slice(skillPage * EXTENSION_PAGE_SIZE, (skillPage + 1) * EXTENSION_PAGE_SIZE),
    pluginCount: plugins.length,
    skillCount: skills.length,
    pluginPage,
    skillPage,
  }
}
