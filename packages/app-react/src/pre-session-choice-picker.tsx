import { useId, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { LumenButton, LumenDialog, LumenFrame, LumenIcon, LumenInput, LumenText } from '@lumen/app-ui'
import './pre-session-choice-picker.css'

export interface HbarPreSessionChoice {
  readonly id: string
  readonly label: string
  readonly detail?: string
}

export interface HbarPreSessionChoiceLabels {
  readonly title: string
  readonly trigger: (selected: string | null) => string
  readonly search: string
  readonly empty: string
  readonly noMatches: string
  readonly more: (remaining: number | null) => string
  readonly close: string
  readonly error: (code: string) => string
}

export interface HbarPreSessionChoicePickerProps {
  readonly icon: LucideIcon
  readonly labels: HbarPreSessionChoiceLabels
  readonly items: readonly HbarPreSessionChoice[]
  readonly selectedId: string | null
  readonly disabled?: boolean
  readonly loading?: boolean
  readonly hasMore?: boolean
  readonly onMore?: (() => void) | undefined
  readonly onChoose: (id: string) => Promise<void> | void
  readonly extra?: ReactNode | ((close: () => void) => ReactNode)
}

/** Host-supplied choices reveal in 60-row increments, with explicit remote pagination. */
export const PRE_SESSION_CHOICE_PAGE_SIZE = 60

export function visiblePreSessionChoices(items: readonly HbarPreSessionChoice[], query: string, limit: number) {
  const seen = new Set<string>()
  const filtered = items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    const text = `${item.label} ${item.detail ?? ''}`.toLocaleLowerCase()
    return text.includes(query.trim().toLocaleLowerCase())
  })
  return { rows: filtered.slice(0, limit), remaining: Math.max(0, filtered.length - limit) }
}

export function HbarPreSessionChoicePicker({
  icon,
  labels,
  items,
  selectedId,
  disabled = false,
  loading = false,
  hasMore = false,
  onMore,
  onChoose,
  extra,
}: HbarPreSessionChoicePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PRE_SESSION_CHOICE_PAGE_SIZE)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const triggerId = useId()
  const unique = useMemo(() => visiblePreSessionChoices(items, '', items.length).rows, [items])
  const selected = unique.find((item) => item.id === selectedId) ?? null
  const { rows, remaining } = visiblePreSessionChoices(items, query, limit)
  const close = () => {
    if (pendingId !== null) return
    setOpen(false)
    setQuery('')
    setLimit(PRE_SESSION_CHOICE_PAGE_SIZE)
    setError(null)
  }
  return (
    <LumenFrame className="hbar-pre-session-choice-picker">
      <LumenButton
        id={triggerId}
        type="button"
        size="s"
        variant="text"
        indicator="none"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={labels.trigger(selected?.label ?? null)}
        onClick={() => setOpen(true)}
      >
        <LumenIcon icon={icon} tier="sm" />
        <LumenText as="span">{selected?.label ?? labels.title}</LumenText>
        <LumenIcon icon={ChevronDown} tier="sm" />
      </LumenButton>
      {open && (
        <LumenDialog
          open
          title={labels.title}
          closeLabel={labels.close}
          onClose={close}
          className="hbar-pre-session-choice-dialog"
          appearance="panel"
        >
          <LumenFrame className="hbar-pre-session-choice-content">
            <LumenInput
              type="search"
              variant="boxed"
              aria-label={labels.search}
              placeholder={labels.search}
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value)
                setLimit(PRE_SESSION_CHOICE_PAGE_SIZE)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
                event.preventDefault()
                event.stopPropagation()
              }}
            />
            <LumenFrame className="hbar-pre-session-choice-list" aria-label={labels.title}>
              {rows.map((item) => (
                <LumenButton
                  key={item.id}
                  type="button"
                  variant="text"
                  indicator="none"
                  className="hbar-pre-session-choice-row"
                  aria-current={item.id === selectedId ? 'true' : undefined}
                  disabled={pendingId !== null}
                  onClick={() => {
                    setPendingId(item.id)
                    setError(null)
                    void Promise.resolve(onChoose(item.id))
                      .then(() => {
                        setPendingId(null)
                        setOpen(false)
                        setQuery('')
                        setLimit(PRE_SESSION_CHOICE_PAGE_SIZE)
                      })
                      .catch((reason: unknown) => {
                        setPendingId(null)
                        setError(
                          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
                            ? reason.code
                            : 'EXECUTION_FAILED',
                        )
                      })
                  }}
                >
                  <LumenText as="strong">{item.label}</LumenText>
                  {item.detail && <LumenText as="small">{item.detail}</LumenText>}
                </LumenButton>
              ))}
              {rows.length === 0 && (
                <LumenText as="p">{unique.length === 0 ? labels.empty : labels.noMatches}</LumenText>
              )}
              {(remaining > 0 || hasMore) && onMore && (
                <LumenButton
                  type="button"
                  size="s"
                  disabled={loading || pendingId !== null}
                  onClick={() => {
                    if (remaining > 0) setLimit((current) => current + PRE_SESSION_CHOICE_PAGE_SIZE)
                    else onMore()
                  }}
                >
                  {labels.more(hasMore && remaining === 0 ? null : remaining)}
                </LumenButton>
              )}
            </LumenFrame>
            {error && (
              <LumenText as="p" role="alert">
                {labels.error(error)}
              </LumenText>
            )}
            {typeof extra === 'function' ? extra(close) : extra}
          </LumenFrame>
        </LumenDialog>
      )}
    </LumenFrame>
  )
}
