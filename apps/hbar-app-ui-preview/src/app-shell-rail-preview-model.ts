import { createStore } from 'zustand/vanilla'
import { stableLumenShellRailItems, type LumenAppShellRailContent } from '@lumen/app-ui'

function isValidId(id: string): boolean {
  return id.trim().length > 0
}
function stableValidItems<T extends { readonly id: string }>(items: readonly T[]): T[] {
  return stableLumenShellRailItems(items.filter((item) => isValidId(item.id)))
}

export function createAppShellRailPreviewStore() {
  return createStore<{
    readonly areaId: string
    readonly workspaceId: string
    readonly selectArea: (id: string) => void
    readonly selectWorkspace: (id: string) => void
  }>((set) => ({
    areaId: 'shipments',
    workspaceId: 'kestrel',
    selectArea: (id) => {
      if (isValidId(id)) set({ areaId: id })
    },
    selectWorkspace: (id) => {
      if (isValidId(id)) set({ workspaceId: id })
    },
  }))
}
export function projectAppShellRailPreview(
  state: ReturnType<ReturnType<typeof createAppShellRailPreviewStore>['getState']>,
  content: LumenAppShellRailContent,
): LumenAppShellRailContent {
  const areas = stableValidItems(content.areas).map((area) => ({
    ...area,
    sections: stableValidItems(area.sections).map((section) => ({
      ...section,
      links: stableValidItems(section.links),
    })),
    records: stableValidItems(area.records),
  }))
  const workspaces = stableValidItems(content.workspaces)
  return {
    ...content,
    areas,
    workspaces,
    selectedAreaId: areas.some((area) => area.id === state.areaId) ? state.areaId : null,
    selectedWorkspaceId: workspaces.some((workspace) => workspace.id === state.workspaceId) ? state.workspaceId : null,
    onSelectArea: (id) => {
      if (isValidId(id) && areas.some((area) => area.id === id)) {
        state.selectArea(id)
        content.onSelectArea(id)
      }
    },
    onSelectWorkspace: (id) => {
      if (isValidId(id) && workspaces.some((workspace) => workspace.id === id)) {
        state.selectWorkspace(id)
        content.onSelectWorkspace(id)
      }
    },
    onNavigate: (areaId, linkId) => {
      const area = areas.find((item) => item.id === areaId)
      if (isValidId(linkId) && area?.sections.some((section) => section.links.some((link) => link.id === linkId))) {
        content.onNavigate(areaId, linkId)
      }
    },
    onPrimaryAction: (areaId) => {
      if (areas.some((area) => area.id === areaId)) content.onPrimaryAction(areaId)
    },
    onRecord: (areaId, recordId) => {
      const area = areas.find((item) => item.id === areaId)
      if (isValidId(recordId) && area?.records.some((record) => record.id === recordId)) {
        content.onRecord(areaId, recordId)
      }
    },
  }
}
