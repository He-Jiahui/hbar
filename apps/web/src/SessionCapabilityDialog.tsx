import { useEffect, useState } from 'react'
import {
  Check,
  ClipboardList,
  Gauge,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Save,
  Target,
  Trash2,
  X,
} from 'lucide-react'
import type { PlanStep, PlanStepStatus, ThreadGoal } from '@hbar/contracts'
import { Modal } from './Settings'
import { client, report } from './stores'
import {
  clearBudget,
  clearGoal,
  clearPlan,
  createGoal,
  setBudget,
  setGoal,
  setMode,
  updatePlan,
  useSessionCapabilities,
  type SessionCapabilityTab,
} from './session-capabilities'
import './SessionCapabilityDialog.css'
import AnimatedList from './react-bits/AnimatedList'
import GlassSurface from './react-bits/GlassSurface'
import GlareButton from './react-bits/GlareButton'
import SpotlightCard from './react-bits/SpotlightCard'
import { useLocale } from './locale'

const TAB_LABELS: Record<SessionCapabilityTab, string> = {
  goal: 'Goal',
  plan: 'Plan',
  budget: 'Budget',
}

function statusLabel(status: ThreadGoal['status'], t: ReturnType<typeof useLocale>['t']) {
  return {
    active: t('chatStatusActive'),
    paused: t('chatStatusPaused'),
    blocked: t('chatStatusBlocked'),
    usage_limited: t('chatStatusUsageLimited'),
    budget_limited: t('chatStatusBudgetLimited'),
    complete: t('chatStatusComplete'),
  }[status]
}

function planStatusLabel(status: PlanStepStatus, t: ReturnType<typeof useLocale>['t']) {
  return {
    pending: t('capabilityPending'),
    in_progress: t('chatStatusActive'),
    completed: t('chatStatusComplete'),
  }[status]
}

function parsePositiveInteger(value: string) {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function CapabilityFeedback({ loading, saving, error }: { loading: boolean; saving: boolean; error: string }) {
  const { t } = useLocale()
  if (error)
    return (
      <p className="inline-error session-capability-feedback" role="alert">
        {error}
      </p>
    )
  if (loading)
    return (
      <p className="small-muted session-capability-feedback" role="status">
        <LoaderCircle size={13} className="spinning" /> {t('capabilityLoading')}
      </p>
    )
  if (saving)
    return (
      <p className="small-muted session-capability-feedback" role="status">
        <LoaderCircle size={13} className="spinning" /> {t('capabilitySaving')}
      </p>
    )
  return null
}

function GoalPane({ sessionId }: { sessionId: string }) {
  const { t } = useLocale()
  const state = useSessionCapabilities((value) => value.sessions[sessionId])
  const goal = state?.goal ?? null
  const [objective, setObjective] = useState('')
  const [tokenBudget, setTokenBudget] = useState('')
  const [validation, setValidation] = useState('')

  useEffect(() => {
    setObjective(goal?.objective ?? '')
    setTokenBudget(goal?.tokenBudget === null || goal?.tokenBudget === undefined ? '' : String(goal.tokenBudget))
    setValidation('')
  }, [goal?.goalId, goal?.updatedAt, goal?.objective, goal?.tokenBudget])

  async function save() {
    const trimmed = objective.trim()
    if (!trimmed) {
      setValidation(t('capabilityTargetRequired'))
      return
    }
    const parsedBudget = parsePositiveInteger(tokenBudget)
    if (parsedBudget === null) {
      setValidation(t('capabilityPositiveBudget'))
      return
    }
    setValidation('')
    try {
      const transport = client()
      if (goal) {
        await setGoal(transport, sessionId, {
          objective: trimmed,
          tokenBudget: parsedBudget ?? null,
          ...(goal.goalId ? { expectedGoalId: goal.goalId } : {}),
        })
      } else {
        await createGoal(transport, sessionId, trimmed, parsedBudget)
      }
    } catch (error) {
      report(error)
    }
  }

  async function togglePaused() {
    if (!goal || !goal.goalId || !['active', 'paused'].includes(goal.status)) return
    try {
      await setGoal(client(), sessionId, {
        status: goal.status === 'paused' ? 'active' : 'paused',
        expectedGoalId: goal.goalId,
      })
    } catch (error) {
      report(error)
    }
  }

  async function clear() {
    if (!goal || !window.confirm(t('capabilityClearGoalConfirm'))) return
    try {
      await clearGoal(client(), sessionId)
    } catch (error) {
      report(error)
    }
  }

  return (
    <section className="session-capability-pane" aria-label={`${TAB_LABELS.goal} ${t('capabilitySettings')}`}>
      <CapabilityFeedback loading={state?.loading ?? false} saving={state?.saving ?? false} error={state?.error ?? ''} />
      {goal && (
        <div className="session-capability-summary rb-capability-surface">
          <GlassSurface className="capability-surface-glass" width="100%" height="100%" aria-hidden="true" />
          <div>
            <span className="small-muted">{t('capabilityStatus')}</span>
            <strong>{statusLabel(goal.status, t)}</strong>
          </div>
          <div>
            <span className="small-muted">{t('capabilityUsedTokens')}</span>
            <strong>{goal.tokensUsed.toLocaleString()}</strong>
          </div>
          <div>
            <span className="small-muted">{t('capabilityRemainingTokens')}</span>
            <strong>
              {goal.tokenBudget === null ? t('capabilityUnlimited') : Math.max(0, goal.tokenBudget - goal.tokensUsed).toLocaleString()}
            </strong>
          </div>
        </div>
      )}
      <label>
        {t('capabilityTarget')}
        <textarea
          rows={4}
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
          placeholder={t('capabilityTargetPlaceholder')}
          disabled={state?.saving ?? false}
        />
      </label>
      <label>
        {t('capabilityTokenBudgetOptional')}
        <input
          type="number"
          min={1}
          step={1}
          value={tokenBudget}
          onChange={(event) => setTokenBudget(event.target.value)}
          placeholder={t('capabilityUnlimited')}
          disabled={state?.saving ?? false}
        />
      </label>
      {validation && <p className="inline-error">{validation}</p>}
      <footer className="modal-footer">
        {goal && ['active', 'paused'].includes(goal.status) && (
          <button type="button" className="button" onClick={() => void togglePaused()} disabled={state?.saving ?? false}>
            {goal.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
            {goal.status === 'paused' ? t('capabilityResume') : t('capabilityPause')}
          </button>
        )}
        {goal && (
          <button type="button" className="button danger-button" onClick={() => void clear()} disabled={state?.saving ?? false}>
            <Trash2 size={14} />
            {t('capabilityClear')}
          </button>
        )}
        <GlareButton type="button" className="button primary" onClick={() => void save()} disabled={state?.saving ?? false}>
          {state?.saving ? <LoaderCircle size={14} className="spinning" /> : <Save size={14} />}
          {goal ? t('capabilitySaveGoal') : t('capabilityCreateGoal')}
        </GlareButton>
      </footer>
    </section>
  )
}

function PlanPane({ sessionId }: { sessionId: string }) {
  const { t } = useLocale()
  const state = useSessionCapabilities((value) => value.sessions[sessionId])
  const plan = state?.plan ?? null
  const mode = state?.mode ?? 'default'
  const [steps, setSteps] = useState<PlanStep[]>([])
  const [explanation, setExplanation] = useState('')
  const [validation, setValidation] = useState('')

  useEffect(() => {
    setSteps(plan?.plan.map((step) => ({ ...step })) ?? [])
    setExplanation(plan?.explanation ?? '')
    setValidation('')
  }, [plan?.updatedAt, plan?.explanation, plan?.plan])

  async function changeMode(next: 'default' | 'plan') {
    if (next === mode) return
    try {
      await setMode(client(), sessionId, next)
    } catch (error) {
      report(error)
    }
  }

  async function savePlan() {
    const normalized = steps.map((step) => ({ step: step.step.trim(), status: step.status })).filter((step) => step.step)
    if (!normalized.length) {
      setValidation(t('capabilityPlanRequired'))
      return
    }
    setValidation('')
    try {
      await updatePlan(client(), sessionId, normalized, explanation.trim() || null)
    } catch (error) {
      report(error)
    }
  }

  async function clear() {
    if (!plan || !window.confirm(t('capabilityClearPlanConfirm'))) return
    try {
      await clearPlan(client(), sessionId)
    } catch (error) {
      report(error)
    }
  }

  return (
    <section className="session-capability-pane" aria-label={`${TAB_LABELS.plan} ${t('capabilitySettings')}`}>
      <CapabilityFeedback loading={state?.loading ?? false} saving={state?.saving ?? false} error={state?.error ?? ''} />
      <div className="session-capability-mode segmented" aria-label={t('capabilityRunMode')}>
        <button type="button" className={mode === 'default' ? 'selected' : ''} onClick={() => void changeMode('default')}>
          {t('capabilityDefaultMode')}
        </button>
        <button type="button" className={mode === 'plan' ? 'selected' : ''} onClick={() => void changeMode('plan')}>
          {t('capabilityPlanMode')}
        </button>
      </div>
      {plan?.explanation && <p className="session-capability-note">{plan.explanation}</p>}
      <AnimatedList
        className="session-plan-list"
        viewportClassName="session-plan-viewport"
        showGradients={false}
        aria-label={t('capabilityPlanSteps')}
      >
        {steps.map((step, index) => (
          <SpotlightCard
            className="session-plan-row"
            key={`${index}-${step.step}`}
            spotlightColor="color-mix(in srgb, var(--rb-accent) 20%, transparent)"
          >
            <input
              aria-label={`${t('capabilityStep')} ${index + 1}`}
              value={step.step}
              onChange={(event) =>
                setSteps((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, step: event.target.value } : item)))
              }
              disabled={state?.saving ?? false}
            />
            <select
              aria-label={`${t('capabilityStepStatus')} ${index + 1}`}
              value={step.status}
              onChange={(event) =>
                setSteps((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, status: event.target.value as PlanStepStatus } : item,
                  ),
                )
              }
              disabled={state?.saving ?? false}
            >
              {(Object.keys({ pending: true, in_progress: true, completed: true }) as PlanStepStatus[]).map((value) => (
                <option value={value} key={value}>
                  {planStatusLabel(value, t)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-button"
              title={t('capabilityDeleteStep')}
              aria-label={`${t('capabilityDeleteStep')} ${index + 1}`}
              onClick={() => setSteps((current) => current.filter((_item, itemIndex) => itemIndex !== index))}
              disabled={state?.saving ?? false}
            >
              <X size={14} />
            </button>
          </SpotlightCard>
        ))}
        {!steps.length && <p className="empty-list">{t('capabilityNoPlan')}</p>}
      </AnimatedList>
      <button
        type="button"
        className="text-command session-plan-add"
        onClick={() => setSteps((current) => [...current, { step: '', status: 'pending' }])}
        disabled={state?.saving ?? false}
      >
        <Plus size={14} />
        {t('capabilityAddStep')}
      </button>
      <label>
        {t('capabilityNote')}
        <textarea
          rows={2}
          value={explanation}
          onChange={(event) => setExplanation(event.target.value)}
          placeholder={t('capabilityOptional')}
          disabled={state?.saving ?? false}
        />
      </label>
      {validation && <p className="inline-error">{validation}</p>}
      <footer className="modal-footer">
        {plan && (
          <button type="button" className="button danger-button" onClick={() => void clear()} disabled={state?.saving ?? false}>
            <Trash2 size={14} />
            {t('capabilityClearPlan')}
          </button>
        )}
        <GlareButton type="button" className="button primary" onClick={() => void savePlan()} disabled={state?.saving ?? false}>
          {state?.saving ? <LoaderCircle size={14} className="spinning" /> : <Check size={14} />}
          {t('capabilitySavePlan')}
        </GlareButton>
      </footer>
    </section>
  )
}

function BudgetPane({ sessionId }: { sessionId: string }) {
  const { t } = useLocale()
  const state = useSessionCapabilities((value) => value.sessions[sessionId])
  const budget = state?.budget ?? null
  const [limit, setLimit] = useState('')
  const [validation, setValidation] = useState('')

  useEffect(() => {
    setLimit(budget ? String(budget.limit) : '')
    setValidation('')
  }, [budget])

  const percentage = budget ? Math.min(100, Math.round((budget.usedTokens / budget.limit) * 100)) : 0

  async function save() {
    const parsed = parsePositiveInteger(limit)
    if (parsed === null || parsed === undefined) {
      setValidation(t('capabilityPositiveBudget'))
      return
    }
    setValidation('')
    try {
      await setBudget(client(), sessionId, parsed)
    } catch (error) {
      report(error)
    }
  }

  async function clear() {
    if (!budget || !window.confirm(t('capabilityClearBudgetConfirm'))) return
    try {
      await clearBudget(client(), sessionId)
    } catch (error) {
      report(error)
    }
  }

  return (
    <section className="session-capability-pane" aria-label={`${TAB_LABELS.budget} ${t('capabilitySettings')}`}>
      <CapabilityFeedback loading={state?.loading ?? false} saving={state?.saving ?? false} error={state?.error ?? ''} />
      {budget ? (
        <div className={`budget-meter rb-capability-surface budget-meter-${budget.phase}`} aria-label={t('capabilityBudgetUsage')}>
          <GlassSurface className="capability-surface-glass" width="100%" height="100%" aria-hidden="true" />
          <div className="budget-meter-heading">
            <strong>{budget.phase === 'exhausted' ? t('capabilityBudgetExhausted') : t('capabilityBudgetUsage')}</strong>
            <span>{percentage}%</span>
          </div>
          <div className="budget-meter-track" role="progressbar" aria-valuemin={0} aria-valuemax={budget.limit} aria-valuenow={budget.usedTokens}>
            <span style={{ width: `${percentage}%` }} />
          </div>
          <div className="budget-meter-values">
            <span>{budget.usedTokens.toLocaleString()} {t('capabilityUsed')}</span>
            <span>{budget.remainingTokens.toLocaleString()} {t('capabilityRemaining')}</span>
          </div>
        </div>
      ) : (
        <p className="empty-list">{t('capabilityNoBudget')}</p>
      )}
      <label>
        {t('capabilityTokenLimit')}
        <input
          type="number"
          min={1}
          step={1}
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          placeholder={t('capabilityLimitPlaceholder')}
          disabled={state?.saving ?? false}
        />
      </label>
      {validation && <p className="inline-error">{validation}</p>}
      <footer className="modal-footer">
        {budget && (
          <button type="button" className="button danger-button" onClick={() => void clear()} disabled={state?.saving ?? false}>
            <Trash2 size={14} />
            {t('capabilityClearBudget')}
          </button>
        )}
        <GlareButton type="button" className="button primary" onClick={() => void save()} disabled={state?.saving ?? false}>
          {state?.saving ? <LoaderCircle size={14} className="spinning" /> : <Gauge size={14} />}
          {budget ? t('capabilityIncreaseLimit') : t('capabilitySetBudget')}
        </GlareButton>
      </footer>
    </section>
  )
}

export default function SessionCapabilityDialog({
  sessionId,
  initialTab,
  onClose,
}: {
  sessionId: string
  initialTab: SessionCapabilityTab
  onClose(): void
}) {
  const { t } = useLocale()
  const [tab, setTab] = useState(initialTab)
  const state = useSessionCapabilities((value) => value.sessions[sessionId])
  return (
    <Modal title={t('capabilityDialogTitle')} onClose={onClose}>
      <div className="session-capability-dialog">
        <nav className="session-capability-tabs rb-capability-tabs" aria-label={t('capabilityTabs')}>
          <GlassSurface className="capability-tabs-glass" width="100%" height="100%" aria-hidden="true" />
          <button type="button" className={tab === 'goal' ? 'selected' : ''} onClick={() => setTab('goal')}>
            <Target size={14} /> {TAB_LABELS.goal}
          </button>
          <button type="button" className={tab === 'plan' ? 'selected' : ''} onClick={() => setTab('plan')}>
            <ClipboardList size={14} /> {TAB_LABELS.plan}
          </button>
          <button type="button" className={tab === 'budget' ? 'selected' : ''} onClick={() => setTab('budget')}>
            <Gauge size={14} /> {TAB_LABELS.budget}
          </button>
        </nav>
        {tab === 'goal' && <GoalPane sessionId={sessionId} />}
        {tab === 'plan' && <PlanPane sessionId={sessionId} />}
        {tab === 'budget' && <BudgetPane sessionId={sessionId} />}
        {state?.error && <span className="visually-hidden">{state.error}</span>}
      </div>
    </Modal>
  )
}
