import { useState } from 'react'
import { GoalPane } from './GoalPane'
import { useLocale } from './locale'
import { HbarAppUiIcon } from 'hbar-app-ui'
import { ClipboardList, Gauge, Target } from 'lucide-react'
import { Modal } from './Modal'
import { PlanPane } from './PlanPane'
import { BudgetPane } from './BudgetPane'
import { useSessionCapabilities, type SessionCapabilityTab } from './session-capabilities'
import './SessionCapabilityDialog.css'

const TAB_LABELS: Record<SessionCapabilityTab, string> = {
  goal: 'Goal',
  plan: 'Plan',
  budget: 'Budget',
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
    <Modal title={t('sessionCapabilities')} onClose={onClose}>
      <div className="session-capability-dialog">
        <nav className="session-capability-tabs" aria-label={t('sessionCapabilities')}>
          <button type="button" className={tab === 'goal' ? 'selected' : ''} onClick={() => setTab('goal')}>
            <HbarAppUiIcon icon={Target} tier="sm" /> {TAB_LABELS.goal}
          </button>
          <button type="button" className={tab === 'plan' ? 'selected' : ''} onClick={() => setTab('plan')}>
            <HbarAppUiIcon icon={ClipboardList} tier="sm" /> {TAB_LABELS.plan}
          </button>
          <button type="button" className={tab === 'budget' ? 'selected' : ''} onClick={() => setTab('budget')}>
            <HbarAppUiIcon icon={Gauge} tier="sm" /> {TAB_LABELS.budget}
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
