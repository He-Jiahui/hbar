import type { HbarAppUiCategory } from '../../packages/hbar-app-ui/src/types'
import type { PreviewViewport } from '../../apps/hbar-app-ui-preview/src/preview-workspace-store'
import { componentGalleryCopy } from './component-gallery-copy'

export interface PreviewWorkspaceCopy {
  readonly brand: string
  readonly mark: string
  readonly catalog: string
  readonly categories: string
  readonly categoryNavigation: string
  readonly search: string
  readonly clearSearch: string
  readonly noResults: string
  readonly reset: string
  readonly lightTheme: string
  readonly darkTheme: string
  readonly enterFullscreen: string
  readonly exitFullscreen: string
  readonly fullscreenError: string
  readonly viewport: string
  readonly viewports: Readonly<Record<PreviewViewport, string>>
  readonly stage: string
  readonly inspector: string
  readonly variants: string
  readonly interactionLog: string
  readonly interactionHint: string
  readonly contract: string
  readonly entry: string
  readonly behavior: string
  readonly observation: string
  readonly visualChecks: string
  readonly categoryName: (category: HbarAppUiCategory) => string
  readonly catalogCount: (shown: number, total: number) => string
  readonly shownCount: (count: number) => string
  readonly eventCount: (count: number) => string
  readonly variantCount: (variant: number, total: number) => string
}

export const previewWorkspaceCopy: Readonly<Record<'en-US' | 'zh-CN', PreviewWorkspaceCopy>> = {
  'en-US': {
    brand: 'hbar-app-ui',
    mark: 'h',
    catalog: 'Application UI catalog',
    categories: 'Categories',
    categoryNavigation: 'hbar-app-ui categories',
    search: 'Search components',
    clearSearch: 'Clear search',
    noResults: 'No matching components.',
    reset: 'Reset preview',
    lightTheme: 'Use light theme',
    darkTheme: 'Use dark theme',
    enterFullscreen: 'Enter fullscreen',
    exitFullscreen: 'Exit fullscreen',
    fullscreenError: 'Fullscreen is unavailable. Try again.',
    viewport: 'Preview viewport',
    viewports: { desktop: 'desktop', tablet: 'tablet', mobile: 'mobile' },
    stage: 'Selected component preview',
    inspector: 'Variant inspector',
    variants: 'Variants',
    interactionLog: 'Interaction log',
    interactionHint: 'Use the selected component to observe action events.',
    contract: 'Variant contract',
    entry: 'Entry',
    behavior: 'Behavior',
    observation: 'Observation',
    visualChecks: 'Visual checks',
    categoryName: (category) => category,
    catalogCount: (shown, total) => `${shown} / ${total} variants`,
    shownCount: (count) => `${count} shown`,
    eventCount: (count) => `${count} events`,
    variantCount: (variant, total) => `${variant} of ${total}`,
  },
  'zh-CN': {
    brand: 'hbar-app-ui',
    mark: 'h',
    catalog: '应用组件目录',
    categories: '组件类别',
    categoryNavigation: '应用组件类别',
    search: '搜索组件',
    clearSearch: '清除搜索',
    noResults: '没有匹配的组件。',
    reset: '重置预览',
    lightTheme: '使用浅色主题',
    darkTheme: '使用深色主题',
    enterFullscreen: '进入全屏',
    exitFullscreen: '退出全屏',
    fullscreenError: '无法进入全屏，请重试。',
    viewport: '预览尺寸',
    viewports: { desktop: '桌面', tablet: '平板', mobile: '手机' },
    stage: '当前组件预览',
    inspector: '变体检查',
    variants: '组件变体',
    interactionLog: '交互记录',
    interactionHint: '操作当前组件以查看交互记录。',
    contract: '组件契约',
    entry: '组件入口',
    behavior: '交互行为',
    observation: '状态观察',
    visualChecks: '视觉检查',
    categoryName: (category) => componentGalleryCopy['zh-CN'].categoryLabels[category],
    catalogCount: (shown, total) => `${shown} / ${total} 个变体`,
    shownCount: (count) => `显示 ${count} 项`,
    eventCount: (count) => `${count} 条记录`,
    variantCount: (variant, total) => `第 ${variant} / ${total} 个变体`,
  },
}
