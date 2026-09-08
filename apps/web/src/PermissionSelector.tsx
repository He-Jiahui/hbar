import { Check, ChevronDown, Eye, ShieldCheck, Unlock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ApprovalMode } from '@hbar/contracts'
import { permissionPreset, permissionPresets } from './permissions'
import { setApprovalMode, useWorkbench } from './stores'

export interface PermissionSelectorProps {
  compact?: boolean
  className?: string
}

function ModeIcon({ mode }: { mode: ApprovalMode }) {
  if (mode === 'allow') return <Unlock size={14} />
  if (mode === 'deny') return <Eye size={14} />
  return <ShieldCheck size={14} />
}

export default function PermissionSelector({ compact = true, className = '' }: PermissionSelectorProps) {
  const mode = useWorkbench((state) => state.approvalMode)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const selected = permissionPreset(mode)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className={`permission-selector ${compact ? 'permission-selector-compact' : ''} ${className}`.trim()} ref={root}>
      <button
        type="button"
        className={`permission-trigger permission-tone-${selected.tone}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={selected.description}
        onClick={() => setOpen((value) => !value)}
      >
        <ModeIcon mode={selected.id} />
        <span>{compact ? selected.shortLabel : selected.label}</span>
        <ChevronDown size={13} className={open ? 'permission-chevron-open' : ''} />
      </button>
      {open && (
        <div className="permission-menu" role="menu" aria-label="权限模式">
          <div className="permission-menu-heading">工具权限</div>
          {permissionPresets.map((preset) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={preset.id === selected.id}
              className={`permission-option permission-tone-${preset.tone} ${preset.id === selected.id ? 'selected' : ''}`}
              key={preset.id}
              onClick={() => {
                void setApprovalMode(preset.id)
                setOpen(false)
              }}
            >
              <ModeIcon mode={preset.id} />
              <span className="permission-option-copy">
                <strong>{preset.label}</strong>
                <small>{preset.description}</small>
              </span>
              {preset.id === selected.id && <Check size={14} />}
            </button>
          ))}
          <div className="permission-menu-footer">可在设置中修改默认模式</div>
        </div>
      )}
    </div>
  )
}
