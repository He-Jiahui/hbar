import { Check, ChevronDown, Eye, LoaderCircle, ShieldCheck, Unlock } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ApprovalMode } from '@hbar/contracts'
import { permissionPreset, permissionPresets } from './permissions'
import { report, setApprovalMode, useWorkbench } from './stores'
import GlassSurface from './react-bits/GlassSurface'
import SpotlightCard from './react-bits/SpotlightCard'
import { FloatingSurface, useFloatingTrigger } from './FloatingLayer'
import { useLocale } from './locale'

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

function localizedPreset(mode: ApprovalMode, t: ReturnType<typeof useLocale>['t']) {
  const keys = {
    ask: ['permissionAskLabel', 'permissionAskShort', 'permissionAskDescription'],
    allow: ['permissionAllowLabel', 'permissionAllowShort', 'permissionAllowDescription'],
    deny: ['permissionDenyLabel', 'permissionDenyShort', 'permissionDenyDescription'],
  } as const
  const [label, shortLabel, description] = keys[mode].map((key) => t(key))
  return { label, shortLabel, description }
}

export default function PermissionSelector({
  compact = true,
  className = '',
  placement = 'above',
}: PermissionSelectorProps) {
  const { t } = useLocale()
  const mode = useWorkbench((state) => state.approvalMode)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<ApprovalMode | null>(null)
  const [failure, setFailure] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const selected = permissionPreset(mode)
  const selectedCopy = localizedPreset(selected.id, t)
  const triggerProps = useFloatingTrigger({
    open,
    onOpen: () => {
      if (!pending) {
        setFailure('')
        setOpen(true)
      }
    },
    onClose: () => setOpen(false),
  })

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
    else if (useWorkbench.getState().approvalMode === next) setFailure(t('saveFailure'))
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
        title={selectedCopy.description}
        {...triggerProps}
      >
        {pending ? <LoaderCircle size={14} className="spinning" /> : <ModeIcon mode={selected.id} />}
        <span>{compact ? selectedCopy.shortLabel : selectedCopy.label}</span>
        <ChevronDown size={13} className={open ? 'permission-chevron-open' : ''} />
      </button>
      <FloatingSurface
        anchorRef={trigger}
        open={open}
        onClose={() => setOpen(false)}
        placement={placement}
        className="permission-menu rb-menu-surface"
        role="menu"
        aria-label={t('permissionMode')}
        aria-busy={pending !== null}
      >
        <GlassSurface className="rb-menu-glass" width="100%" height="100%" aria-hidden="true" />
        <div className="permission-menu-heading">{t('toolPermissions')}</div>
        {permissionPresets.map((preset) => (
          (() => {
            const copy = localizedPreset(preset.id, t)
            return (
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
                <strong>{copy.label}</strong>
                <small>{copy.description}</small>
              </span>
              {preset.id === selected.id && <Check size={14} />}
            </button>
          </SpotlightCard>
            )
          })()
        ))}
        {failure && (
          <div className="inline-error" role="alert">
            {failure}
          </div>
        )}
        <div className="permission-menu-footer">{t('permissionSettingsHint')}</div>
      </FloatingSurface>
    </div>
  )
}
