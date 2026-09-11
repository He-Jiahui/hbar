import { Folder, Network, ShieldCheck } from 'lucide-react'
import GlassSurface from '../react-bits/GlassSurface'
import './WorkbenchStatusBar.css'

export interface WorkbenchStatusBarProps {
  workspacePath: string
  modelLabel: string
  permissionLabel: string
  running: boolean
  contextTokens: number
  activeRuns: number
  version?: string
}

export default function WorkbenchStatusBar({
  workspacePath,
  modelLabel,
  permissionLabel,
  running,
  contextTokens,
  activeRuns,
  version = '0.1.0',
}: WorkbenchStatusBarProps) {
  return (
    <footer className="statusbar rb-statusbar" aria-label="工作台状态">
      <GlassSurface className="chrome-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="statusbar-primary">
        <span className="status-item status-workspace" data-status-item="workspace" title="当前工作区">
          <Folder size={12} aria-hidden="true" />
          <span className="status-value status-workspace-value">{workspacePath}</span>
        </span>
        <span className="status-item status-provider" data-status-item="provider" title="当前模型">
          <Network size={12} aria-hidden="true" />
          <span className="status-value">{modelLabel}</span>
        </span>
        <span className="status-item status-agent" data-status-item="agent-status" title="会话状态">
          <i className={running ? 'running' : ''} aria-hidden="true" />
          <span className="status-value">{running ? 'Running' : 'Idle'}</span>
        </span>
        <span className="status-item status-permission" data-status-item="permission" title="工具权限">
          <ShieldCheck size={12} aria-hidden="true" />
          <span className="status-value">{permissionLabel}</span>
        </span>
      </div>
      <span className="status-spacer" />
      <div className="statusbar-secondary">
        <span className="status-item" data-status-item="context" title="上下文使用量">
          <span className="status-key">Context</span>
          <span className="status-value">{contextTokens.toLocaleString()}</span>
        </span>
        <span className="status-item" data-status-item="turn-tokens" title="当前活动运行">
          <span className="status-value">{activeRuns} active</span>
        </span>
        <span className="status-item status-low-priority" data-status-item="encoding">
          UTF-8
        </span>
        <span className="status-item status-low-priority" data-status-item="version">
          {version}
        </span>
      </div>
    </footer>
  )
}
