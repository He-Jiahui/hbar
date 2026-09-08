import { Check, ChevronDown, Eye, LoaderCircle, ShieldCheck, Unlock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ApprovalMode } from '@hbar/contracts'
import { permissionPreset, permissionPresets } from './permissions'
import { report, setApprovalMode, useWorkbench } from './stores'

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

export default function PermissionSelector({ compact = true, className = '', placement = 'above' }: PermissionSelectorProps) {
  const mode = useWorkbench((state) => state.approvalMode)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<ApprovalMode | null>(null)
  const [failure, setFailure] = useState('')
  const root = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!pending && !root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, pending])

  return (
    <div
      className={`permission-selector permission-placement-${placement} ${compact ? 'permission-selector-compact' : ''} ${className}`.trim()}
      ref={root}
    >
      <button
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
      {open && (
        <div className="permission-menu" role="menu" aria-label="权限模式" aria-busy={pending !== null}>
          <div className="permission-menu-heading">工具权限</div>
          {permissionPresets.map((preset) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={preset.id === selected.id}
              className={`permission-option permission-tone-${preset.tone} ${preset.id === selected.id ? 'selected' : ''}`}
              disabled={pending !== null}
              key={preset.id}
              onClick={() => void choose(preset.id)}
            >
              {pending === preset.id ? <LoaderCircle size={14} className="spinning" /> : <ModeIcon mode={preset.id} />}
              <span className="permission-option-copy">
                <strong>{preset.label}</strong>
                <small>{preset.description}</small>
              </span>
              {preset.id === selected.id && <Check size={14} />}
            </button>
          ))}
          {failure && <div className="inline-error" role="alert">{failure}</div>}
          <div className="permission-menu-footer">可在设置中修改默认模式</div>
        </div>
      )}
    </div>
  )
}
