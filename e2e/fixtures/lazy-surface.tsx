import { createRoot } from 'react-dom/client'
import { LumenFrame, LumenText } from '@lumen/app-ui'
import { LazySurfaceBoundary, lazySurface, lazySurfaceCopy } from '../../apps/web/src/lazy-surface'

declare global {
  interface Window {
    __lazyAttempts: number
    __resolveLazy?: () => void
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing fixture root')
const mode = root.dataset.mode
window.__lazyAttempts = 0
const Loaded = ({ message }: { readonly message: string }) => <LumenText role="status">{message}</LumenText>
const Surface = lazySurface<{ readonly message: string }>(() => {
  window.__lazyAttempts++
  if (mode === 'reject' && window.__lazyAttempts === 1) return Promise.reject(new Error('chunk failed'))
  if (mode === 'pending') return new Promise((resolve) => { window.__resolveLazy = () => resolve({ default: Loaded }) })
  return Promise.resolve({ default: Loaded })
})

createRoot(root).render(
  <LumenFrame>
    <LumenFrame as="aside" id="navigation"><LumenText>Navigation stays available</LumenText></LumenFrame>
    <LazySurfaceBoundary labels={lazySurfaceCopy('zh-CN')}>
      <Surface message="Loaded with original props" />
    </LazySurfaceBoundary>
  </LumenFrame>,
)
