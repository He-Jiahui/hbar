import type { ReferenceFixtureProps } from '../../reference-types'
import { ArrowLeft, History, MoreHorizontal, Share2 } from 'lucide-react'
import { reportFixtureClick } from '../../reference-interactions'
import './navbar-11.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/navbar/navbar-11. */
export default function Navbar11(props: ReferenceFixtureProps) {
  const sections = ['Hypothesis and success metric', 'Segment definition', 'Rollout plan'] as const
  return (
    <section className="rb-public-navbar-11" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
      <header>
        <button type="button" aria-label="Back to documents">
          <ArrowLeft size={14} />
        </button>
        <div className="rb-navbar-11-document">
          <button type="button">Q3 pricing experiment</button>
          <span>
            <i />
            Saved
          </span>
        </div>
        <div className="rb-navbar-11-actions">
          <div className="rb-navbar-11-avatars">
            <span>NV</span>
            <span>MS</span>
            <span>PR</span>
          </div>
          <button type="button" aria-label="Version history">
            <History size={14} />
          </button>
          <button type="button" className="rb-navbar-11-share">
            <Share2 size={14} />
            Share
          </button>
          <button type="button" aria-label="Document actions">
            <MoreHorizontal size={14} />
          </button>
        </div>
      </header>
      <main>
        <h1>Q3 pricing experiment</h1>
        <p className="rb-navbar-11-lede">
          We are testing a usage-weighted tier against the current seat price for accounts above 40 seats. The goal is
          to hold net revenue flat while removing the seat ceiling that blocks expansion in the mid-market segment.
        </p>
        <div className="rb-navbar-11-sections">
          {sections.map((title) => (
            <button type="button" key={title}>
              {title}
            </button>
          ))}
        </div>
      </main>
    </section>
  )
}
