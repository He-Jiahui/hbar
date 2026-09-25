import { createStore } from 'zustand/vanilla'
import { stableLumenShellRailItems, type LumenAppShellRailContent } from '@lumen/app-ui'

export function createAppShellRailPreviewStore() {
  return createStore<{
    readonly areaId: string
    readonly workspaceId: string
    readonly selectArea: (id: string) => void
    readonly selectWorkspace: (id: string) => void
  }>((set) => ({
    areaId: 'shipments',
    workspaceId: 'kestrel',
    selectArea: (id) => set({ areaId: id }),
    selectWorkspace: (id) => set({ workspaceId: id }),
  }))
}
export function projectAppShellRailPreview(
  state: ReturnType<ReturnType<typeof createAppShellRailPreviewStore>['getState']>,
  content: LumenAppShellRailContent,
): LumenAppShellRailContent {
  const areas = stableLumenShellRailItems(content.areas)
  const workspaces = stableLumenShellRailItems(content.workspaces)
  return {
    ...content,
    areas,
    workspaces,
    selectedAreaId: areas.some((area) => area.id === state.areaId) ? state.areaId : null,
    selectedWorkspaceId: workspaces.some((workspace) => workspace.id === state.workspaceId) ? state.workspaceId : null,
    onSelectArea: (id) => {
      if (areas.some((area) => area.id === id)) {
        state.selectArea(id)
        content.onSelectArea(id)
      }
    },
    onSelectWorkspace: (id) => {
      if (workspaces.some((workspace) => workspace.id === id)) {
        state.selectWorkspace(id)
        content.onSelectWorkspace(id)
      }
    },
  }
}
