import {
  Activity,
  BarChart3,
  CircleHelp,
  FileSearch,
  Folder,
  GitBranch,
  Globe,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Settings2,
  TerminalSquare,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import GlassIconButton from '../react-bits/GlassIconButton'
import GlassSurface from '../react-bits/GlassSurface'
import { FloatingSurface } from '../FloatingLayer'
import type { ToolWindowDock, ToolWindowIcon } from '@hbar/contracts'
import { useLocale } from '../locale'
import './WorkbenchNavigation.css'

let activeToolDrag: string | null = null

export type PrimaryPanel = 'sessions' | 'files'

export interface NavigationContribution {
  id: string
  title: string
  icon?: ToolWindowIcon
  defaultDock?: Exclude<ToolWindowDock, 'window'>
  allowedDocks?: readonly ToolWindowDock[] | undefined
  canPopout?: boolean
  placement?: Exclude<ToolWindowDock, 'window' | 'top'>
}

export interface WorkbenchNavigationProps {
  panel: PrimaryPanel
  toolPanel: string
  mobileView: string
  diagnosePanelId: string
  contributions: readonly NavigationContribution[]
  onSelectPrimary(panel: PrimaryPanel): void
  onToggleSidebar(): void
  onOpenTool(
    id: string,
    title: string,
    component: string,
    placement: 'left' | 'right' | 'top' | 'bottom' | 'editor',
    config?: Record<string, unknown>,
  ): void
  onToggleTool(
    id: string,
    title: string,
    component: string,
    placement: 'left' | 'right' | 'top' | 'bottom' | 'editor',
    config?: Record<string, unknown>,
  ): void
  onSetMobileView(view: string): void
  toolOrder: readonly string[]
  toolSides: Readonly<Record<string, 'left' | 'right'>>
  onMoveTool(id: string, side: 'left' | 'right'): void
  onReorderTool(source: string, target: string): void
  showPrimary?: boolean
  onDragState?(id: string | null): void
}

const MOBILE_TOOLS = [
  { id: 'git', title: 'Git', icon: GitBranch },
  { id: 'browser', title: '浏览器', icon: Globe },
  { id: 'inspector', title: '会话检查', icon: FileSearch },
  { id: 'plan', title: '计划', icon: ListChecks },
  { id: 'insights', title: '会话洞察', icon: Activity },
  { id: 'diagnose', title: '诊断', icon: CircleHelp },
] as const

const MOBILE_PRIMARY_ITEMS = [
  { id: 'sessions', label: '会话', icon: MessageSquare },
  { id: 'chat', label: '对话', icon: MessageSquare },
  { id: 'files', label: '文件', icon: Folder },
  { id: 'activity', label: '运行', icon: Activity },
] as const

const MOBILE_MORE_ITEMS = [
  {
    id: 'terminal',
    title: '命令控制台',
    description: '发送会话消息与执行斜杠命令',
    icon: TerminalSquare,
    component: 'terminal',
    placement: 'bottom',
  },
  {
    id: 'system-terminal',
    title: '系统终端',
    description: '在当前工作区运行交互式 Shell',
    icon: TerminalSquare,
    component: 'system-terminal',
    placement: 'bottom',
  },
  {
    id: 'settings',
    title: '设置',
    description: '模型、权限、存储与设备',
    icon: Settings2,
    component: 'settings',
    placement: 'editor',
  },
] as const

function contributionPlacement(contribution: NavigationContribution): 'left' | 'right' | 'top' | 'bottom' | 'editor' {
  return contribution.defaultDock ?? contribution.placement ?? 'right'
}

const CONTRIBUTION_ICONS: Partial<Record<ToolWindowIcon, typeof LayoutGrid>> = {
  activity: Activity,
  'bar-chart-3': BarChart3,
  'circle-help': CircleHelp,
  'file-search': FileSearch,
  folder: Folder,
  'git-branch': GitBranch,
  globe: Globe,
  'layout-grid': LayoutGrid,
  'list-checks': ListChecks,
  'message-square': MessageSquare,
  'terminal-square': TerminalSquare,
  wrench: Settings2,
}

function ToolRailButton({
  label,
  tooltipPlacement,
  selected,
  tone = 'accent',
  onClick,
  children,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDrop,
  onKeyboardMove,
}: {
  label: string
  tooltipPlacement: 'left' | 'right'
  selected?: boolean
  tone?: 'accent' | 'status' | 'warning' | 'neutral'
  onClick(): void
  draggable?: boolean
  onDragStart?(event: React.DragEvent<HTMLButtonElement>): void
  onDragEnd?(event: React.DragEvent<HTMLButtonElement>): void
  onDrop?(event: React.DragEvent<HTMLButtonElement>): void
  onKeyboardMove?(direction: 'up' | 'down' | 'left' | 'right'): void
  children: React.ReactNode
}) {
  const { t } = useLocale()
  const [dragging, setDragging] = useState(false)
  return (
    <GlassIconButton
      label={label}
      portalTooltip
      tooltipPlacement={tooltipPlacement}
      tone={tone}
      title={label}
      aria-label={label}
      aria-pressed={selected}
      aria-grabbed={dragging}
      aria-roledescription={draggable ? t('draggableTool') : undefined}
      className={`${selected ? 'selected ' : ''}${dragging ? 'dragging' : ''}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={(event) => {
        setDragging(true)
        event.dataTransfer.effectAllowed = 'move'
        onDragStart?.(event)
      }}
      onDragEnd={(event) => {
        setDragging(false)
        onDragEnd?.(event)
      }}
      onDragOver={(event) => {
        if (!draggable) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop?.(event)
      }}
      onKeyDown={(event) => {
        if (!draggable || !onKeyboardMove || !event.altKey) return
        const direction =
          event.key === 'ArrowUp'
            ? 'up'
            : event.key === 'ArrowDown'
              ? 'down'
              : event.key === 'ArrowLeft'
                ? 'left'
                : event.key === 'ArrowRight'
                  ? 'right'
                  : undefined
        if (!direction) return
        event.preventDefault()
        onKeyboardMove(direction)
      }}
    >
      {children}
    </GlassIconButton>
  )
}

export function WorkbenchToolRails({
  panel,
  toolPanel,
  diagnosePanelId,
  contributions,
  onSelectPrimary,
  onToggleTool,
  toolOrder,
  toolSides,
  onMoveTool,
  onReorderTool,
  showPrimary = true,
  onDragState,
  side = 'both',
}: Pick<
  WorkbenchNavigationProps,
  | 'panel'
  | 'toolPanel'
  | 'diagnosePanelId'
  | 'contributions'
  | 'onSelectPrimary'
 | 'onToggleTool'
  | 'toolOrder'
  | 'toolSides'
  | 'onMoveTool'
  | 'onReorderTool'
  | 'showPrimary'
  | 'onDragState'
> & { side?: 'left' | 'right' | 'both'; showPrimary?: boolean }) {
  const { t } = useLocale()
  const draggingTool = useRef<string | null>(null)
  const toolLabels = {
    browser: t('browser'),
    inspector: t('sessionInspector'),
    plan: t('plan'),
    insights: t('sessionInsights'),
    activity: t('runningEvents'),
    diagnose: t('diagnose'),
  }
  const rightTools = {
    browser: {
      title: toolLabels.browser,
      component: 'browser',
      icon: Globe,
      tone: 'accent' as const,
      placement: 'right' as const,
    },
    git: { title: 'Git', component: 'git', icon: GitBranch, tone: 'neutral' as const, placement: 'right' as const },
    inspector: {
      title: toolLabels.inspector,
      component: 'inspector',
      icon: FileSearch,
      tone: 'accent' as const,
      placement: 'right' as const,
    },
    plan: { title: toolLabels.plan, component: 'plan', icon: ListChecks, tone: 'accent' as const, placement: 'right' as const },
    insights: {
      title: toolLabels.insights,
      component: 'insights',
      icon: BarChart3,
      tone: 'status' as const,
      placement: 'right' as const,
    },
    activity: {
      title: toolLabels.activity,
      component: 'activity',
      icon: Activity,
      tone: 'status' as const,
      placement: 'right' as const,
    },
    diagnose: {
      title: toolLabels.diagnose,
      component: 'diagnose',
      icon: CircleHelp,
      tone: 'warning' as const,
      placement: 'right' as const,
    },
  } as const
  const contributionById = new Map(contributions.map((contribution) => [contribution.id, contribution]))
  const orderedContributions = [
    ...toolOrder.filter((id) => contributionById.has(id)).map((id) => contributionById.get(id)!),
    ...contributions.filter((contribution) => !toolOrder.includes(contribution.id)),
  ]
  const renderContribution = (contribution: NavigationContribution, tooltipPlacement: 'left' | 'right') => (
    <ToolRailButton
      key={contribution.id}
      label={contribution.title}
      tooltipPlacement={tooltipPlacement}
      selected={toolPanel === `plugin:${contribution.id}`}
      onClick={() =>
        onToggleTool(`plugin:${contribution.id}`, contribution.title, 'plugin', contributionPlacement(contribution), { panelId: contribution.id })
      }
      draggable
      onDragStart={(event) => {
        draggingTool.current = contribution.id
        activeToolDrag = contribution.id
        document.body.dataset.hbarDraggingTool = contribution.id
        onDragState?.(contribution.id)
        event.dataTransfer.setData('application/x-hbar-tool', contribution.id)
      }}
      onDragEnd={(event) => {
        // Keep the source identity until the drop target consumes it. Native
        // HTML5 drag events can clear DataTransfer before `drop` bubbles.
        finishToolDrag(contribution.id, event)
      }}
      onDrop={(event) => reorderTool(contribution.id, event)}
      onKeyboardMove={(direction) => moveToolByKeyboard(contribution.id, direction)}
    >
      {(() => {
        const Icon = contribution.icon ? CONTRIBUTION_ICONS[contribution.icon] ?? LayoutGrid : LayoutGrid
        return <Icon size={18} />
      })()}
    </ToolRailButton>
  )
  function reorderTool(target: string, event?: React.DragEvent<HTMLButtonElement>) {
    const source =
      event?.dataTransfer.getData('application/x-hbar-tool') ||
      draggingTool.current ||
      activeToolDrag ||
      document.body.dataset.hbarDraggingTool ||
      null
    draggingTool.current = null
    activeToolDrag = null
    delete document.body.dataset.hbarDraggingTool
    onDragState?.(null)
    if (!source || source === target) return
    onReorderTool(source, target)
  }
  function dropOnRail(event: React.DragEvent<HTMLElement>, rail: 'left' | 'right') {
    event.preventDefault()
    const source =
      event.dataTransfer.getData('application/x-hbar-tool') ||
      draggingTool.current ||
      activeToolDrag ||
      document.body.dataset.hbarDraggingTool ||
      null
    draggingTool.current = null
    activeToolDrag = null
    delete document.body.dataset.hbarDraggingTool
    if (source) onMoveTool(source, rail)
    onDragState?.(null)
  }
  function finishToolDrag(id: string, event: React.DragEvent<HTMLButtonElement>) {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.tool-rail')
    if (target) onMoveTool(id, target.classList.contains('left-rail') ? 'left' : 'right')
    draggingTool.current = null
    if (activeToolDrag === id) activeToolDrag = null
    delete document.body.dataset.hbarDraggingTool
    onDragState?.(null)
  }
  function moveToolByKeyboard(source: string, direction: 'up' | 'down' | 'left' | 'right') {
    const currentSide = toolSides[source] ?? 'right'
    if (direction === 'left' || direction === 'right') {
      const targetSide = direction === 'left' ? 'left' : 'right'
      if (targetSide !== currentSide) onMoveTool(source, targetSide)
      return
    }
    const siblings = toolOrder.filter((id) => toolSides[id] === currentSide)
    const index = siblings.indexOf(source)
    if (index < 0) return
    const target = siblings[index + (direction === 'up' ? -1 : 1)]
    if (target) onReorderTool(source, target)
  }
  return (
    <>
      {side !== 'right' && (
        <nav
          className="tool-rail left-rail"
          aria-label={t('mainNavigation')}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => dropOnRail(event, 'left')}
        >
          {showPrimary && <>
            <ToolRailButton
              label={t('sessions')}
              tooltipPlacement="right"
              selected={panel === 'sessions'}
              onClick={() => onSelectPrimary('sessions')}
            >
              <MessageSquare size={19} />
            </ToolRailButton>
            <ToolRailButton
              label={t('files')}
              tooltipPlacement="right"
              selected={panel === 'files'}
              onClick={() => onSelectPrimary('files')}
            >
              <Folder size={19} />
            </ToolRailButton>
          </>}
          {toolOrder
            .filter((id) => toolSides[id] === 'left')
            .map((id) => {
              const tool = rightTools[id as keyof typeof rightTools]
              if (!tool) return null
              const Icon = tool.icon
              const panelId = id === 'diagnose' ? diagnosePanelId : id
              return (
                <ToolRailButton
                  key={id}
                  label={tool.title}
                  tooltipPlacement="right"
                  tone={tool.tone}
                  selected={toolPanel === panelId}
                  draggable
                  onDragStart={(event) => {
                    draggingTool.current = id
                    activeToolDrag = id
                    document.body.dataset.hbarDraggingTool = id
                    onDragState?.(id)
                    event.dataTransfer.setData('application/x-hbar-tool', id)
                  }}
                  onDragEnd={(event) => {
                    // The rail drop handler owns cleanup after consuming the
                    // source; this keeps drag-to-rail reliable in Chromium.
                    finishToolDrag(id, event)
                  }}
                  onDrop={(event) => reorderTool(id, event)}
                  onKeyboardMove={(direction) => moveToolByKeyboard(id, direction)}
                  onClick={() =>
                    onToggleTool(
                      panelId,
                      tool.id === 'activity' ? t('running') : tool.title,
                      tool.component,
                      tool.placement,
                    )
                  }
                >
                  <Icon size={18} />
                </ToolRailButton>
              )
            })}
          {orderedContributions.filter((contribution) => (toolSides[contribution.id] ?? 'right') === 'left').map((contribution) =>
            renderContribution(contribution, 'right'),
          )}
        </nav>
      )}
      {side !== 'left' && (
        <nav
          className="tool-rail right-rail"
          aria-label={t('toolWindow')}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => dropOnRail(event, 'right')}
        >
          {toolOrder
            .filter((id) => toolSides[id] === 'right')
            .map((id) => {
              const tool = rightTools[id as keyof typeof rightTools]
              if (!tool) return null
              const Icon = tool.icon
              const panelId = id === 'diagnose' ? diagnosePanelId : id
              return (
                <ToolRailButton
                  key={id}
                  label={tool.title}
                  tooltipPlacement="left"
                  tone={tool.tone}
                  selected={toolPanel === panelId}
                  draggable
                  onDragStart={(event) => {
                    draggingTool.current = id
                    activeToolDrag = id
                    document.body.dataset.hbarDraggingTool = id
                    onDragState?.(id)
                    event.dataTransfer.setData('application/x-hbar-tool', id)
                  }}
                  onDragEnd={(event) => {
                    // The rail drop handler owns cleanup after consuming the
                    // source; this keeps drag-to-rail reliable in Chromium.
                    finishToolDrag(id, event)
                  }}
                  onDrop={(event) => reorderTool(id, event)}
                  onKeyboardMove={(direction) => moveToolByKeyboard(id, direction)}
                  onClick={() =>
                    onToggleTool(
                      panelId,
                      tool.id === 'activity' ? t('running') : tool.title,
                      tool.component,
                      tool.placement,
                    )
                  }
                >
                  <Icon size={18} />
                </ToolRailButton>
              )
            })}
          {orderedContributions.filter((contribution) => (toolSides[contribution.id] ?? 'right') === 'right').map((contribution) =>
            renderContribution(contribution, 'left'),
          )}
        </nav>
      )}
    </>
  )
}

export function MobileNavigation({
  mobileView,
  onSetMobileView,
}: Pick<WorkbenchNavigationProps, 'mobileView' | 'onSetMobileView'>) {
  const { t } = useLocale()
  const mobilePrimaryLabels = { sessions: t('sessions'), chat: t('chat'), files: t('files'), activity: t('running') }
  const activePrimary =
    mobileView === 'file'
      ? 'files'
      : MOBILE_PRIMARY_ITEMS.some((item) => item.id === mobileView)
        ? mobileView
        : 'plugins'
  return (
    <nav className="mobile-nav" aria-label={t('mobileNavigation')}>
      <GlassSurface className="chrome-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="mobile-nav-items">
        {MOBILE_PRIMARY_ITEMS.map(({ id, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={activePrimary === id ? 'selected' : ''}
            aria-label={mobilePrimaryLabels[id]}
            aria-current={activePrimary === id ? 'page' : undefined}
            onClick={() => onSetMobileView(id)}
          >
            <Icon size={18} />
            <span>{mobilePrimaryLabels[id]}</span>
          </button>
        ))}
        <button
          type="button"
          className={activePrimary === 'plugins' ? 'selected' : ''}
          aria-label={t('more')}
          aria-current={activePrimary === 'plugins' ? 'page' : undefined}
          onClick={() => onSetMobileView('plugins')}
        >
          <MoreHorizontal size={20} />
          <span>{t('more')}</span>
        </button>
      </div>
    </nav>
  )
}

export function MobileToolMenu({
  contributions,
  onOpenTool,
  onClose,
}: Pick<WorkbenchNavigationProps, 'contributions' | 'onOpenTool'> & { onClose(): void }) {
  const { t } = useLocale()
  const mobileTools = {
    browser: { title: t('browser'), description: t('browserToolDescription') },
    inspector: { title: t('sessionInspector'), description: t('inspectorToolDescription') },
    plan: { title: t('plan'), description: t('planToolDescription') },
    insights: { title: t('sessionInsights'), description: t('insightsToolDescription') },
    diagnose: { title: t('diagnose'), description: t('diagnoseToolDescription') },
  }
  const mobileMore = {
    terminal: { title: t('commandConsole'), description: t('commandConsoleDescription') },
    'system-terminal': { title: t('systemTerminal'), description: t('systemTerminalDescription') },
    settings: { title: t('settingsTitle'), description: t('settingsDescription') },
  }
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => closeButton.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <FloatingSurface
      mode="modal"
      open
      onClose={onClose}
      backdropClassName="mobile-more-backdrop"
      className="plugin-panel rb-plugin-panel mobile-more-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-more-title"
    >
      <section
        className="mobile-more-content"
      >
        <GlassSurface className="plugin-panel-glass" width="100%" height="100%" aria-hidden="true" />
        <header className="mobile-more-header">
          <div>
            <span className="mobile-more-eyebrow">{t('workbench')}</span>
            <h2 id="mobile-more-title">{t('more')}</h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            className="mobile-more-close"
            aria-label={t('closeMore')}
            title={t('closeMore')}
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <h3 className="mobile-tool-heading">{t('workbench')}</h3>
        <div className="mobile-more-grid" aria-label={`${t('more')} ${t('workbench')}`}>
          {MOBILE_MORE_ITEMS.map(({ id, icon: Icon, component, placement }) => {
            const copy = mobileMore[id]
            return (
            <button
              type="button"
              key={id}
              className="new-session mobile-more-action"
              aria-label={copy.title}
              title={copy.description}
              onClick={() => onOpenTool(id, copy.title, component, placement)}
            >
              <Icon size={16} />
              <span>{copy.title}</span>
              <small>{copy.description}</small>
            </button>
            )
          })}
        </div>
        <h3 className="mobile-tool-heading">{t('sessionTools')}</h3>
        <div className="mobile-tool-grid" aria-label={t('toolWindow')}>
          {MOBILE_TOOLS.map(({ id, icon: Icon }) => {
            const title = mobileTools[id as keyof typeof mobileTools]?.title ?? id
            return <button type="button" key={id} className="new-session" onClick={() => onOpenTool(id, title, id, 'right')}>
              <Icon size={16} />
              {title}
            </button>
          })}
        </div>
        <h3 className="mobile-tool-heading">{t('pluginPanels')}</h3>
        {contributions.map((contribution) => (
          <button
            type="button"
            key={contribution.id}
            className="new-session"
            onClick={() =>
              onOpenTool(
                `plugin:${contribution.id}`,
                contribution.title,
                'plugin',
                contributionPlacement(contribution),
                { panelId: contribution.id },
              )
            }
          >
            <LayoutGrid size={16} />
            {contribution.title}
          </button>
        ))}
      </section>
    </FloatingSurface>
  )
}
