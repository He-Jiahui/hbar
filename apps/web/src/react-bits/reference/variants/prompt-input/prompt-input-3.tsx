import { useState } from 'react'
import { ArrowUp, BarChart3, LayoutDashboard, ListChecks, Paperclip, Store } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './prompt-input-3.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-3. */
export default function PromptInput3({ onInteraction }: ReferenceFixtureProps) {
  const [prompt, setPrompt] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const suggestions = [
    ['Landing page', LayoutDashboard],
    ['Analytics dashboard', BarChart3],
    ['Storefront', Store],
    ['Onboarding flow', ListChecks],
  ] as const

  function submit(): void {
    if (!prompt.trim()) return
    setSubmitted(true)
  }

  return <section className="rb-public-prompt-3" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <div className="rb-public-prompt-3-content">
      <header>
        <h1>{submitted ? 'Draft ready to refine' : 'What do you want to build?'}</h1>
        <p>{submitted ? 'Keep iterating with a more specific follow-up.' : 'Describe it in a sentence and get a working first draft.'}</p>
      </header>
      <form className="rb-public-prompt-3-composer" onSubmit={(event) => { event.preventDefault(); submit() }}>
        <textarea aria-label="Prompt" placeholder="Ask anything" value={prompt} onChange={(event) => { setPrompt(event.target.value); setSubmitted(false) }} />
        <footer>
          <button type="button" aria-label="Attach a file"><Paperclip size={16} strokeWidth={1.8} /></button>
          <button type="submit" aria-label="Send prompt" disabled={!prompt.trim()}><ArrowUp size={16} strokeWidth={1.8} /></button>
        </footer>
      </form>
      <nav aria-label="Prompt ideas">
        {suggestions.map(([label, Icon]) => <button type="button" key={label} onClick={() => { setPrompt(`Build a ${label.toLowerCase()}`); setSubmitted(false) }}><Icon size={14} strokeWidth={1.45} /><span>{label}</span></button>)}
      </nav>
    </div>
  </section>
}
