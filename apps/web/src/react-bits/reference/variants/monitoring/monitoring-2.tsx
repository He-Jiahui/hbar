import { Pause, Play, Palette } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './monitoring-2.css'

// The public preview emits a sampled cubic stream path. Keeping the observed
// path (rather than inventing a charting dependency) preserves its geometry at
// desktop and lets CSS scale the same 994×220 plotting surface responsively.
const STREAM_PATH =
  'M1,117.766C6.605,117.982,12.209,118.198,17.814,119.025C23.418,119.852,29.023,121.239,34.627,122.728C40.232,124.217,45.836,126.141,51.441,127.958C57.045,129.775,62.65,131.826,68.254,133.63C73.859,135.434,79.463,137.25,85.068,138.784C90.672,140.318,96.277,141.682,101.881,142.835C107.486,143.989,113.09,144.877,118.695,145.706C124.299,146.536,129.904,147.113,135.508,147.814C141.113,148.514,146.718,149.074,152.322,149.909C157.927,150.744,163.531,151.61,169.136,152.823C174.74,154.035,180.345,155.456,185.949,157.183C191.554,158.911,197.158,160.97,202.763,163.189C208.367,165.408,213.972,167.983,219.576,170.496C225.181,173.009,230.785,175.792,236.39,178.266C241.994,180.741,247.599,183.299,253.203,185.346C258.808,187.393,264.412,189.281,270.017,190.546C275.621,191.811,281.226,192.938,286.831,192.938C292.435,192.938,298.04,192.655,303.644,192.09C309.249,191.524,314.853,189.868,320.458,188.174C326.062,186.48,331.667,184.213,337.271,181.927C342.876,179.641,348.48,176.951,354.085,174.459C359.689,171.968,365.294,169.306,370.898,166.977C376.503,164.648,382.107,162.389,387.712,160.486C393.316,158.583,398.921,156.935,404.525,155.559C410.13,154.183,415.734,153.151,421.339,152.23C426.944,151.309,432.548,150.707,438.153,150.034C443.757,149.362,449.362,148.887,454.966,148.196C460.571,147.506,466.175,146.837,471.78,145.893C477.384,144.949,482.989,143.855,488.593,142.534C494.198,141.213,499.802,139.629,505.407,137.967C511.011,136.306,516.616,134.368,522.22,132.564C527.825,130.76,533.429,128.776,539.034,127.143C544.638,125.51,550.243,123.881,555.847,122.768C561.452,121.654,567.056,120.462,572.661,120.462C578.266,120.462,583.87,120.618,589.475,120.93C595.079,121.242,600.684,122.787,606.288,124.345C611.893,125.903,617.497,128.038,623.102,130.279C628.706,132.519,634.311,135.229,639.915,137.787C645.52,140.345,651.124,143.167,656.729,145.626C662.333,148.085,667.938,150.552,673.542,152.544C679.147,154.535,684.751,156.29,690.356,157.575C695.96,158.86,701.565,159.967,707.169,160.252C712.774,160.537,718.379,160.679,723.983,160.679C729.588,160.679,735.192,159.992,740.797,159.458C746.401,158.925,752.006,158.115,757.61,157.477C763.215,156.838,768.819,156.118,774.424,155.629C780.028,155.141,785.633,154.642,791.237,154.546C796.842,154.451,802.446,154.403,808.051,154.403C813.655,154.403,819.26,154.733,824.864,154.864C830.469,154.994,836.073,155.185,841.678,155.185C847.282,155.185,852.887,154.933,858.492,154.431C864.096,153.928,869.701,153.05,875.305,151.76C880.91,150.471,886.514,148.772,892.119,146.694C897.723,144.616,903.328,142.043,908.932,139.291C914.537,136.539,920.141,133.322,925.746,130.183C931.35,127.043,936.955,123.583,942.559,120.452C948.164,117.321,953.768,114.101,959.373,111.396C964.977,108.691,970.582,106.159,976.186,104.22C981.791,102.281,987.395,101.021,993,99.761'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/monitoring/monitoring-2. */
export default function Monitoring2({ onInteraction, viewport }: ReferenceFixtureProps) {
  const [metric, setMetric] = useState('Requests')
  const [paused, setPaused] = useState(false)
  const values = paused
    ? ['4,519', '4,174', '4,638', '3,721']
    : viewport === 'mobile'
      ? ['4,519', '4,174', '4,638', '3,721']
      : viewport === 'tablet'
        ? ['4,557', '4,170', '4,638', '3,721']
        : ['4,638', '4,160', '4,638', '3,721']
  return (
    <section className="rb-public-monitoring-2" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
      <div className="rb-monitor-2-shell">
        <header className="rb-monitor-2-header">
          <div className="rb-monitor-2-title">
            <div>
              <h2>Live stream</h2>
              <span>
                <i />
                Streaming
              </span>
            </div>
            <p>api-gateway · eu-west-1 · 1s resolution</p>
          </div>
          <div className="rb-monitor-2-actions">
            <nav role="tablist" aria-label="Metric">
              {['Requests', 'p99 latency', 'Errors'].map((item) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={metric === item}
                  className={metric === item ? 'selected' : ''}
                  key={item}
                  onClick={() => setMetric(item)}
                >
                  {item}
                </button>
              ))}
            </nav>
            <button type="button" className="rb-monitor-2-pause" onClick={() => setPaused((value) => !value)}>
              {paused ? <Play size={14} /> : <Pause size={14} />}
              {paused ? 'Resume' : 'Pause'}
            </button>
          </div>
        </header>
        <section className="rb-monitor-2-chart" aria-label={`${metric} over the last 60 seconds`}>
          <div className="rb-monitor-2-chart-top">
            <div>
              <strong>{values[0]}</strong>
              <small>/s</small>
            </div>
            <p>
              <i />
              Autoscale at 5,200/s
            </p>
          </div>
          <div className="rb-monitor-2-plot">
            <svg viewBox="0 0 994 220" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="monitor-2-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="0" x2="994" y1="55" y2="55" />
              <line x1="0" x2="994" y1="110" y2="110" />
              <line x1="0" x2="994" y1="165" y2="165" />
              <line className="threshold" x1="0" x2="994" y1="40.2" y2="40.2" />
              <path className="area" d={`${STREAM_PATH}L993,220L1,220Z`} />
              <path className="line" d={STREAM_PATH} />
              <circle cx="993" cy="99.761" r="3.5" />
            </svg>
          </div>
          <div className="rb-monitor-2-axis">
            <span>−60s</span>
            <span>−45s</span>
            <span>−30s</span>
            <span>−15s</span>
            <span>now</span>
          </div>
        </section>
        <div className="rb-monitor-2-stats">
          {[
            ['Now', values[0]],
            ['Average', values[1]],
            ['Peak', values[2]],
            ['Floor', values[3]],
          ].map(([label, value]) => (
            <article key={label}>
              <p>{label}</p>
              <strong>
                {value}
                <small>/s</small>
              </strong>
            </article>
          ))}
        </div>
      </div>
      <button type="button" className="rb-monitor-2-theme">
        <Palette size={16} />
        <span>Theme</span>
      </button>
    </section>
  )
}
