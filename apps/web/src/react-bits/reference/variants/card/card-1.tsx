import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './card-1.css'

const people = [
  ['SR', 'Sam Rivera', 'Product Lead · Lisbon', 'Runs discovery and roadmap for the payments surface.', false],
  ['IH', 'Imani Hale', 'Staff Engineer · Berlin', 'Owns the ledger service and the move to event sourcing.', true],
  ['DO', 'Dana Okafor', 'Design Director · New York', 'Sets the visual system and reviews every shipped surface.', false],
  ['RM', 'Rowan Moss', 'Data Scientist · Toronto', 'Builds the forecasting models behind the revenue dashboard.', false],
  ['NS', 'Nina Silva', 'Support Manager · São Paulo', 'Leads the escalation desk across three regions.', false],
  ['TA', 'Tomas Abara', 'Solutions Architect · Singapore', 'Pairs with enterprise accounts through their first integration.', false],
] as const

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/card/card-1. */
export default function Card1({ onInteraction }: ReferenceFixtureProps) {
  const [connected, setConnected] = useState<string | undefined>('Imani Hale')
  return <section className="rb-public-card-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><ul>{people.map(([initials, name, role, description, online]) => <li className={connected === name ? 'connected' : ''} key={name}><div className="card-body"><span className="avatar">{initials}<i className={online ? '' : 'offline'} /></span><h2>{name}</h2><p className="card-meta">{role}</p><p className="card-description">{description}</p></div><button type="button" onClick={() => setConnected((current) => current === name ? undefined : name)}>{connected === name ? 'Connected' : 'Connect'}</button></li>)}</ul></section>
}
