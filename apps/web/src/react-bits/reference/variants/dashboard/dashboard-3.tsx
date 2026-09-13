import type { ReferenceFixtureProps } from '../../reference-types'
import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './dashboard-3.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/dashboard/dashboard-3. */
export default function Dashboard3(props: ReferenceFixtureProps) {
  const metrics = [
    ['Active users', '8,472', '+3.2%', 'up'],
    ['Sessions', '21,908', '+5.1%', 'up'],
    ['Avg. session', '4m 12s', '−1.4%', 'down'],
    ['Bounce rate', '38.6%', '+0.9 pp', 'down'],
  ] as const
  const pages = [
    ['/', '48,210'],
    ['/pricing', '22,984'],
    ['/docs/quickstart', '18,663'],
    ['/changelog', '9,120'],
    ['/blog/series-b', '6,845'],
  ] as const
  const devices = [
    ['Desktop', 62],
    ['Mobile', 31],
    ['Tablet', 7],
  ] as const
  const funnel = [
    ['Visited', '21,908'],
    ['Signed up', '3,914'],
    ['Activated', '2,180'],
    ['Subscribed', '1,024'],
  ] as const
  const bars = [102, 96, 107, 120, 116, 126, 139, 132, 141, 136, 146, 150, 156, 160] as const
  const [selectedBar, setSelectedBar] = useState<number | undefined>()
  return (
    <section
      className="rb-public-dashboard-3"
      onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}
    >
      <header className="rb-dashboard-3-header">
        <h1>Web analytics</h1>
        <span>Updated 2 min ago</span>
      </header>
      <div className="rb-dashboard-3-body">
        <div className="rb-dashboard-3-metrics">
          {metrics.map(([label, value, change, direction], index) => (
            <article key={label} className="rb-dashboard-3-metric">
              <p>{label}</p>
              <strong>{value}</strong>
              <small className={direction}>
                {change} <i>vs. last week</i>
              </small>
              <svg aria-hidden="true" viewBox="0 0 72 32" preserveAspectRatio="none">
                <polyline
                  points={
                    index % 2 === 0
                      ? '2,24 14,20 23,22 34,14 45,18 56,9 70,3'
                      : '2,23 13,21 24,24 35,17 44,19 57,10 70,2'
                  }
                />
              </svg>
            </article>
          ))}
        </div>
        <div className="rb-dashboard-3-panels">
          <section className="rb-dashboard-3-panel rb-dashboard-3-sessions">
            <div className="rb-dashboard-3-panel-head">
              <h2>Sessions, last 14 days</h2>
              <button type="button" aria-label="Sessions, last 14 days options">
                <MoreHorizontal size={16} />
              </button>
            </div>
            <div className="rb-dashboard-3-bars" role="list" aria-label="Sessions over the last 14 days">
              {bars.map((height, index) => (
                <button
                  type="button"
                  role="listitem"
                  aria-label={`Day ${index + 1}, ${height} sessions`}
                  key={index}
                  className={selectedBar === index ? 'selected' : ''}
                  onClick={() => setSelectedBar(index)}
                >
                  <span style={{ height }} />
                </button>
              ))}
            </div>
            <footer>
              <span>Mar 1</span>
              <span>Mar 14</span>
            </footer>
          </section>
          <section className="rb-dashboard-3-panel rb-dashboard-3-pages">
            <div className="rb-dashboard-3-panel-head">
              <h2>Top pages</h2>
              <button type="button" aria-label="Top pages options">
                <MoreHorizontal size={16} />
              </button>
            </div>
            <ul>
              {pages.map(([path, count]) => (
                <li key={path}>
                  <span>{path}</span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          </section>
          <section className="rb-dashboard-3-panel rb-dashboard-3-devices">
            <div className="rb-dashboard-3-panel-head">
              <h2>Devices</h2>
              <button type="button" aria-label="Devices options">
                <MoreHorizontal size={16} />
              </button>
            </div>
            <ul>
              {devices.map(([label, value]) => (
                <li key={label}>
                  <div>
                    <span>{label}</span>
                    <strong>{value}%</strong>
                  </div>
                  <i>
                    <b style={{ width: `${value}%` }} />
                  </i>
                </li>
              ))}
            </ul>
          </section>
          <section className="rb-dashboard-3-panel rb-dashboard-3-funnel">
            <div className="rb-dashboard-3-panel-head">
              <h2>Signup funnel</h2>
              <button type="button" aria-label="Signup funnel options">
                <MoreHorizontal size={16} />
              </button>
            </div>
            <ol>
              {funnel.map(([label, value], index) => (
                <li key={label}>
                  <span>{index + 1}</span>
                  <strong>{label}</strong>
                  <b>{value}</b>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </section>
  )
}
