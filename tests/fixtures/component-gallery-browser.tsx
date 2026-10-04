import { createRoot } from 'react-dom/client'
import { HBAR_APP_UI_VARIANT_SPECS } from '../../packages/hbar-app-ui/src/catalog-metadata'
import { ComponentGallery } from '../../apps/hbar-app-ui-preview/src/ComponentGallery'
import {
  componentGalleryEntries,
  readComponentGalleryState,
} from '../../apps/hbar-app-ui-preview/src/component-gallery-model'
import { createComponentGalleryStore } from '../../apps/hbar-app-ui-preview/src/component-gallery-store'
import { componentGalleryCopy } from './component-gallery-copy'
import '../../packages/hbar-app-ui/src/theme.css'
import '../../apps/hbar-app-ui-preview/src/component-gallery.css'

const parameters = new URLSearchParams(window.location.search)
const count = Number(document.documentElement.dataset.fixtureCount)
if (!Number.isInteger(count) || count < 0 || count > 12) throw new Error('Invalid gallery boundary fixture count')
const copy = componentGalleryCopy['zh-CN']
export const longGalleryTitle =
  '所有组件及完整交互预览：由宿主提供的长中文标题需要在窄屏中自然换行，不能遮挡搜索与翻页操作'
const longCopy = {
  ...copy,
  title: longGalleryTitle,
  entryTitle: (entry: Parameters<typeof copy.entryTitle>[0]) =>
    `${copy.entryTitle(entry)}：包含长中文说明的预览名称，应自然换行并保留完整预览入口`,
}
const root = document.getElementById('fixture-root')
if (!root) throw new Error('Missing gallery boundary fixture root')
createRoot(root).render(
  <ComponentGallery
    entries={componentGalleryEntries(HBAR_APP_UI_VARIANT_SPECS.slice(0, count))}
    store={createComponentGalleryStore(readComponentGalleryState(parameters))}
    copies={{ ...componentGalleryCopy, 'zh-CN': longCopy }}
  />,
)
