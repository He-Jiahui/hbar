import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { ArrowRight, Check, ChevronDown, Search, X } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenInput, LumenRange, LumenText } from '@lumen/app-ui'
import type { ComposerModelState, SessionControlsState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { filterCatalogModels, modelIdsRequiringDisclosure, MODEL_CATALOG_PAGE_SIZE } from './model-choice-filter'
import './composer-model-picker.css'

type ModelDescriptor = ComposerModelState['models'][number]
type ThinkingLevel = ModelDescriptor['thinkingLevels'][number]
type ModelConfiguration = Pick<
  NonNullable<SessionControlsState['model']>,
  'modelId' | 'model' | 'thinkingLevel' | 'revisions'
>
type ThinkingPreview = { readonly identity: string; readonly index: number }
const NO_MODELS: readonly ModelDescriptor[] = []

/** A local slider draft is valid only for the exact confirmed configuration it began with. */
export function thinkingPreviewIdentity(sessionId: string, model: ModelConfiguration): string {
  return JSON.stringify([
    sessionId,
    model.modelId,
    model.thinkingLevel,
    model.model?.thinkingLevels,
    Object.entries(model.revisions).sort(([a], [b]) => a.localeCompare(b)),
  ])
}

export function visibleThinkingIndex(
  confirmed: number,
  identity: string | null,
  preview: ThinkingPreview | null,
): number {
  return identity && preview?.identity === identity ? preview.index : confirmed
}

/** The visual fill follows the Host-provided stops; it never creates an extra level. */
export function thinkingProgressPercent(levelCount: number, selectedIndex: number): number {
  if (levelCount < 2) return 0
  return (Math.min(levelCount - 1, Math.max(0, selectedIndex)) / (levelCount - 1)) * 100
}

export interface HbarComposerModelLabels {
  readonly title: string
  readonly choose: string
  readonly trigger: (name: string) => string
  readonly search: string
  readonly clearSearch: string
  readonly empty: string
  readonly noMatches: string
  readonly loading: string
  readonly close: string
  readonly retry: string
  readonly reconcile: string
  readonly pending: string
  readonly unknown: string
  readonly providers: string
  readonly configure: string
  readonly unset: string
  readonly unavailable: (modelId: string) => string
  readonly unavailableTrigger: string
  readonly unavailableHint: string
  readonly stale: string
  readonly readFailed: string
  readonly offline: string
  readonly more: (remaining: number) => string
  readonly capability: (model: ModelDescriptor) => string
  readonly thinking: string
  readonly thinkingTrigger: (level: string) => string
  readonly thinkingLevel: (level: ThinkingLevel) => string
  readonly error: (code: string) => string
}

// The catalog is contract-bounded at 4,096. Render an explicit 60-row page,
// with fixed search/header and a pane-owned list; search always covers the catalog.
export const COMPOSER_MODEL_PAGE_SIZE = MODEL_CATALOG_PAGE_SIZE

/** Selection validity comes from the exact configuration, never catalog membership:
 * a hidden but configured model remains valid even if model.list excludes it. */
export function composerModelPresentation(
  sessionId: string,
  connected: boolean,
  controls: SessionControlsState,
  catalog: ComposerModelState,
) {
  const configuration =
    controls.sessionId === sessionId && controls.model?.sessionId === sessionId ? controls.model : null
  const modelError = controls.sessionId === sessionId ? controls.errors.model : null
  const catalogCurrent = catalog.sessionId === sessionId
  const catalogError = catalogCurrent && catalog.status === 'error'
  const state = !connected ? 'offline' : modelError ? 'error' : !configuration ? 'loading' : configuration.status
  const catalogReady = catalogCurrent && catalog.status === 'ready'
  const configured = state === 'configured' && configuration?.model !== null
  const confirmedEmpty =
    catalogReady && catalog.models.length === 0 && !configured && (state === 'unset' || state === 'unavailable')
  return {
    state,
    configuration,
    current: configured ? (configuration?.model ?? null) : null,
    catalogReady,
    catalogError,
    confirmedEmpty,
    recoverProviders: state === 'unavailable' || confirmedEmpty,
    readFailed: state === 'error' || catalogError,
    canChoose: connected && catalogReady && configuration !== null && !modelError,
  }
}

export function filterComposerModels(
  models: readonly ModelDescriptor[],
  query: string,
  limit: number,
  selectedModelId?: string | null,
) {
  return filterCatalogModels(models, query, limit, selectedModelId)
}

/** Only the true overlay container is positioned, relative to its trigger group. */
function placePopover(popover: HTMLElement, anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect()
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  const margin = rem
  const gap = rem / 2
  const width = Math.min(popover.dataset.kind === 'thinking' ? 18.75 * rem : 22.5 * rem, innerWidth - margin * 2)
  const above = rect.top > innerHeight - rect.bottom
  popover.style.setProperty(
    '--composer-popup-left',
    `${Math.max(margin, Math.min(rect.right - width, innerWidth - width - margin))}px`,
  )
  popover.style.setProperty('--composer-popup-top', above ? 'auto' : `${rect.bottom + gap}px`)
  popover.style.setProperty('--composer-popup-bottom', above ? `${innerHeight - rect.top + gap}px` : 'auto')
  popover.style.setProperty(
    '--composer-popup-limit',
    `${Math.max(0, (above ? rect.top : innerHeight - rect.bottom) - margin - gap)}px`,
  )
}

function PickerPopover({
  id,
  title,
  close,
  kind,
  presentation,
  anchor,
  children,
  onOpen,
  onClose,
  popupRef,
}: {
  readonly id: string
  readonly title: string
  readonly close: string
  readonly kind: 'model' | 'thinking'
  readonly presentation?: 'native' | 'web'
  readonly anchor: RefObject<HTMLDivElement | null>
  readonly popupRef: RefObject<HTMLDivElement | null>
  readonly children: ReactNode
  readonly onOpen: () => void
  readonly onClose: () => void
}) {
  return (
    <LumenFrame
      id={id}
      ref={popupRef}
      popover="auto"
      role="dialog"
      aria-label={title}
      className="hbar-composer-picker-popover"
      data-kind={kind}
      data-presentation={presentation}
      onBeforeToggle={(event) => {
        if (event.newState === 'open' && anchor.current) placePopover(event.currentTarget, anchor.current)
      }}
      onToggle={(event) => {
        if (event.newState === 'open') onOpen()
        else onClose()
      }}
      onKeyDown={(event) => {
        // A popover nested in the prompt form must never submit the prompt.
        if (event.key === 'Enter') {
          event.stopPropagation()
          if (event.target instanceof HTMLInputElement) event.preventDefault()
        }
      }}
    >
      {kind === 'model' && (
        <LumenFrame className="hbar-composer-picker-heading">
          <LumenText as="span">{title}</LumenText>
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            aria-label={close}
            onClick={() => popupRef.current?.hidePopover()}
          >
            <LumenIcon icon={X} tier="sm" />
          </LumenButton>
        </LumenFrame>
      )}
      {children}
    </LumenFrame>
  )
}

export function HbarComposerModelPicker({
  sessionId,
  connected,
  disabled,
  runActive = false,
  canSelect = true,
  labels,
  openRequest = 0,
  onOpened,
  onOpenFailed,
  menuPresentation = 'web',
}: {
  readonly sessionId: string
  readonly connected: boolean
  readonly disabled: boolean
  readonly runActive?: boolean
  readonly canSelect?: boolean
  readonly labels: HbarComposerModelLabels
  readonly openRequest?: number
  readonly onOpened?: () => void
  readonly onOpenFailed?: (code: string) => void
  /** Native desktop keeps a trigger-anchored menu even when zoom narrows CSS viewport width. */
  readonly menuPresentation?: 'native' | 'web' | undefined
}) {
  const runtime = useHbarRuntime()
  const catalog = useHbarRuntimeState(runtime.state.composerModel)
  const controls = useHbarRuntimeState(runtime.state.controls)
  const presentation = composerModelPresentation(sessionId, connected, controls, catalog)
  const model = presentation.configuration
  const current = presentation.current
  const action = catalog.sessionId === sessionId ? catalog.action : null
  const busy = action?.status === 'submitting'
  const unresolved = action?.status === 'unknown'
  const unavailable = disabled || !connected || busy || unresolved
  const writeUnavailable = unavailable || !canSelect || !presentation.canChoose
  const thinkingUnavailable = unavailable || !canSelect || !current
  const directConfigure = presentation.confirmedEmpty && !busy && !unresolved
  const groupRef = useRef<HTMLDivElement>(null)
  const modelTriggerRef = useRef<HTMLButtonElement>(null)
  const modelRef = useRef<HTMLDivElement>(null)
  const modelListRef = useRef<HTMLDivElement>(null)
  const thinkingRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)
  const thinkingWriteRef = useRef(false)
  const modelId = useId()
  const thinkingId = useId()
  const [open, setOpen] = useState<'model' | 'thinking' | null>(null)
  useEffect(() => {
    if (!runActive) return
    modelRef.current?.hidePopover()
    thinkingRef.current?.hidePopover()
  }, [runActive])
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(COMPOSER_MODEL_PAGE_SIZE)
  const [sliderDraft, setSliderDraft] = useState<ThinkingPreview | null>(null)
  const sliderDraftRef = useRef<ThinkingPreview | null>(null)
  const pointerIdentityRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const retryingRef = useRef(false)
  const retryButtonRef = useRef<HTMLButtonElement>(null)
  const retryFrameRef = useRef<number | null>(null)
  const entryIntent = useRef(0)
  useEffect(() => {
    if (!connected || busy || unresolved) entryIntent.current += 1
  }, [connected, busy, unresolved])
  useEffect(
    () => () => {
      entryIntent.current += 1
      if (retryFrameRef.current !== null) cancelAnimationFrame(retryFrameRef.current)
    },
    [],
  )
  const openProviders = useCallback(
    (notifyOpened = true) => {
      const navigation = runtime.state.navigation.getSnapshot()
      if (
        !connected ||
        runtime.state.presentation.getSnapshot().page.kind !== 'session' ||
        navigation.sessionId !== sessionId
      ) {
        onOpenFailed?.('STALE_TARGET')
        return
      }
      setLocalError(null)
      void runtime.commands
        .execute('app.openSettings', { scope: 'global', section: 'providers' })
        .then(() => {
          if (notifyOpened) onOpened?.()
        })
        .catch((reason: unknown) => {
          const code =
            reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
              ? reason.code
              : 'EXECUTION_FAILED'
          setLocalError(code)
          onOpenFailed?.(code)
        })
    },
    [connected, runtime, sessionId, onOpened, onOpenFailed],
  )
  const lastOpenRequest = useRef(openRequest)
  useEffect(() => {
    if (lastOpenRequest.current === openRequest) return
    lastOpenRequest.current = openRequest
    if (unavailable || !modelRef.current) {
      onOpenFailed?.('CAPABILITY_UNAVAILABLE')
      return
    }
    if (directConfigure) {
      openProviders()
      return
    }
    try {
      if (modelRef.current.matches(':popover-open')) onOpened?.()
      else modelRef.current.showPopover()
    } catch {
      onOpenFailed?.('CAPABILITY_UNAVAILABLE')
    }
  }, [openRequest, unavailable, directConfigure, openProviders, onOpened, onOpenFailed])
  useEffect(() => {
    if (!open) return
    const reposition = () => {
      const popup = open === 'model' ? modelRef.current : thinkingRef.current
      if (popup && groupRef.current) placePopover(popup, groupRef.current)
    }
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])
  const models = catalog.sessionId === sessionId ? catalog.models : NO_MODELS
  const disclosedModelIds = useMemo(() => modelIdsRequiringDisclosure(models, query), [models, query])
  const { groups, remaining } = filterComposerModels(models, query, limit, model?.modelId)
  const levels = current?.thinkingLevels ?? []
  const thinkingIdentity = model ? thinkingPreviewIdentity(sessionId, model) : null
  const levelIndex = Math.max(0, levels.indexOf(model?.thinkingLevel ?? current?.defaultThinkingLevel ?? 'off'))
  const selectedIndex = visibleThinkingIndex(levelIndex, thinkingIdentity, sliderDraft)
  const selectedLevel = levels[selectedIndex]
  const resetThinkingPreview = () => {
    sliderDraftRef.current = null
    pointerIdentityRef.current = null
    setSliderDraft(null)
  }
  useEffect(() => {
    if (sliderDraftRef.current && sliderDraftRef.current.identity !== thinkingIdentity) {
      sliderDraftRef.current = null
      pointerIdentityRef.current = null
      setSliderDraft(null)
    }
  }, [thinkingIdentity])
  const error = localError ?? action?.error
  const capture = (reason: unknown) => {
    const code =
      reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
        ? reason.code
        : 'EXECUTION_FAILED'
    setLocalError(code)
  }
  const refresh = (configureAfterRead = false) => {
    if (!configureAfterRead && retryingRef.current) return
    const intent = ++entryIntent.current
    const navigation = runtime.state.navigation.getSnapshot()
    const originalFocus = document.activeElement
    if (!configureAfterRead) {
      retryingRef.current = true
      setRetrying(true)
    }
    setLocalError(null)
    void runtime.commands
      .execute('composerModel.refresh', { sessionId, retainReady: configureAfterRead && presentation.catalogReady })
      .then(() => {
        if (
          !configureAfterRead ||
          entryIntent.current !== intent ||
          runtime.state.navigation.getSnapshot() !== navigation ||
          !modelRef.current?.matches(':popover-open')
        )
          return
        const latest = runtime.state.composerModel.getSnapshot()
        const configuration = composerModelPresentation(
          sessionId,
          connected,
          runtime.state.controls.getSnapshot(),
          latest,
        )
        if (
          configuration.confirmedEmpty &&
          latest.action.status !== 'submitting' &&
          latest.action.status !== 'unknown'
        ) {
          entryIntent.current += 1
          openProviders(false)
        }
      })
      .catch((reason: unknown) => {
        if (entryIntent.current !== intent || runtime.state.navigation.getSnapshot() !== navigation) return
        const canonical = composerModelPresentation(
          sessionId,
          connected,
          runtime.state.controls.getSnapshot(),
          runtime.state.composerModel.getSnapshot(),
        )
        // A read failure already has one canonical explanation and Retry. Local
        // precondition/dispatch errors without that projection still need feedback.
        if (!canonical.readFailed) capture(reason)
      })
      .finally(() => {
        if (configureAfterRead) return
        retryingRef.current = false
        if (!groupRef.current) return
        setRetrying(false)
        retryFrameRef.current = requestAnimationFrame(() => {
          retryFrameRef.current = null
          if (
            entryIntent.current !== intent ||
            runtime.state.navigation.getSnapshot() !== navigation ||
            !modelRef.current?.matches(':popover-open')
          )
            return
          if (originalFocus !== retryButtonRef.current && originalFocus?.isConnected) return
          if (document.activeElement !== document.body && document.activeElement !== originalFocus) return
          if (retryButtonRef.current && !retryButtonRef.current.disabled) retryButtonRef.current.focus()
          else searchRef.current?.focus()
        })
      })
  }
  const selectModel = (id: string) => {
    if (writeUnavailable) return
    const navigation = runtime.state.navigation.getSnapshot()
    const source = document.activeElement
    setLocalError(null)
    void runtime.commands
      .execute('composerModel.selectModel', { sessionId, modelId: id })
      .then(() => {
        if (runtime.state.navigation.getSnapshot() !== navigation || !modelRef.current?.matches(':popover-open')) return
        const active = document.activeElement
        if (active !== source && active !== document.body) return
        modelRef.current?.hidePopover()
        modelTriggerRef.current?.focus()
      })
      .catch(capture)
  }
  const previewThinking = (input: HTMLInputElement) => {
    if (!thinkingIdentity || thinkingUnavailable || thinkingWriteRef.current) return
    const index = Number(input.value)
    if (!Number.isInteger(index) || !levels[index]) return
    const preview = {
      identity: pointerIdentityRef.current ?? sliderDraftRef.current?.identity ?? thinkingIdentity,
      index,
    }
    sliderDraftRef.current = preview
    setSliderDraft(preview)
  }
  const selectThinking = (input: HTMLInputElement) => {
    if (
      cancelledRef.current ||
      thinkingUnavailable ||
      thinkingWriteRef.current ||
      !thinkingIdentity ||
      (!sliderDraftRef.current && !pointerIdentityRef.current)
    )
      return
    const origin = pointerIdentityRef.current ?? sliderDraftRef.current?.identity ?? thinkingIdentity
    const index = Number(input.value)
    const nextLevel = Number.isInteger(index) ? levels[index] : undefined
    const latest = runtime.state.controls.getSnapshot()
    const latestIdentity =
      latest.sessionId === sessionId && latest.model ? thinkingPreviewIdentity(sessionId, latest.model) : null
    pointerIdentityRef.current = null
    if (origin !== thinkingIdentity || latestIdentity !== thinkingIdentity) {
      resetThinkingPreview()
      setLocalError('VERSION_CONFLICT')
      return
    }
    if (!nextLevel || nextLevel === (model?.thinkingLevel ?? current?.defaultThinkingLevel ?? 'off')) {
      resetThinkingPreview()
      return
    }
    thinkingWriteRef.current = true
    setLocalError(null)
    void runtime.commands
      .execute('composerModel.selectThinking', { sessionId, thinkingLevel: nextLevel })
      .then(resetThinkingPreview)
      .catch((reason: unknown) => {
        resetThinkingPreview()
        capture(reason)
      })
      .finally(() => {
        thinkingWriteRef.current = false
      })
  }
  const moveOption = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    if (event.target === searchRef.current && event.key !== 'ArrowDown') return
    const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)')]
    if (!options.length) return
    event.preventDefault()
    const index = options.findIndex((option) => option === document.activeElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : event.key === 'ArrowUp'
            ? (index - 1 + options.length) % options.length
            : (index + 1) % options.length
    options[next]?.focus()
  }
  const feedback = (
    <LumenFrame className="hbar-composer-picker-feedback">
      {busy && (
        <LumenText as="span" role="status">
          {labels.pending}
        </LumenText>
      )}
      {unresolved && (
        <LumenText as="span" role="alert">
          {labels.unknown}
        </LumenText>
      )}
      {error && !unresolved && (
        <LumenText as="span" role="alert">
          {labels.error(error)}
        </LumenText>
      )}
      {unresolved && (
        <LumenButton
          type="button"
          size="s"
          disabled={!connected || busy}
          onClick={() => {
            setLocalError(null)
            void runtime.commands.execute('composerModel.reconcile', { sessionId }).catch(capture)
          }}
        >
          {labels.reconcile}
        </LumenButton>
      )}
    </LumenFrame>
  )
  const triggerName = directConfigure
    ? labels.configure
    : presentation.state === 'unavailable'
      ? labels.unavailableTrigger
      : presentation.state === 'loading'
        ? labels.loading
        : presentation.state === 'error'
          ? labels.choose
          : current
            ? disclosedModelIds.has(current.id)
              ? current.modelId
              : current.modelName
            : labels.choose
  const explanation =
    presentation.state === 'offline'
      ? labels.offline
      : presentation.readFailed
        ? labels.readFailed
        : presentation.state === 'loading'
          ? labels.stale
          : presentation.state === 'unavailable' && model?.modelId
            ? labels.unavailable(model.modelId)
            : presentation.state === 'unset'
              ? labels.unset
              : null
  const closedExplanation = presentation.state === 'unavailable' ? labels.unavailableHint : explanation
  return (
    <LumenFrame ref={groupRef} className="hbar-composer-model-picker" data-model-state={presentation.state}>
      <LumenButton
        ref={modelTriggerRef}
        type="button"
        size="s"
        variant="text"
        indicator="none"
        className="hbar-composer-model-trigger"
        aria-label={directConfigure ? labels.configure : labels.trigger(triggerName)}
        title={explanation ?? triggerName}
        aria-haspopup={directConfigure ? undefined : 'dialog'}
        aria-expanded={directConfigure ? undefined : open === 'model'}
        aria-controls={directConfigure ? undefined : modelId}
        disabled={!connected || (disabled && !unresolved)}
        popoverTarget={directConfigure ? undefined : modelId}
        onClick={directConfigure ? () => openProviders() : undefined}
      >
        <LumenText as="span" title={triggerName}>
          {triggerName}
        </LumenText>
        <LumenIcon icon={directConfigure ? ArrowRight : ChevronDown} tier="sm" />
      </LumenButton>
      {levels.length > 1 && (
        <LumenButton
          type="button"
          size="s"
          variant="text"
          indicator="none"
          className="hbar-composer-thinking-trigger"
          aria-label={labels.thinkingTrigger(
            labels.thinkingLevel(model?.thinkingLevel ?? current?.defaultThinkingLevel ?? 'off'),
          )}
          aria-haspopup="dialog"
          aria-expanded={open === 'thinking'}
          aria-controls={thinkingId}
          disabled={thinkingUnavailable}
          popoverTarget={thinkingId}
        >
          {labels.thinkingLevel(model?.thinkingLevel ?? current?.defaultThinkingLevel ?? 'off')}
        </LumenButton>
      )}
      {!open && closedExplanation && (
        <LumenText
          as="p"
          className="hbar-composer-model-closed-recovery"
          role={presentation.readFailed || presentation.state === 'unavailable' ? 'alert' : 'status'}
        >
          {closedExplanation}
        </LumenText>
      )}
      <PickerPopover
        id={modelId}
        title={labels.title}
        close={labels.close}
        kind="model"
        presentation={menuPresentation}
        anchor={groupRef}
        popupRef={modelRef}
        onOpen={() => {
          setOpen('model')
          // The same popup can be opened from the model trigger or a local /model
          // command while the editor still owns focus. On a narrow touch device,
          // leave the list unobscured until the user deliberately chooses search.
          if (!window.matchMedia('(max-width: 40rem) and (pointer: coarse)').matches) searchRef.current?.focus()
          modelListRef.current?.scrollTo({ top: 0 })
          if (!unresolved && !busy) refresh(true)
          onOpened?.()
        }}
        onClose={() => {
          entryIntent.current += 1
          setOpen((value) => (value === 'model' ? null : value))
          setQuery('')
          setLimit(COMPOSER_MODEL_PAGE_SIZE)
        }}
      >
        <LumenFrame onKeyDown={moveOption} className="hbar-composer-picker-body">
          <LumenFrame className="hbar-composer-model-search">
            <LumenIcon icon={Search} tier="sm" aria-hidden="true" />
            <LumenInput
              ref={searchRef}
              type="search"
              variant="plain"
              value={query}
              aria-label={labels.search}
              placeholder={labels.search}
              onChange={(event) => {
                entryIntent.current += 1
                setQuery(event.currentTarget.value)
                setLimit(COMPOSER_MODEL_PAGE_SIZE)
              }}
            />
            {query && (
              <LumenButton
                type="button"
                size="s"
                variant="text"
                indicator="none"
                aria-label={labels.clearSearch}
                onClick={() => {
                  setQuery('')
                  setLimit(COMPOSER_MODEL_PAGE_SIZE)
                  searchRef.current?.focus()
                }}
              >
                <LumenIcon icon={X} tier="sm" />
              </LumenButton>
            )}
          </LumenFrame>
          {feedback}
          {explanation && (
            <LumenText
              as="p"
              className="hbar-composer-model-recovery"
              role={presentation.readFailed || presentation.state === 'unavailable' ? 'alert' : 'status'}
            >
              {explanation}
            </LumenText>
          )}
          {catalog.status === 'loading' && (
            <LumenText as="span" role="status">
              {labels.loading}
            </LumenText>
          )}
          {(presentation.readFailed || retrying) && (
            <LumenButton
              ref={retryButtonRef}
              type="button"
              size="s"
              loading={retrying}
              disabled={!connected || busy || unresolved || retrying || catalog.status === 'loading'}
              onClick={() => refresh()}
            >
              {labels.retry}
            </LumenButton>
          )}
          <LumenFrame
            ref={modelListRef}
            className="hbar-composer-model-list"
            role="listbox"
            aria-label={labels.title}
            aria-busy={busy || catalog.status === 'loading'}
          >
            {groups.map(([providerId, group]) => (
              <LumenFrame key={providerId} role="group" aria-label={group.name} className="hbar-composer-model-group">
                <LumenText as="span" className="hbar-composer-provider-name">
                  {group.name}
                </LumenText>
                {group.models.map((option) => (
                  <LumenButton
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={option.id === model?.modelId}
                    disabled={writeUnavailable}
                    className="hbar-composer-model-option"
                    variant="text"
                    indicator="none"
                    onClick={() => selectModel(option.id)}
                  >
                    <LumenFrame className="hbar-composer-model-description">
                      <LumenFrame className="hbar-composer-model-name-row">
                        <LumenText as="span" className="hbar-composer-model-name">
                          {option.modelName}
                        </LumenText>
                        {disclosedModelIds.has(option.id) && option.modelId !== option.modelName && (
                          <LumenText as="small" className="hbar-composer-model-identifier">
                            {option.modelId}
                          </LumenText>
                        )}
                      </LumenFrame>
                      {option.description && (
                        <LumenText as="span" className="hbar-composer-model-purpose">
                          {option.description}
                        </LumenText>
                      )}
                      <LumenText as="span" className="hbar-composer-model-capability">
                        {labels.capability(option)}
                      </LumenText>
                    </LumenFrame>
                    {option.id === model?.modelId && <LumenIcon icon={Check} tier="sm" />}
                  </LumenButton>
                ))}
              </LumenFrame>
            ))}
            {!groups.length && catalog.status === 'ready' && (
              <LumenText as="p">{models.length ? labels.noMatches : labels.empty}</LumenText>
            )}
            {remaining > 0 && (
              <LumenButton type="button" size="s" onClick={() => setLimit((value) => value + COMPOSER_MODEL_PAGE_SIZE)}>
                {labels.more(remaining)}
              </LumenButton>
            )}
          </LumenFrame>
          {presentation.recoverProviders && (
            <LumenButton type="button" size="s" disabled={!connected || busy} onClick={() => openProviders()}>
              {labels.providers}
            </LumenButton>
          )}
        </LumenFrame>
      </PickerPopover>
      <PickerPopover
        id={thinkingId}
        title={labels.thinking}
        close={labels.close}
        kind="thinking"
        anchor={groupRef}
        popupRef={thinkingRef}
        onOpen={() => {
          setOpen('thinking')
          cancelledRef.current = false
          sliderRef.current?.focus()
        }}
        onClose={() => {
          setOpen((value) => (value === 'thinking' ? null : value))
          resetThinkingPreview()
        }}
      >
        <LumenFrame className="hbar-composer-thinking-heading">
          <LumenText as="strong" className="hbar-composer-thinking-value">
            {selectedLevel ? labels.thinkingLevel(selectedLevel) : null}
          </LumenText>
          <LumenText as="span" className="hbar-composer-thinking-context">
            {labels.thinking}
          </LumenText>
        </LumenFrame>
        <LumenFrame
          className="hbar-composer-thinking-scale"
          style={
            { '--hbar-thinking-progress': `${thinkingProgressPercent(levels.length, selectedIndex)}%` } as CSSProperties
          }
        >
          <LumenRange
            ref={sliderRef}
            className="hbar-composer-thinking-slider"
            min={0}
            max={Math.max(0, levels.length - 1)}
            step={1}
            value={selectedIndex}
            disabled={thinkingUnavailable || levels.length < 2}
            aria-label={labels.thinking}
            aria-valuetext={selectedLevel ? labels.thinkingLevel(selectedLevel) : undefined}
            onChange={(event) => previewThinking(event.currentTarget)}
            onPointerDown={() => {
              pointerIdentityRef.current = thinkingIdentity
              cancelledRef.current = false
            }}
            onPointerUp={(event) => selectThinking(event.currentTarget)}
            onPointerCancel={() => {
              cancelledRef.current = true
              resetThinkingPreview()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                cancelledRef.current = true
                resetThinkingPreview()
                thinkingRef.current?.hidePopover()
                return
              }
              if (
                ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(
                  event.key,
                )
              ) {
                // A new keyboard gesture is independent of an earlier cancelled pointer gesture.
                cancelledRef.current = false
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                event.stopPropagation()
                selectThinking(event.currentTarget)
              }
            }}
            onBlur={(event) => selectThinking(event.currentTarget)}
          />
          <LumenFrame className="hbar-composer-thinking-rail" aria-hidden="true">
            {levels.map((level, index) => (
              <LumenFrame key={level} className="hbar-composer-thinking-stop" data-reached={index <= selectedIndex} />
            ))}
          </LumenFrame>
        </LumenFrame>
        {feedback}
      </PickerPopover>
    </LumenFrame>
  )
}
