import type { ReferenceFixtureProps } from '../../reference-types'
import { ArrowLeft, Bookmark, Link2, List, Share2 } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './navbar-14.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/navbar/navbar-14. */
export default function Navbar14(props: ReferenceFixtureProps) {
  const [saved, setSaved] = useState(false)
  const sections = [
    [
      'Error budgets are a scheduling tool',
      'A budget only changes behaviour if it is allowed to run out. When it does, the team stops shipping features and spends the week on reliability instead. That trade has to be agreed before the incident, not during it.',
    ],
    [
      'Pick the window before the target',
      'A thirty-day rolling window forgives a bad Tuesday by the end of the month. A calendar quarter does not. Choose the window that matches how the team plans, then set a target you are willing to defend in a review.',
    ],
    [
      'Alert on burn rate, not on breach',
      'By the time the objective is breached the conversation is already about blame. Multi-window burn-rate alerts fire while there is still budget left to spend, which keeps the response technical.',
    ],
    [
      'Review the objective, not just the misses',
      'If an objective has never been close to breaching in a year, it is measuring something nobody depends on. Retire it and write one that would actually change a decision.',
    ],
  ] as const
  return (
    <section className="rb-public-navbar-14" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
      <header>
        <button type="button" aria-label="Back to journal">
          <ArrowLeft size={14} />
        </button>
        <div>
          <p>Error budgets that actually change behaviour</p>
          <small>Priya Raman · 9 min read</small>
        </div>
        <nav>
          <button type="button" aria-label="Open contents">
            <List size={14} />
            <span>Contents</span>
          </button>
          <button
            type="button"
            aria-label="Bookmark article"
            className={saved ? 'saved' : ''}
            onClick={() => setSaved((value) => !value)}
          >
            <Bookmark size={14} />
          </button>
          <button type="button" aria-label="Copy link">
            <Link2 size={14} />
          </button>
          <button type="button" aria-label="Share article">
            <Share2 size={14} />
          </button>
        </nav>
      </header>
      <main>
        <h1>Error budgets that actually change behaviour</h1>
        <p className="lede">
          Most teams publish an objective, watch the number, and change nothing when it slips. A budget is only useful
          if spending it is expensive.
        </p>
        {sections.map(([title, body], index) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
            {index === 0 && <div className="rb-navbar-14-figure" aria-hidden="true" />}
          </section>
        ))}
      </main>
    </section>
  )
}
