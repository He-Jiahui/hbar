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

const TAB_LABELS: Record<SessionCapabilityTab, string> = {
  goal: 'Goal',
  plan: 'Plan',
  budget: 'Budget',
}

const STATUS_LABELS: Record<ThreadGoal['status'], string> = {
  active: '进行中',
  paused: '已暂停',
  blocked: '已阻塞',
  usage_limited: '用量受限',
  budget_limited: '预算受限',
  complete: '已完成',
}

const PLAN_STATUS_LABELS: Record<PlanStepStatus, string> = {
  pending: '待处理',
  in_progress: '进行中',
  completed: '已完成',
}

function parsePositiveInteger(value: string) {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function CapabilityFeedback({ loading, saving, error }: { loading: boolean; saving: boolean; error: string }) {
  if (error)
    return (
      <p className="inline-error session-capability-feedback" role="alert">
        {error}
      </p>
    )
  if (loading)
    return (
      <p className="small-muted session-capability-feedback" role="status">
        <LoaderCircle size={13} className="spinning" /> 正在读取会话状态
      </p>
    )
  if (saving)
    return (
      <p className="small-muted session-capability-feedback" role="status">
        <LoaderCircle size={13} className="spinning" /> 正在保存
      </p>
    )
  return null
}

function GoalPane({ sessionId }: { sessionId: string }) {
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
      setValidation('目标不能为空')
      return
    }
    const parsedBudget = parsePositiveInteger(tokenBudget)
    if (parsedBudget === null) {
      setValidation('预算必须是正整数')
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
    if (!goal || !window.confirm('清除当前 Goal？')) return
    try {
      await clearGoal(client(), sessionId)
    } catch (error) {
      report(error)
    }
  }

  return (
    <section className="session-capability-pane" aria-label="Goal 设置">
      <CapabilityFeedback loading={state?.loading ?? false} saving={state?.saving ?? false} error={state?.error ?? ''} />
      {goal && (
        <div className="session-capability-summary">
          <div>
            <span className="small-muted">状态</span>
            <strong>{STATUS_LABELS[goal.status]}</strong>
          </div>
          <div>
            <span className="small-muted">已用 tokens</span>
            <strong>{goal.tokensUsed.toLocaleString()}</strong>
          </div>
          <div>
            <span className="small-muted">剩余 tokens</span>
            <strong>
              {goal.tokenBudget === null ? '不限' : Math.max(0, goal.tokenBudget - goal.tokensUsed).toLocaleString()}
            </strong>
          </div>
        </div>
      )}
      <label>
        目标
        <textarea
          rows={4}
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
          placeholder="例如：完成登录流程并通过端到端测试"
          disabled={state?.saving ?? false}
        />
      </label>
      <label>
        Token 预算（可选）
        <input
          type="number"
          min={1}
          step={1}
          value={tokenBudget}
          onChange={(event) => setTokenBudget(event.target.value)}
          placeholder="不限"
          disabled={state?.saving ?? false}
        />
      </label>
      {validation && <p className="inline-error">{validation}</p>}
      <footer className="modal-footer">
        {goal && ['active', 'paused'].includes(goal.status) && (
          <button type="button" className="button" onClick={() => void togglePaused()} disabled={state?.saving ?? false}>
            {goal.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
            {goal.status === 'paused' ? '恢复' : '暂停'}
          </button>
        )}
        {goal && (
          <button type="button" className="button danger-button" onClick={() => void clear()} disabled={state?.saving ?? false}>
            <Trash2 size={14} />
            清除
          </button>
        )}
        <button type="button" className="button primary" onClick={() => void save()} disabled={state?.saving ?? false}>
          {state?.saving ? <LoaderCircle size={14} className="spinning" /> : <Save size={14} />}
          {goal ? '保存 Goal' : '创建 Goal'}
        </button>
      </footer>
    </section>
  )
}

function PlanPane({ sessionId }: { sessionId: string }) {
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
      setValidation('至少保留一个计划步骤')
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
    if (!plan || !window.confirm('清除当前计划？')) return
    try {
      await clearPlan(client(), sessionId)
    } catch (error) {
      report(error)
    }
  }

  return (
    <section className="session-capability-pane" aria-label="Plan 设置">
      <CapabilityFeedback loading={state?.loading ?? false} saving={state?.saving ?? false} error={state?.error ?? ''} />
      <div className="session-capability-mode segmented" aria-label="运行模式">
        <button type="button" className={mode === 'default' ? 'selected' : ''} onClick={() => void changeMode('default')}>
          默认模式
        </button>
        <button type="button" className={mode === 'plan' ? 'selected' : ''} onClick={() => void changeMode('plan')}>
          Plan 模式
        </button>
      </div>
      {plan?.explanation && <p className="session-capability-note">{plan.explanation}</p>}
      <div className="session-plan-list">
        {steps.map((step, index) => (
          <div className="session-plan-row" key={`${index}-${step.step}`}>
            <input
              aria-label={`计划步骤 ${index + 1}`}
              value={step.step}
              onChange={(event) =>
                setSteps((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, step: event.target.value } : item)))
              }
              disabled={state?.saving ?? false}
            />
            <select
              aria-label={`计划步骤 ${index + 1} 状态`}
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
              {Object.entries(PLAN_STATUS_LABELS).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-button"
              title="删除步骤"
              aria-label={`删除计划步骤 ${index + 1}`}
              onClick={() => setSteps((current) => current.filter((_item, itemIndex) => itemIndex !== index))}
              disabled={state?.saving ?? false}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {!steps.length && <p className="empty-list">暂无计划</p>}
      </div>
      <button
        type="button"
        className="text-command session-plan-add"
        onClick={() => setSteps((current) => [...current, { step: '', status: 'pending' }])}
        disabled={state?.saving ?? false}
      >
        <Plus size={14} />
        添加步骤
      </button>
      <label>
        备注
        <textarea
          rows={2}
          value={explanation}
          onChange={(event) => setExplanation(event.target.value)}
          placeholder="可选"
          disabled={state?.saving ?? false}
        />
      </label>
      {validation && <p className="inline-error">{validation}</p>}
      <footer className="modal-footer">
        {plan && (
          <button type="button" className="button danger-button" onClick={() => void clear()} disabled={state?.saving ?? false}>
            <Trash2 size={14} />
            清除计划
          </button>
        )}
        <button type="button" className="button primary" onClick={() => void savePlan()} disabled={state?.saving ?? false}>
          {state?.saving ? <LoaderCircle size={14} className="spinning" /> : <Check size={14} />}
          保存计划
        </button>
      </footer>
    </section>
  )
}

function BudgetPane({ sessionId }: { sessionId: string }) {
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
      setValidation('预算必须是正整数')
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
    if (!budget || !window.confirm('清除当前 token 预算？')) return
    try {
      await clearBudget(client(), sessionId)
    } catch (error) {
      report(error)
    }
  }

  return (
    <section className="session-capability-pane" aria-label="Budget 设置">
      <CapabilityFeedback loading={state?.loading ?? false} saving={state?.saving ?? false} error={state?.error ?? ''} />
      {budget ? (
        <div className={`budget-meter budget-meter-${budget.phase}`} aria-label="预算使用情况">
          <div className="budget-meter-heading">
            <strong>{budget.phase === 'exhausted' ? '预算已耗尽' : '预算使用情况'}</strong>
            <span>{percentage}%</span>
          </div>
          <div className="budget-meter-track" role="progressbar" aria-valuemin={0} aria-valuemax={budget.limit} aria-valuenow={budget.usedTokens}>
            <span style={{ width: `${percentage}%` }} />
          </div>
          <div className="budget-meter-values">
            <span>{budget.usedTokens.toLocaleString()} used</span>
            <span>{budget.remainingTokens.toLocaleString()} remaining</span>
          </div>
        </div>
      ) : (
        <p className="empty-list">当前会话未设置预算</p>
      )}
      <label>
        Token 上限
        <input
          type="number"
          min={1}
          step={1}
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          placeholder="例如 100000"
          disabled={state?.saving ?? false}
        />
      </label>
      {validation && <p className="inline-error">{validation}</p>}
      <footer className="modal-footer">
        {budget && (
          <button type="button" className="button danger-button" onClick={() => void clear()} disabled={state?.saving ?? false}>
            <Trash2 size={14} />
            清除预算
          </button>
        )}
        <button type="button" className="button primary" onClick={() => void save()} disabled={state?.saving ?? false}>
          {state?.saving ? <LoaderCircle size={14} className="spinning" /> : <Gauge size={14} />}
          {budget ? '增加上限' : '设置预算'}
        </button>
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
  const [tab, setTab] = useState(initialTab)
  const state = useSessionCapabilities((value) => value.sessions[sessionId])
  return (
    <Modal title="会话能力" onClose={onClose}>
      <div className="session-capability-dialog">
        <nav className="session-capability-tabs" aria-label="会话能力类型">
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
