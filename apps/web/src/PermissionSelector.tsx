import { Check, ChevronDown, Eye, LoaderCircle, ShieldCheck, Unlock } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ApprovalMode } from '@hbar/contracts'
import { permissionPreset, permissionPresets } from './permissions'
import { report, setApprovalMode, useWorkbench } from './stores'
import GlassSurface from './react-bits/GlassSurface'
import SpotlightCard from './react-bits/SpotlightCard'
import FloatingLayer from './FloatingLayer'

export interface PermissionSelectorProps {
  compact?: boolean
  className?: string
  placement?: 'above' | 'below'
}

function ModeIcon({ mode }: { mode: ApprovalMode }) {
  if (mode === 'allow') return <Unlock size={14} />
  if (mode === 'deny') return <Eye size={14} />
  return <ShieldCheck size={14} />
}

export default function PermissionSelector({
  compact = true,
  className = '',
  placement = 'above',
}: PermissionSelectorProps) {
  const mode = useWorkbench((state) => state.approvalMode)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<ApprovalMode | null>(null)
  const [failure, setFailure] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const selected = permissionPreset(mode)

  async function choose(next: ApprovalMode) {
    if (pending) return
    if (next === selected.id) {
      setOpen(false)
      return
    }
    setPending(next)
    setFailure('')
    const saved = await setApprovalMode(next).catch((error: unknown) => {
      report(error)
      return false
    })
    setPending(null)
    if (saved) setOpen(false)
    else if (useWorkbench.getState().approvalMode === next) setFailure('保存失败，当前模式未改变。请重试。')
  }

  return (
    <div
      className={`permission-selector permission-placement-${placement} ${compact ? 'permission-selector-compact' : ''} ${className}`.trim()}
    >
      <button
        ref={trigger}
        type="button"
        className={`permission-trigger permission-tone-${selected.tone}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={pending !== null}
        disabled={pending !== null}
        title={selected.description}
        onClick={() => {
          if (!pending) {
            setFailure('')
            setOpen((value) => !value)
          }
        }}
      >
        {pending ? <LoaderCircle size={14} className="spinning" /> : <ModeIcon mode={selected.id} />}
        <span>{compact ? selected.shortLabel : selected.label}</span>
        <ChevronDown size={13} className={open ? 'permission-chevron-open' : ''} />
      </button>
      <FloatingLayer
        anchorRef={trigger}
        open={open}
        onClose={() => setOpen(false)}
        placement={placement}
        className="permission-menu rb-menu-surface"
        role="menu"
        aria-label="权限模式"
        aria-busy={pending !== null}
      >
        <GlassSurface className="rb-menu-glass" width="100%" height="100%" aria-hidden="true" />
        <div className="permission-menu-heading">工具权限</div>
        {permissionPresets.map((preset) => (
          <SpotlightCard
            className={`permission-option-card permission-tone-${preset.tone} ${preset.id === selected.id ? 'selected' : ''}`}
            key={preset.id}
            role="presentation"
            spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
          >
            <button
              type="button"
              role="menuitemradio"
              aria-checked={preset.id === selected.id}
              className={`permission-option permission-tone-${preset.tone} ${preset.id === selected.id ? 'selected' : ''}`}
              disabled={pending !== null}
              onClick={() => void choose(preset.id)}
            >
              {pending === preset.id ? <LoaderCircle size={14} className="spinning" /> : <ModeIcon mode={preset.id} />}
              <span className="permission-option-copy">
                <strong>{preset.label}</strong>
                <small>{preset.description}</small>
              </span>
              {preset.id === selected.id && <Check size={14} />}
            </button>
          </SpotlightCard>
        ))}
        {failure && (
          <div className="inline-error" role="alert">
            {failure}
          </div>
        )}
        <div className="permission-menu-footer">可在设置中修改默认模式</div>
      </FloatingLayer>
    </div>
  )
}
