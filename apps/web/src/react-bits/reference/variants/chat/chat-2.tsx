import type { ReferenceFixtureProps } from '../../reference-types'
import { Check, Image, Phone, Search, Send, Video } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './chat-2.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/chat/chat-2. */
export default function Chat2(props: ReferenceFixtureProps) {
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [sent, setSent] = useState(false)
  const contacts = [
    ['SA', 'Sofia Alvarez', '09:41', 'Sent the revised copy deck', true],
    ['MB', 'Marcus Bell', '09:12', "Works for me, let's ship it", false],
    ['PN', 'Priya Nandakumar', 'Yesterday', 'Photo', false],
    ['WC', 'Wei Chen', 'Yesterday', "I'll pick this up Monday", false],
    ['TG', 'Tomás Guerrero', 'Tue', 'Thanks for the review', false],
  ] as const
  const filtered = contacts.filter((contact) => !query || contact.join(' ').toLowerCase().includes(query.toLowerCase()))
  const send = () => {
    if (draft.trim()) {
      setSent(true)
      setDraft('')
    }
  }
  return (
    <section className="rb-public-chat-2" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
      <div className="rb-chat-2-shell">
        <aside>
          <label>
            <Search size={14} />
            <span className="rb-chat-2-sr-only">Search conversations</span>
            <input
              aria-label="Search messages"
              placeholder="Search messages"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <ul>
            {filtered.map(([initials, name, time, preview, active]) => (
              <li key={name}>
                <button type="button" className={active ? 'active' : ''}>
                  <span className="rb-chat-2-avatar">{initials}</span>
                  <span className="rb-chat-2-contact">
                    <strong>{name}</strong>
                    <small>{preview}</small>
                  </span>
                  <time>{time}</time>
                  {active && <b>2</b>}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <main>
          <header>
            <span className="rb-chat-2-avatar">SA</span>
            <div>
              <h2>Sofia Alvarez</h2>
              <p>
                <i />
                Active now
              </p>
            </div>
            <button type="button" aria-label="Start voice call">
              <Phone size={15} />
            </button>
            <button type="button" aria-label="Start video call">
              <Video size={15} />
            </button>
          </header>
          <div className="rb-chat-2-messages">
            <p className="rb-chat-2-day">Today</p>
            <div className="rb-chat-2-message incoming">
              <div className="rb-chat-2-bubble">
                <p>Morning. The revised copy deck is in the shared folder, second tab has the shorter variants.</p>
                <time>09:28</time>
              </div>
            </div>
            <div className="rb-chat-2-message outgoing">
              <div className="rb-chat-2-bubble">
                <p>Got it. The shorter headline reads much better on mobile.</p>
                <time>
                  09:31 <Check size={11} />
                </time>
              </div>
            </div>
            <div className="rb-chat-2-message outgoing">
              <div className="rb-chat-2-bubble">
                <p>One ask: can the subhead drop the second clause? It wraps to three lines at 375.</p>
                <time>
                  09:31 <Check size={11} />
                </time>
              </div>
            </div>
            <div className="rb-chat-2-message incoming short">
              <div className="rb-chat-2-bubble">
                <p>Easy. I will trim it and re-export both light and dark.</p>
                <time>09:38</time>
              </div>
            </div>
            <div className="rb-chat-2-message incoming shorter">
              <div className="rb-chat-2-bubble">
                <p>Anything else before I lock the file?</p>
                <time>09:41</time>
              </div>
            </div>
            {sent && (
              <div className="rb-chat-2-message outgoing">
                <div className="rb-chat-2-bubble">
                  <p>Thanks — I will follow up shortly.</p>
                  <time>
                    now <Check size={11} />
                  </time>
                </div>
              </div>
            )}
          </div>
          <form
            className="rb-chat-2-composer"
            onSubmit={(event) => {
              event.preventDefault()
              send()
            }}
          >
            <textarea
              aria-label="Message Sofia Alvarez"
              placeholder="Write a message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="button" aria-label="Attach image">
              <Image size={15} />
            </button>
            <button type="submit" aria-label="Send message">
              <Send size={15} />
            </button>
          </form>
        </main>
        <button type="button" className="rb-chat-2-theme">
          ◉&nbsp; Theme
        </button>
      </div>
    </section>
  )
}
