import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LumenButton, LumenContentText, LumenFrame, LumenInput, LumenProvider } from '@lumen/app-ui'
import {
  HbarRuntimeProvider,
  HbarWorkspaceShell,
  HbarDesktopLayoutProjection,
  type HbarDesktopLayoutProjectionProps,
  type HbarWorkspaceShellLabels,
} from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import { createWebLumenAppearance, DEFAULT_WEB_APPEARANCE_DIMENSIONS } from '../../apps/web/src/appearance'
import '@lumen/app-ui/styles.css'

const copy = getShellCopy('zh-CN')
const labels: HbarWorkspaceShellLabels = copy.shell
const fixtureLabels = {
  title: '目标与计划',
  tool: '目标与计划工具',
  close: '关闭目标与计划',
  draft: '目标草稿',
  step: '目标与计划详细步骤',
  main: '主会话内容',
  body: '生产工作区内容应保持可读，并且不被目标与计划工具挤到整窗底部。',
  suffix: '验证生产工具出口在窄屏仍可访问',
  mobile: '会话工具与标签',
  separator: '：',
  startupFailure: '桌面布局验证会话加载失败',
} as const

const desktopModel: HbarDesktopLayoutProjectionProps['model'] = {
  global: {},
  borders: [],
  layout: {
    type: 'row',
    weight: 100,
    children: [
      {
        type: 'tabset',
        weight: 70,
        children: [{ type: 'tab', id: 'workspace', name: fixtureLabels.main, component: 'page' }],
      },
      {
        type: 'tabset',
        weight: 30,
        children: [{ type: 'tab', id: 'session-tool', name: fixtureLabels.title, component: 'tool' }],
      },
    ],
  },
}
interface GoalPlanToolProps {
  readonly onClose: () => void
}

const workspace = { id: 'desktop-goal-plan-workspace', path: 'D:/fixture', name: '桌面目标计划验证', createdAt: 1 }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const session = {
  id: 'desktop-goal-plan-session',
  workspaceId: workspace.id,
  title: '目标与计划桌面回归',
  archived: false,
  parentId: null,
  createdAt: 2,
  updatedAt: 3,
  seq: 0,
}

function createRuntime() {
  return createAppRuntime({
    instanceId: 'desktop-goal-plan-outlet-browser',
    hostId: 'fixture-host',
    surfaces: { canRender: () => true },
    directory: {
      async execute(name, input) {
        const record = isRecord(input) ? input : {}
        if (name === 'workspace.sidebar.list')
          return {
            revision: 1,
            displayNamesRevision: 1,
            organizationRevision: 1,
            items: [{ workspace, displayName: workspace.name, latestSessionCreatedAt: 2, latestSessionUpdatedAt: 3 }],
            includedItems: [],
            nextCursor: null,
          }
        if (name === 'session.sidebar.list')
          return {
            revision: 1,
            items: [{ session, execution: { state: 'idle', activeCount: 0, queuedCount: 0 } }],
            nextCursor: null,
          }
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        if (name === 'workspace.get') return record.workspaceId === workspace.id ? workspace : null
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'session.get') return record.sessionId === session.id ? session : null
        throw new Error(`Unsupported fixture query: ${name}`)
      },
    },
  })
}

function GoalPlanTool({ onClose }: GoalPlanToolProps) {
  const [draft, setDraft] = useState('')
  return (
    <LumenFrame as="section" className="goal-plan-tool" aria-label={fixtureLabels.tool}>
      <LumenButton onClick={onClose}>{fixtureLabels.close}</LumenButton>
      <LumenInput aria-label={fixtureLabels.draft} value={draft} onChange={(event) => setDraft(event.target.value)} />
      <LumenFrame data-testid="goal-plan-scroll" className="goal-plan-scroll">
        {Array.from({ length: 80 }, (_, index) => (
          <LumenContentText key={index} context="section.description">
            {fixtureLabels.step} {index + 1}
            {fixtureLabels.separator}
            {fixtureLabels.suffix}
          </LumenContentText>
        ))}
      </LumenFrame>
    </LumenFrame>
  )
}

function Fixture() {
  const runtime = useMemo(createRuntime, [])
  const [sessionLoadFailed, setSessionLoadFailed] = useState(false)
  const [presentation, setPresentation] = useState<'split' | 'drawer'>(() =>
    window.innerWidth < 840 ? 'drawer' : 'split',
  )
  useEffect(() => {
    const update = () => setPresentation(window.innerWidth < 840 ? 'drawer' : 'split')
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  useEffect(() => {
    let mounted = true
    const loadSession = async () => {
      await runtime.ready
      await runtime.view.commands.execute('workspaceActivity.refresh', {})
      await runtime.view.commands.execute('workspaceActivity.refresh', { workspaceId: workspace.id })
      await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    }
    void loadSession().catch((error: unknown) => {
      console.error('Desktop Goal/Plan fixture startup failed:', error)
      if (mounted) setSessionLoadFailed(true)
    })
    return () => {
      mounted = false
    }
  }, [runtime])
  useEffect(() => () => runtime.dispose(), [runtime])
  return (
    <HbarRuntimeProvider view={runtime.view}>
      <LumenProvider
        appearance={createWebLumenAppearance(
          document.documentElement.dataset.lumenMode === 'light' ? 'light' : 'dark',
          DEFAULT_WEB_APPEARANCE_DIMENSIONS,
          false,
        )}
      >
        <HbarWorkspaceShell
          labels={labels}
          mobileNavigationLabel={fixtureLabels.mobile}
          sidebarWidthRem={17}
          toolWidthRem={24}
          toolLayout={{ constrainedPresentation: 'drawer', mainMinWidthRem: 32, minWidthRem: 20, maxWidthRem: 36 }}
          desktopToolPresentation={presentation}
          connection="connected"
          onReconnect={() => {}}
          toolLabel={fixtureLabels.title}
          tool={<GoalPlanTool onClose={() => {}} />}
          renderLayout={(panes) => <HbarDesktopLayoutProjection model={desktopModel} panes={panes} />}
        >
          <LumenFrame as="main" data-testid="workspace-content">
            {sessionLoadFailed ? (
              <LumenContentText role="alert" context="section.description">
                {fixtureLabels.startupFailure}
              </LumenContentText>
            ) : null}
            <h1>{fixtureLabels.main}</h1>
            <LumenContentText context="message.body">{fixtureLabels.body}</LumenContentText>
          </LumenFrame>
        </HbarWorkspaceShell>
      </LumenProvider>
    </HbarRuntimeProvider>
  )
}

const fixtureRoot = document.getElementById('fixture-root')
if (!fixtureRoot) throw new Error('desktop Goal/Plan fixture root is missing')
createRoot(fixtureRoot).render(<Fixture />)
