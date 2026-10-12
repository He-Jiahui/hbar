import {
  Component,
  createContext,
  lazy,
  Suspense,
  useContext,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from 'react'
import { LumenContentText, LumenButton, LumenFrame } from '@lumen/app-ui'
import { createMessageScope } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export interface LazySurfaceLabels {
  readonly failed: string
  readonly retry: string
  readonly loading: string
}
const LazySurfaceMessages = createMessageScope<LazySurfaceLabels>()
export function lazySurfaceCopy(locale: ShellLocale): LazySurfaceLabels {
  return locale === 'zh-CN'
    ? { failed: '页面加载失败', retry: '重试', loading: '正在加载页面…' }
    : { failed: 'Unable to load this view.', retry: 'Retry', loading: 'Loading view…' }
}

interface RetryVersion {
  readonly generation: number
}
const RetryContext = createContext<RetryVersion>({ generation: 0 })
function LazySurfaceLoading() {
  const { t } = LazySurfaceMessages.useMessages()
  return (
    <LumenContentText context="message.inline" role="status">
      {t('loading')}
    </LumenContentText>
  )
}

function LazySurfaceFailure({ onRetry }: { readonly onRetry: () => void }) {
  const { t } = LazySurfaceMessages.useMessages()
  return (
    <LumenFrame role="alert">
      <LumenContentText context="message.inline">{t('failed')}</LumenContentText>
      <LumenButton onClick={onRetry}>{t('retry')}</LumenButton>
    </LumenFrame>
  )
}

class RetryBoundary extends Component<
  { readonly children: ReactNode },
  { readonly failed: boolean; readonly version: RetryVersion }
> {
  state = { failed: false, version: { generation: 0 } }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  reset = () => this.setState((state) => ({ failed: false, version: { generation: state.version.generation + 1 } }))
  render() {
    if (!this.state.failed)
      return (
        <RetryContext.Provider value={this.state.version}>
          <Suspense
            fallback={<LazySurfaceLoading />}
          >
            {this.props.children}
          </Suspense>
        </RetryContext.Provider>
      )
    return <LazySurfaceFailure onRetry={this.reset} />
  }
}

export function lazySurface<Props extends object>(
  loader: () => Promise<{ readonly default: ComponentType<Props> }>,
): ComponentType<Props> {
  const versions = new WeakMap<RetryVersion, LazyExoticComponent<ComponentType<Props>>>()
  return function LazySurface(props: Props) {
    const version = useContext(RetryContext)
    // Keep the component outside render's hook cache: initial suspension discards useMemo.
    // Each retry gets a fresh version while suspended attempts reuse the same loader.
    let Loaded = versions.get(version)
    if (!Loaded) {
      Loaded = lazy(loader)
      versions.set(version, Loaded)
    }
    return <Loaded {...props} />
  }
}

export function LazySurfaceBoundary({
  children,
  labels,
}: {
  readonly children: ReactNode
  readonly labels: LazySurfaceLabels
}) {
  return (
    <LazySurfaceMessages.Provider messages={labels}>
      <RetryBoundary>{children}</RetryBoundary>
    </LazySurfaceMessages.Provider>
  )
}
