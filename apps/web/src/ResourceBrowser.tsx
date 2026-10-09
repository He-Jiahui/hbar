import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react'
import { LumenFrame, LumenIcon, LumenIconButton, LumenInput, LumenText } from '@lumen/app-ui'
import type { ResourceBrowserController } from './resource-browser-controller'
import type { ShellLocale } from './shell-copy'
import './ResourceBrowser.css'
import { ResourceFileEditor } from './ResourceFileEditor'
interface BrowserLabels {
  readonly address: string
  readonly back: string
  readonly forward: string
  readonly reload: string
  readonly loading: string
  readonly openSystem: string
  readonly unavailable: string
  readonly error: string
}
export function browserCopy(locale: ShellLocale): BrowserLabels {
  return locale === 'zh-CN'
    ? {
        address: '网页地址',
        back: '后退',
        forward: '前进',
        reload: '刷新',
        loading: '正在加载网页…',
        openSystem: '在系统浏览器中打开',
        unavailable: '当前客户端没有内置浏览能力。',
        error: '网页未能加载，可以刷新重试或用系统浏览器打开。',
      }
    : {
        address: 'Website address',
        back: 'Back',
        forward: 'Forward',
        reload: 'Reload',
        loading: 'Loading page…',
        openSystem: 'Open in system browser',
        unavailable: 'This client has no built-in browser.',
        error: 'The page could not load. Reload or open it in the system browser.',
      }
}
const Context = createContext<ResourceBrowserController | null>(null)
export function ResourceBrowserLayer({
  controller,
  children,
}: {
  readonly controller: ResourceBrowserController
  readonly children: ReactNode
}) {
  return <Context.Provider value={controller}>{children}</Context.Provider>
}

export function ResourceBrowser({
  id,
  url,
  locale,
}: {
  readonly id: string
  readonly url: string
  readonly locale: ShellLocale
}) {
  const controller = useContext(Context)
  if (!controller) return null
  return <BrowserContent key={id} id={id} initialUrl={url} controller={controller} labels={browserCopy(locale)} />
}
export function ResourceFile({ instanceId }: { readonly instanceId: string }) {
  const controller = useContext(Context)
  if (!controller) return null
  return <ResourceFileContent instanceId={instanceId} controller={controller} />
}
function ResourceFileContent({
  instanceId,
  controller,
}: {
  readonly instanceId: string
  readonly controller: ResourceBrowserController
}) {
  const file = useStore(controller.store, (store) => store.files[instanceId])
  return file ? <ResourceFileEditor entry={file} /> : null
}
function BrowserContent({
  id,
  initialUrl,
  controller,
  labels,
}: {
  readonly id: string
  readonly initialUrl: string
  readonly controller: ResourceBrowserController
  readonly labels: BrowserLabels
}) {
  const state = useStore(controller.store, (store) => store.entries[id])
  const viewport = useRef<HTMLDivElement>(null)
  const [address, setAddress] = useState(state?.url ?? initialUrl)
  const [error, setError] = useState(false)
  const pending = useRef(false)
  const navigate = (action: () => Promise<void>) => {
    setError(false)
    void action().catch(() => setError(true))
  }
  useEffect(() => {
    if (state?.url && state.url !== 'about:blank') setAddress(state.url)
  }, [state?.url])
  useEffect(() => {
    let active = true
    let frame = 0
    let previous = ''
    const node = viewport.current
    const document = node?.ownerDocument
    const window = document?.defaultView
    if (!node || !document || !window) return
    const sync = () => {
      if (!active || pending.current || !controller.native) return
      const rect = node.getBoundingClientRect()
      const overlay = [
        ...document.querySelectorAll('dialog[open], [role="dialog"], [role="menu"], [role="listbox"]'),
      ].some((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
      const ratio = window.devicePixelRatio
      const bounds = {
        x: Math.max(0, rect.x) * ratio,
        y: Math.max(0, rect.y) * ratio,
        width: Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(0, rect.x)) * ratio,
        height: Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(0, rect.y)) * ratio,
        scale: ratio,
      }
      const visible = !overlay && document.visibilityState === 'visible' && bounds.width > 0 && bounds.height > 0
      const signature = JSON.stringify([visible, bounds])
      if (signature === previous) return
      previous = signature
      pending.current = true
      void (async () => {
        await controller.ensure(id, initialUrl)
        if (!active) return
        if (visible) {
          await controller.bounds(id, bounds)
          if (active) await controller.action(id, 'show')
        } else await controller.action(id, 'hide')
      })()
        .catch(() => {
          if (active) {
            previous = ''
            setError(true)
          }
        })
        .finally(() => {
          pending.current = false
        })
    }
    const schedule = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(sync)
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(node)
    const mutations = new MutationObserver(schedule)
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'class', 'style'],
    })
    document.addEventListener('visibilitychange', schedule)
    window.addEventListener('resize', schedule)
    let reading = false
    const poll = window.setInterval(() => {
      schedule()
      if (!reading && active && controller.native) {
        reading = true
        void controller
          .action(id, 'status')
          .catch(() => {
            if (active) setError(true)
          })
          .finally(() => {
            reading = false
          })
      }
    }, 750)
    navigate(() => controller.ensure(id, initialUrl))
    schedule()
    return () => {
      active = false
      resize.disconnect()
      mutations.disconnect()
      document.removeEventListener('visibilitychange', schedule)
      window.removeEventListener('resize', schedule)
      window.clearInterval(poll)
      window.cancelAnimationFrame(frame)
      void controller.action(id, 'hide').catch(() => undefined)
    }
  }, [controller, id, initialUrl])
  return (
    <LumenFrame className="hbar-resource-browser" data-resource-browser={id}>
      <LumenFrame
        as="form"
        className="hbar-resource-browser-toolbar"
        onSubmit={(event) => {
          event.preventDefault()
          navigate(() => controller.navigate(id, address))
        }}
      >
        <LumenIconButton
          label={labels.back}
          aria-label={labels.back}
          title={labels.back}
          disabled={!controller.native || !state?.canBack}
          onClick={() => navigate(() => controller.action(id, 'back'))}
        >
          <LumenIcon icon={ArrowLeft} tier="sm" />
        </LumenIconButton>
        <LumenIconButton
          label={labels.forward}
          aria-label={labels.forward}
          title={labels.forward}
          disabled={!controller.native || !state?.canForward}
          onClick={() => navigate(() => controller.action(id, 'forward'))}
        >
          <LumenIcon icon={ArrowRight} tier="sm" />
        </LumenIconButton>
        <LumenIconButton
          label={labels.reload}
          aria-label={labels.reload}
          title={labels.reload}
          disabled={!controller.native}
          onClick={() => navigate(() => controller.action(id, 'reload'))}
        >
          <LumenIcon icon={RefreshCw} tier="sm" />
        </LumenIconButton>
        <LumenInput
          type="url"
          value={address}
          aria-label={labels.address}
          onChange={(event) => setAddress(event.currentTarget.value)}
        />
        <LumenFrame
          as="a"
          href={state?.url === 'about:blank' ? initialUrl : (state?.url ?? initialUrl)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            if (controller.native) {
              event.preventDefault()
              navigate(() =>
                controller.openSystem({
                  id: id.padEnd(64, '0'),
                  name: address,
                  location: address,
                  kind: 'web',
                  workspacePath: null,
                  directory: '',
                  mime: null,
                  size: null,
                }),
              )
            }
          }}
        >
          {labels.openSystem}
        </LumenFrame>
      </LumenFrame>
      {state?.loading && (
        <LumenText as="p" role="status">
          {labels.loading}
        </LumenText>
      )}
      {(error || state?.error || state?.failed) && (
        <LumenText as="p" role="alert">
          {labels.error}
        </LumenText>
      )}
      <LumenFrame ref={viewport} className="hbar-resource-browser-viewport">
        {!controller.native && <LumenText as="p">{labels.unavailable}</LumenText>}
      </LumenFrame>
    </LumenFrame>
  )
}
