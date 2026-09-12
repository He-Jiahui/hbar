import { Apple, Check, Eye, EyeOff, GitBranch as Github } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './authentication-1.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/authentication/authentication-1. */
export default function Authentication1({ onInteraction }: ReferenceFixtureProps) {
  const [show, setShow] = useState(false)
  const [signed, setSigned] = useState(false)
  return <section className="rb-public-authentication-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><div className="rb-auth-card"><div className="rb-auth-logo">N</div><h1>{signed ? 'Signed in' : 'Sign in'}</h1><p className="rb-auth-subtitle">Continue to the Northwind workspace.</p>{signed ? <div className="rb-auth-success"><Check size={20} /><p>You are signed in to Northwind.</p><button type="button" onClick={() => setSigned(false)}>Sign out</button></div> : <><label>Email or username<input placeholder="you@northwind.com" /></label><label className="password-label">Password<a href="#forgot" onClick={(event) => event.preventDefault()}>Forgot password?</a><span><input type={show ? 'text' : 'password'} placeholder="Enter your password" /><button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((value) => !value)}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button></span></label><label className="rb-auth-check"><input type="checkbox" defaultChecked /><span>Keep me signed in for 30 days</span></label><button type="button" className="rb-auth-submit" onClick={() => setSigned(true)}>Sign in</button><div className="rb-auth-or"><span>Or continue with</span></div><div className="rb-auth-providers"><button type="button"><b>G</b> Google</button><button type="button"><Apple size={15} /> Apple</button><button type="button"><Github size={15} /> GitHub</button></div></>}</div><p className="rb-auth-account">Need an account? <a href="#create" onClick={(event) => event.preventDefault()}>Create one</a></p><nav className="rb-auth-footer"><a href="#privacy">Privacy</a><a href="#terms">Terms</a><a href="#status">Status</a></nav><button type="button" className="rb-auth-theme">◉&nbsp; Theme</button></section>
}
