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
import { createPortal } from 'react-dom'
import GlassIconButton from '../react-bits/GlassIconButton'
import GlassSurface from '../react-bits/GlassSurface'
import './WorkbenchNavigation.css'

export type PrimaryPanel = 'sessions' | 'files'

export interface NavigationContribution {
  id: string
  title: string
  placement?: 'left' | 'right' | 'bottom' | 'editor'
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
    placement: 'left' | 'right' | 'bottom' | 'editor',
    config?: Record<string, unknown>,
  ): void
  onToggleTool(id: string, title: string, component: string, placement: 'left' | 'right' | 'bottom' | 'editor'): void
  onSetMobileView(view: string): void
  toolOrder: readonly string[]
  toolSides: Readonly<Record<string, 'left' | 'right'>>
  onMoveTool(id: string, side: 'left' | 'right'): void
  onReorderTool(source: string, target: string): void
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

function contributionPlacement(placement: NavigationContribution['placement']): 'left' | 'right' | 'bottom' | 'editor' {
  return placement ?? 'right'
}

function ToolRailButton({
  label,
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
  const [dragging, setDragging] = useState(false)
  return (
    <GlassIconButton
      label={label}
      tone={tone}
      title={label}
      aria-label={label}
      aria-pressed={selected}
      aria-grabbed={dragging}
      aria-roledescription={draggable ? '可拖动工具' : undefined}
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
  onOpenTool,
  onToggleTool,
  toolOrder,
  toolSides,
  onMoveTool,
  onReorderTool,
  side = 'both',
}: Pick<
  WorkbenchNavigationProps,
  | 'panel'
  | 'toolPanel'
  | 'diagnosePanelId'
  | 'contributions'
  | 'onSelectPrimary'
  | 'onOpenTool'
  | 'onToggleTool'
  | 'toolOrder'
  | 'toolSides'
  | 'onMoveTool'
  | 'onReorderTool'
> & { side?: 'left' | 'right' | 'both' }) {
  const draggingTool = useRef<string | null>(null)
  const rightTools = {
    browser: {
      title: '浏览器',
      component: 'browser',
      icon: Globe,
      tone: 'accent' as const,
      placement: 'right' as const,
    },
    git: { title: 'Git', component: 'git', icon: GitBranch, tone: 'neutral' as const, placement: 'right' as const },
    inspector: {
      title: '会话检查',
      component: 'inspector',
      icon: FileSearch,
      tone: 'accent' as const,
      placement: 'right' as const,
    },
    plan: { title: '计划', component: 'plan', icon: ListChecks, tone: 'accent' as const, placement: 'right' as const },
    insights: {
      title: '会话洞察',
      component: 'insights',
      icon: BarChart3,
      tone: 'status' as const,
      placement: 'right' as const,
    },
    activity: {
      title: '运行与事件',
      component: 'activity',
      icon: Activity,
      tone: 'status' as const,
      placement: 'right' as const,
    },
    settings: {
      title: '设置',
      component: 'settings',
      icon: Settings2,
      tone: 'neutral' as const,
      placement: 'editor' as const,
    },
    diagnose: {
      title: '诊断',
      component: 'diagnose',
      icon: CircleHelp,
      tone: 'warning' as const,
      placement: 'right' as const,
    },
  } as const
  function reorderTool(target: string, event?: React.DragEvent<HTMLButtonElement>) {
    const source = event?.dataTransfer.getData('application/x-hbar-tool') || draggingTool.current
    draggingTool.current = null
    if (!source || source === target) return
    onReorderTool(source, target)
  }
  function dropOnRail(event: React.DragEvent<HTMLElement>, rail: 'left' | 'right') {
    event.preventDefault()
    const source = event.dataTransfer.getData('application/x-hbar-tool') || draggingTool.current
    draggingTool.current = null
    if (source) onMoveTool(source, rail)
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
          aria-label="主导航"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => dropOnRail(event, 'left')}
        >
          <ToolRailButton label="会话" selected={panel === 'sessions'} onClick={() => onSelectPrimary('sessions')}>
            <MessageSquare size={19} />
          </ToolRailButton>
          <ToolRailButton label="文件" selected={panel === 'files'} onClick={() => onSelectPrimary('files')}>
            <Folder size={19} />
          </ToolRailButton>
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
                  tone={tool.tone}
                  selected={toolPanel === panelId}
                  draggable
                  onDragStart={(event) => {
                    draggingTool.current = id
                    event.dataTransfer.setData('application/x-hbar-tool', id)
                  }}
                  onDragEnd={() => {
                    draggingTool.current = null
                  }}
                  onDrop={(event) => reorderTool(id, event)}
                  onKeyboardMove={(direction) => moveToolByKeyboard(id, direction)}
                  onClick={() =>
                    onToggleTool(
                      panelId,
                      tool.title === '运行与事件' ? '运行' : tool.title,
                      tool.component,
                      tool.placement,
                    )
                  }
                >
                  <Icon size={18} />
                </ToolRailButton>
              )
            })}
        </nav>
      )}
      {side !== 'left' && (
        <nav
          className="tool-rail right-rail"
          aria-label="工具窗口"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => dropOnRail(event, 'right')}
        >
          {toolOrder
            .filter((id) => toolSides[id] === 'right')
            .map((id) => {
              const tool = rightTools[id as keyof typeof rightTools]
              const Icon = tool.icon
              const panelId = id === 'diagnose' ? diagnosePanelId : id
              return (
                <ToolRailButton
                  key={id}
                  label={tool.title}
                  tone={tool.tone}
                  selected={toolPanel === panelId}
                  draggable
                  onDragStart={(event) => {
                    draggingTool.current = id
                    event.dataTransfer.setData('application/x-hbar-tool', id)
                  }}
                  onDragEnd={() => {
                    draggingTool.current = null
                  }}
                  onDrop={(event) => reorderTool(id, event)}
                  onKeyboardMove={(direction) => moveToolByKeyboard(id, direction)}
                  onClick={() =>
                    onToggleTool(
                      panelId,
                      tool.title === '运行与事件' ? '运行' : tool.title,
                      tool.component,
                      tool.placement,
                    )
                  }
                >
                  <Icon size={18} />
                </ToolRailButton>
              )
            })}
          {contributions.map((contribution) => (
            <ToolRailButton
              key={contribution.id}
              label={contribution.title}
              selected={toolPanel === `plugin:${contribution.id}`}
              onClick={() =>
                onOpenTool(
                  `plugin:${contribution.id}`,
                  contribution.title,
                  'plugin',
                  contributionPlacement(contribution.placement),
                  { panelId: contribution.id },
                )
              }
            >
              <LayoutGrid size={18} />
            </ToolRailButton>
          ))}
        </nav>
      )}
    </>
  )
}

export function MobileNavigation({
  mobileView,
  onSetMobileView,
}: Pick<WorkbenchNavigationProps, 'mobileView' | 'onSetMobileView'>) {
  const activePrimary =
    mobileView === 'file'
      ? 'files'
      : MOBILE_PRIMARY_ITEMS.some((item) => item.id === mobileView)
        ? mobileView
        : 'plugins'
  return (
    <nav className="mobile-nav" aria-label="移动导航">
      <GlassSurface className="chrome-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="mobile-nav-items">
        {MOBILE_PRIMARY_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={activePrimary === id ? 'selected' : ''}
            aria-label={label}
            aria-current={activePrimary === id ? 'page' : undefined}
            onClick={() => onSetMobileView(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
        <button
          type="button"
          className={activePrimary === 'plugins' ? 'selected' : ''}
          aria-label="更多"
          aria-current={activePrimary === 'plugins' ? 'page' : undefined}
          onClick={() => onSetMobileView('plugins')}
        >
          <MoreHorizontal size={20} />
          <span>更多</span>
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
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => closeButton.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return createPortal(
    <div
      className="mobile-more-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="plugin-panel rb-plugin-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-more-title"
      >
        <GlassSurface className="plugin-panel-glass" width="100%" height="100%" aria-hidden="true" />
        <header className="mobile-more-header">
          <div>
            <span className="mobile-more-eyebrow">工作台</span>
            <h2 id="mobile-more-title">更多</h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            className="mobile-more-close"
            aria-label="关闭更多"
            title="关闭更多"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <h3 className="mobile-tool-heading">工作台</h3>
        <div className="mobile-more-grid" aria-label="更多工作台功能">
          {MOBILE_MORE_ITEMS.map(({ id, title, description, icon: Icon, component, placement }) => (
            <button
              type="button"
              key={id}
              className="new-session mobile-more-action"
              aria-label={title}
              title={description}
              onClick={() => onOpenTool(id, title, component, placement)}
            >
              <Icon size={16} />
              <span>{title}</span>
              <small>{description}</small>
            </button>
          ))}
        </div>
        <h3 className="mobile-tool-heading">会话工具</h3>
        <div className="mobile-tool-grid" aria-label="工具窗口">
          {MOBILE_TOOLS.map(({ id, title, icon: Icon }) => (
            <button type="button" key={id} className="new-session" onClick={() => onOpenTool(id, title, id, 'right')}>
              <Icon size={16} />
              {title}
            </button>
          ))}
        </div>
        <h3 className="mobile-tool-heading">插件面板</h3>
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
                contributionPlacement(contribution.placement),
                { panelId: contribution.id },
              )
            }
          >
            <LayoutGrid size={16} />
            {contribution.title}
          </button>
        ))}
      </section>
    </div>,
    document.body,
  )
}
