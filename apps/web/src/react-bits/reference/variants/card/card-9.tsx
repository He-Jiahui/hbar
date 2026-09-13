import type { ReferenceFixtureProps } from '../../reference-types'
import { BadgeCheck, MapPin, MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './card-9.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/card/card-9. */
export default function Card9(props: ReferenceFixtureProps) {
  const [following, setFollowing] = useState(false)
  return <section className="rb-public-card-9" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><article className="rb-card-9-profile"><header><span className="rb-card-9-avatar">SR</span><div><h2>Sam Rivera <BadgeCheck size={14} /></h2><p>Product designer at Meridian</p><small><MapPin size={12} /> Lisbon, Portugal</small></div></header><p className="rb-card-9-bio">Works on the payments surface. Currently rewriting the checkout flow and writing about it as it happens.</p><div className="rb-card-9-tags"><span>Design systems</span><span>Prototyping</span><span>Accessibility</span></div></article><div className="rb-card-9-stats"><div><strong>24</strong><span>Projects</span></div><div><strong>318</strong><span>Reviews</span></div><div><strong>1.2k</strong><span>Following</span></div></div><footer className="rb-card-9-actions"><button type="button" onClick={() => setFollowing((value) => !value)}>{following ? 'Following' : 'Follow'}</button><button type="button"><MessageSquare size={13} /> Message</button></footer></section>
}
