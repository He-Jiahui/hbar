import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {ArrowLeft, ArrowRight, Check} from 'lucide-react'
import {
    WizardButton,
    WizardFooter,
    WizardFrame,
    reportWizardAction,
    type WizardSurfaceProps,
} from './WizardPrimitives'

const questions = [
    {title: 'What do you sell?', detail: 'We tailor your workspace defaults.', options: ['Physical goods', 'Digital goods', 'Services', 'A little of everything']},
    {title: 'Where do you ship to?', detail: 'We enable the right customs forms.', options: ['Domestic only', 'Europe', 'Worldwide', 'Not sure yet']},
    {title: 'How often do you ship?', detail: 'This helps us set sensible limits.', options: ['A few times a month', 'Weekly', 'Daily', 'Not sure yet']},
    {title: 'Who manages fulfilment?', detail: 'Choose the team that owns delivery.', options: ['Our team', 'A partner', 'Both', 'Not sure yet']},
    {title: 'Ready to continue?', detail: 'You can change these answers later.', options: ['Yes, continue', 'I need to review', 'Not sure yet', 'Skip setup']},
] as const

export function ShippingQuestion({spec, onAction}: WizardSurfaceProps) {
    const [step, setStep] = useState(1)
    const [answer, setAnswer] = useState('Europe')
    const question = questions[step] ?? questions[0]
    const move = (next: number) => {
        const bounded = Math.max(0, Math.min(questions.length - 1, next))
        setStep(bounded)
        reportWizardAction(onAction, spec, 'step', String(bounded + 1))
    }

    return <WizardFrame spec={spec} onAction={onAction} className="hbar-app-ui-wizard-question"><main className="hbar-app-ui-wizard-question-card"><header className="hbar-app-ui-wizard-question-header"><nav aria-label="Questions">{questions.map((item, index) => <button type="button" key={item.title} aria-label={`Go to question ${index + 1}`} className={index === step ? 'is-active' : index < step ? 'is-complete' : ''} onClick={() => move(index)}><span>{index < step ? <HbarAppUiIcon icon={Check} tier="xs" /> : ''}</span></button>)}</nav><span>{step + 1} of {questions.length}</span></header><section><h1>{question.title}</h1><p>{question.detail}</p><div className="hbar-app-ui-wizard-question-options" role="radiogroup" aria-label={question.title}>{question.options.map((option) => <label className={answer === option ? 'is-selected' : ''} key={option}><input type="radio" name="shipping-answer" checked={answer === option} onChange={() => {
        setAnswer(option)
        reportWizardAction(onAction, spec, 'answer', option)
    }}/><span className="hbar-app-ui-wizard-question-radio" aria-hidden="true">{answer === option && <HbarAppUiIcon icon={Check} tier="xs" />}</span><strong>{option}</strong></label>)}</div></section><WizardFooter><WizardButton aria-label="Previous question" title="Previous question" disabled={step === 0} onClick={() => move(step - 1)}><HbarAppUiIcon icon={ArrowLeft} tier="sm" /></WizardButton><WizardButton tone="light" onClick={() => move(step + 1)}>{step === questions.length - 1 ? 'Finish' : 'Continue'}<HbarAppUiIcon icon={ArrowRight} tier="sm" /></WizardButton></WizardFooter><button type="button" className="hbar-app-ui-wizard-question-skip" onClick={() => reportWizardAction(onAction, spec, 'skip')}>Skip and use defaults</button></main></WizardFrame>
}
