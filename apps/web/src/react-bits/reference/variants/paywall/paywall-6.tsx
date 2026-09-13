import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import { useState } from 'react'
import './paywall-6.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/paywall/paywall-6. */
export default function Paywall6(props: ReferenceFixtureProps) {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  return <section className="rb-public-paywall-6" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
    <div className="rb-paywall-meter" role="img" aria-label="3 of 3 free articles read this month"><i /><i /><i /></div>
    <p className="rb-paywall-6-eyebrow">3 OF 3 FREE READS USED</p>
    <h1>That was your last free article this month</h1>
    <p className="rb-paywall-6-copy">Your counter resets on 1 April. Leave an address and we will send<br className="rb-paywall-6-desktop-break" /> the rest of this piece, plus one long read each Thursday.</p>
    <form className="rb-paywall-6-form" onSubmit={(event) => { event.preventDefault(); setSubmitted(true) }}>
      <input aria-label="Email address" type="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />
      <button type="submit">{submitted ? 'Sent' : 'Keep reading'}</button>
    </form>
    <p className="rb-paywall-6-signin">Already subscribed? <button type="button" onClick={() => setSignedIn((value) => !value)}>{signedIn ? 'Signed in' : 'Sign in'}</button></p>
    <ul className="rb-paywall-6-benefits"><li>No card required</li><li>One email each Thursday</li><li>Unsubscribe in a click</li></ul>
  </section>
}
