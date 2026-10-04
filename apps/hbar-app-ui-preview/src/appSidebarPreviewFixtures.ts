import type { LumenAppSidebarContent } from '@lumen/app-ui'
import { appSidebarPrimaryFixture } from '../../../tests/fixtures/hbar-app-ui-app-sidebar-primary-fixtures'
import { appSidebarRailFixture } from '../../../tests/fixtures/hbar-app-ui-app-sidebar-rail-fixtures'
import { appSidebarWorkspaceFixture } from '../../../tests/fixtures/hbar-app-ui-app-sidebar-workspace-fixtures'
import { appSidebarDualFixture } from '../../../tests/fixtures/hbar-app-ui-app-sidebar-dual-fixtures'
import { appSidebarTreeFixture } from '../../../tests/fixtures/hbar-app-ui-app-sidebar-tree-fixtures'
import { appSidebarDrawerFixture } from '../../../tests/fixtures/hbar-app-ui-app-sidebar-drawer-fixtures'
import { appSidebarFullFixture } from '../../../tests/fixtures/hbar-app-ui-app-sidebar-full-fixtures'
import type { AppSidebarPreviewRequestTarget, AppSidebarPreviewSeed } from './appSidebarPreviewStore'

const fixtureParameters = [
  'appSidebarFixture',
  'appSidebarRailFixture',
  'appSidebarWorkspaceFixture',
  'appSidebarDualFixture',
  'appSidebarTreeFixture',
  'appSidebarDrawerFixture',
  'appSidebarFullFixture',
] as const

const requestActions: readonly (readonly string[])[] = [
  ['open', 'account'],
  ['open', 'open-option', 'support', 'account'],
  ['open', 'create-workspace'],
  ['new', 'page', 'settings'],
  ['document', 'new', 'rename', 'duplicate', 'delete'],
  ['navigate'],
  ['navigate', 'footer'],
]

export function appSidebarFixtureParameter(variant: number): string | undefined {
  return fixtureParameters[variant - 1]
}

export function appSidebarPreviewRequestActions(variant: number): readonly string[] {
  return requestActions[variant - 1] ?? []
}

/** Only the visible variant receives detailed preview fixtures. */
export function createAppSidebarPreviewContent(
  base: LumenAppSidebarContent,
  variant: number,
  mode: string | null,
  workspaceId?: string | null,
  sectionId?: string | null,
): LumenAppSidebarContent {
  switch (variant) {
    case 1:
      return { ...base, primary: appSidebarPrimaryFixture(mode) }
    case 2:
      return { ...base, railPreview: appSidebarRailFixture(mode) }
    case 3:
      return { ...base, workspacePreview: appSidebarWorkspaceFixture(mode, workspaceId ?? undefined) }
    case 4:
      return { ...base, dualPreview: appSidebarDualFixture(mode, sectionId ?? undefined) }
    case 5:
      return { ...base, treePreview: appSidebarTreeFixture(mode) }
    case 6:
      return { ...base, drawerPreview: appSidebarDrawerFixture(mode) }
    case 7:
      return { ...base, fullPreview: appSidebarFullFixture(mode) }
    default:
      return base
  }
}

function targets(actionId: string, items: readonly { readonly id: string }[]): AppSidebarPreviewRequestTarget[] {
  return items.map(({ id }) => ({ actionId, value: id }))
}

/** Exact action/target pairs from the current visible content, not a global navigation registry. */
export function createAppSidebarPreviewSeed(
  content: LumenAppSidebarContent,
  variant: number,
  ownerId: string,
): AppSidebarPreviewSeed {
  let requestTargets: AppSidebarPreviewRequestTarget[] = []
  const workspace = variant === 3 ? content.workspacePreview : undefined
  const dual = variant === 4 ? content.dualPreview : undefined
  switch (variant) {
    case 1:
      if (content.primary) {
        requestTargets = [
          ...targets(
            'open',
            content.primary.groups.flatMap((group) => group.items),
          ),
          ...targets('account', content.primary.accountActions),
        ]
      }
      break
    case 2:
      if (content.railPreview) {
        const items = content.railPreview.groups.flatMap((group) => group.items)
        requestTargets = [
          ...targets('open', items),
          ...targets(
            'open-option',
            items.flatMap((item) => item.options),
          ),
          ...targets('support', content.railPreview.support),
          ...targets('account', content.railPreview.account.actions),
        ]
      }
      break
    case 3:
      if (workspace) {
        requestTargets = [
          ...targets(
            'open',
            workspace.groups.flatMap((group) => group.items),
          ),
          { actionId: 'create-workspace', value: undefined },
        ]
      }
      break
    case 4:
      if (dual) {
        const selected = dual.sections.find((section) => section.id === dual.selectedSectionId) ?? dual.sections[0]
        requestTargets = [
          ...targets('new', selected ? [selected] : []),
          ...targets('page', selected?.groups.flatMap((group) => group.items) ?? []),
          { actionId: 'settings', value: undefined },
        ]
      }
      break
    case 5:
      if (content.treePreview) {
        const folders = content.treePreview.folders
        const documents = folders.flatMap((folder) => folder.documents)
        const items = [...folders, ...documents]
        requestTargets = [
          ...targets('document', documents),
          ...targets('rename', items),
          ...targets('duplicate', items),
          ...targets('delete', items),
          { actionId: 'new', value: undefined },
        ]
      }
      break
    case 6:
      if (content.drawerPreview) {
        requestTargets = targets(
          'navigate',
          content.drawerPreview.groups.flatMap((group) => group.items),
        )
      }
      break
    case 7:
      if (content.fullPreview) {
        requestTargets = [
          ...targets(
            'navigate',
            content.fullPreview.groups.flatMap((group) => group.items),
          ),
          ...targets('footer', [content.fullPreview.footerLink]),
        ]
      }
      break
  }
  return {
    ownerId,
    workspaceIds: workspace?.workspaces.map(({ id }) => id) ?? [],
    initialWorkspaceId: workspace?.selectedWorkspaceId ?? null,
    sectionIds: dual?.sections.map(({ id }) => id) ?? [],
    initialSectionId: dual?.selectedSectionId ?? null,
    requestTargets,
  }
}
