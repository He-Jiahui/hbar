import type { ReferenceFixtureProps } from '../../reference-types'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './wizard-7.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/wizard/wizard-7. */
export default function Wizard7(props: ReferenceFixtureProps) {
  const [choice, setChoice] = useState('Europe')
  const [step, setStep] = useState(2)
  const options = ['Domestic only', 'Europe', 'Worldwide', 'Not sure yet']
  return <section className="rb-public-wizard-7" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><article className="rb-wizard-7-card"><header><div className="rb-wizard-7-dots">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-label={`Go to question ${value}`} className={value === step ? 'active' : value < step ? 'done' : ''} onClick={() => setStep(value)}>{value < step ? <Check size={9} /> : ''}</button>)}</div><span>{step} of 5</span></header>{step === 2 ? <><h1>Where do you ship to?</h1><p className="rb-wizard-7-subtitle">We enable the right customs forms.</p><div className="rb-wizard-7-options">{options.map((option) => <button type="button" key={option} className={choice === option ? 'selected' : ''} onClick={() => setChoice(option)}><i>{choice === option && <Check size={11} />}</i>{option}</button>)}</div></> : <><h1>{step === 1 ? 'What are you selling?' : step === 3 ? 'How often do you ship?' : step === 4 ? 'Which carrier do you use?' : 'Ready to continue?'}</h1><p className="rb-wizard-7-subtitle">A couple more details help us configure the workspace.</p></>}<footer><button type="button" aria-label="Previous question" onClick={() => setStep((value) => Math.max(1, value - 1))}><ArrowLeft size={15} /></button><button type="button" className="continue" onClick={() => setStep((value) => Math.min(5, value + 1))}>Continue <ArrowRight size={15} /></button></footer><button type="button" className="skip" onClick={() => setStep(5)}>Skip and use defaults</button></article></section>
}
