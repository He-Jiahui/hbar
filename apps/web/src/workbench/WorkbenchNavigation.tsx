import {
  Activity,
  CircleHelp,
  FileSearch,
  Folder,
  Globe,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Settings2,
  TerminalSquare,
} from 'lucide-react'
import { useEffect } from 'react'
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
  onRestoreLayout(): void
  onSetMobileView(view: string): void
}

const MOBILE_TOOLS = [
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
  { id: 'terminal', title: '终端', description: '执行会话命令与查看输出', icon: TerminalSquare, component: 'terminal', placement: 'bottom' },
  { id: 'settings', title: '设置', description: '模型、权限、存储与设备', icon: Settings2, component: 'settings', placement: 'editor' },
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
}: {
  label: string
  selected?: boolean
  tone?: 'accent' | 'status' | 'warning' | 'neutral'
  onClick(): void
  children: React.ReactNode
}) {
  return (
    <GlassIconButton
      label={label}
      tone={tone}
      title={label}
      aria-label={label}
      aria-pressed={selected}
      className={selected ? 'selected' : ''}
      onClick={onClick}
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
  onRestoreLayout,
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
  | 'onRestoreLayout'
> & { side?: 'left' | 'right' | 'both' }) {
  return (
    <>
      {side !== 'right' && (
        <nav className="tool-rail left-rail" aria-label="主导航">
        <ToolRailButton label="会话" selected={panel === 'sessions'} onClick={() => onSelectPrimary('sessions')}>
          <MessageSquare size={19} />
        </ToolRailButton>
        <ToolRailButton label="文件" selected={panel === 'files'} onClick={() => onSelectPrimary('files')}>
          <Folder size={19} />
        </ToolRailButton>
        <span />
        <ToolRailButton
          label="诊断"
          tone="warning"
          selected={toolPanel === diagnosePanelId}
          onClick={() => onOpenTool(diagnosePanelId, '诊断', 'diagnose', 'right')}
        >
          <CircleHelp size={18} />
        </ToolRailButton>
        <ToolRailButton label="恢复默认布局" tone="neutral" onClick={onRestoreLayout}>
          <LayoutGrid size={18} />
        </ToolRailButton>
        </nav>
      )}
      {side !== 'left' && (
        <nav className="tool-rail right-rail" aria-label="工具窗口">
        <ToolRailButton
          label="浏览器"
          selected={toolPanel === 'browser'}
          onClick={() => onToggleTool('browser', '浏览器', 'browser', 'right')}
        >
          <Globe size={18} />
        </ToolRailButton>
        <ToolRailButton
          label="会话检查"
          selected={toolPanel === 'inspector'}
          onClick={() => onToggleTool('inspector', '会话检查', 'inspector', 'right')}
        >
          <FileSearch size={18} />
        </ToolRailButton>
        <ToolRailButton
          label="计划"
          selected={toolPanel === 'plan'}
          onClick={() => onToggleTool('plan', '计划', 'plan', 'right')}
        >
          <ListChecks size={18} />
        </ToolRailButton>
        <ToolRailButton
          label="会话洞察"
          tone="status"
          selected={toolPanel === 'insights'}
          onClick={() => onToggleTool('insights', '会话洞察', 'insights', 'right')}
        >
          <Activity size={18} />
        </ToolRailButton>
        <ToolRailButton
          label="终端"
          tone="neutral"
          selected={toolPanel === 'terminal'}
          onClick={() => onToggleTool('terminal', '终端', 'terminal', 'bottom')}
        >
          <TerminalSquare size={18} />
        </ToolRailButton>
        <ToolRailButton
          label="运行与事件"
          tone="status"
          selected={toolPanel === 'activity'}
          onClick={() => onToggleTool('activity', '运行', 'activity', 'right')}
        >
          <Activity size={18} />
        </ToolRailButton>
        <ToolRailButton
          label="设置"
          tone="neutral"
          selected={toolPanel === 'settings'}
          onClick={() => onToggleTool('settings', '设置', 'settings', 'editor')}
        >
          <Settings2 size={18} />
        </ToolRailButton>
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
        <span />
        <ToolRailButton
          label="诊断"
          tone="warning"
          selected={toolPanel === diagnosePanelId}
          onClick={() => onToggleTool(diagnosePanelId, '诊断', 'diagnose', 'right')}
        >
          <CircleHelp size={18} />
        </ToolRailButton>
        </nav>
      )}
    </>
  )
}

export function MobileNavigation({ mobileView, onSetMobileView }: Pick<WorkbenchNavigationProps, 'mobileView' | 'onSetMobileView'>) {
  const activePrimary = mobileView === 'file'
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

  return (
    <div
      className="mobile-more-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="plugin-panel rb-plugin-panel" role="dialog" aria-modal="true" aria-label="工具与插件">
        <GlassSurface className="plugin-panel-glass" width="100%" height="100%" aria-hidden="true" />
        <header className="mobile-more-header">
          <div>
            <span className="mobile-more-eyebrow">工作台</span>
            <h2>更多</h2>
          </div>
          <button type="button" className="mobile-more-close" aria-label="关闭更多" title="关闭更多" onClick={onClose}>
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
            <button
              type="button"
              key={id}
              className="new-session"
              onClick={() => onOpenTool(id, title, id, 'right')}
            >
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
    </div>
  )
}
