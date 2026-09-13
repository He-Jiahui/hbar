import type { ReferenceFixtureProps } from '../../reference-types'
import { ChevronDown, Settings, Square, Zap } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './navbar-3.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/navbar/navbar-3. */
export default function Navbar3(props: ReferenceFixtureProps) {
  const [upgraded, setUpgraded] = useState(false)
  return <section className="rb-public-navbar-3" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><header><div className="rb-navbar-3-crumbs"><button type="button"><span className="rb-navbar-3-mark">N</span><strong>Northwind</strong><ChevronDown size={12} /></button><span>/</span><button type="button"><strong>web-app</strong><ChevronDown size={12} /></button><span>/</span><button type="button"><span className="rb-navbar-3-dot" />Production<ChevronDown size={12} /></button></div><div className="rb-navbar-3-actions"><button type="button" aria-label="Documentation"><Square size={14} /></button><button type="button" aria-label="Settings"><Settings size={14} /></button><button type="button" className="upgrade" onClick={() => setUpgraded(true)}><Zap size={14} />{upgraded ? 'Upgraded' : 'Upgrade'}</button><button type="button" className="avatar">EM</button></div></header><main><h2>web-app</h2><p>Northwind · production deployment</p><div className="rb-navbar-3-stats"><article><span>Deployments</span><strong>128</strong></article><article><span>Median build</span><strong>42s</strong></article><article><span>Last release</span><strong>6h ago</strong></article></div></main></section>
}
