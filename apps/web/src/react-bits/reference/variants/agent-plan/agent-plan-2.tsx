import { useState } from 'react'
import { ArrowDown, ArrowUp, Check, Play, Plus, RotateCcw, X } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './agent-plan-2.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/agent-plan/agent-plan-2. */
export default function AgentPlan2({ onInteraction }: ReferenceFixtureProps) {
  const [steps, setSteps] = useState([
    { text: 'Read the billing contract notes', skipped: false },
    { text: 'Map the entitlement resolver', skipped: false },
    { text: 'Patch the tier lookup fallback', skipped: false },
    { text: 'Add a renewal-grace regression test', skipped: false },
    { text: 'Run the license branch checks', skipped: false },
    { text: 'Regenerate the entitlement fixtures', skipped: true },
    { text: 'Update the installation docs', skipped: false },
    { text: 'Notify the reviewer channel', skipped: false },
    { text: 'Summarize the handoff for review', skipped: false },
  ])
  const [newStep, setNewStep] = useState('')
  const [started, setStarted] = useState(false)
  const activeCount = steps.filter((step) => !step.skipped).length
  const move = (index: number, direction: -1 | 1) => setSteps((current) => { const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target]!, next[index]!]; return next })
  const toggleSkip = (index: number) => setSteps((current) => current.map((step, item) => item === index ? { ...step, skipped: !step.skipped } : step))
  const addStep = () => { const value = newStep.trim(); if (!value) return; setSteps((current) => [...current, { text: value, skipped: false }]); setNewStep('') }

  return <section className="rb-public-plan-2" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <header><h1>Review the plan</h1><span>{activeCount} to run · {steps.length - activeCount} skipped</span></header>
    <div className="rb-public-plan-2-frame"><div className="rb-public-plan-2-inner"><ol>{steps.map((step, index) => <li className={step.skipped ? 'is-skipped' : ''} key={`${step.text}-${index}`}><b>{index + 1}</b><span>{step.text}{step.skipped && <small> : skipped</small>}</span><div><button type="button" aria-label={`Move ${step.text} up`} onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp size={15} /></button><button type="button" aria-label={`Move ${step.text} down`} onClick={() => move(index, 1)} disabled={index === steps.length - 1}><ArrowDown size={15} /></button><button type="button" aria-label={`${step.skipped ? 'Restore' : 'Skip'} ${step.text}`} onClick={() => toggleSkip(index)}>{step.skipped ? <RotateCcw size={14} /> : <X size={14} />}</button></div></li>)}</ol></div></div>
    <div className="rb-public-plan-2-add"><input aria-label="Add a step" placeholder="Add a step" value={newStep} onChange={(event) => setNewStep(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addStep() }} /><button type="button" onClick={addStep}><Plus size={15} />Add</button></div>
    <footer><p>Reorder or skip steps, then start the run.</p><button type="button" className="rb-public-plan-2-start" onClick={() => setStarted((value) => !value)}>{started ? <Check size={15} /> : <Play size={15} />}{started ? 'Running' : `Start ${activeCount} steps`}</button><button type="button" className="rb-public-plan-2-theme" aria-label="Theme">◉&nbsp; Theme</button></footer>
  </section>
}
