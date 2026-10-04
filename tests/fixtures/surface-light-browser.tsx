import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  DEFAULT_LUMEN_APPEARANCE,
  LumenButton,
  LumenDivider,
  LumenIndicator,
  LumenInput,
  LumenProvider,
  LumenSurface,
} from '@lumen/app-ui'
import '../../packages/hbar-app-ui/src/theme.css'

const copy = {
  title: '表面材质与状态光',
  static: '普通面板中的字段独立聚焦',
  interactive: '可以聚焦的玻璃面板',
  glass: '玻璃材质',
  frost: '磨砂材质',
  solid: '实色材质',
  running: '执行中',
  finish: '完成执行',
  motion: '切换动态效果',
}

function SurfaceFixture() {
  const [running, setRunning] = useState(true)
  const [motion, setMotion] = useState(true)
  const mode = document.documentElement.dataset.lumenMode === 'light' ? 'light' : 'dark'
  const glow = Number(document.documentElement.dataset.fixtureGlow ?? 65)
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode, motion, glow }} withCssBaseline={false}>
      <main className="surface-fixture">
        <h1>{copy.title}</h1>
        <LumenSurface as="section" data-testid="static-panel" contentClassName="surface-content" boundary="horizontal">
          <h2>{copy.static}</h2>
          <LumenInput aria-label={copy.static} />
        </LumenSurface>
        <LumenSurface
          as="article"
          data-testid="interactive-panel"
          aria-label={copy.interactive}
          contentClassName="surface-content"
          interactive
          tabIndex={0}
        >
          <h2>{copy.interactive}</h2>
          <p>{copy.glass}</p>
        </LumenSurface>
        <section className="surface-row">
          {(['glass', 'frost', 'solid'] as const).map((material) => (
            <LumenSurface
              key={material}
              material={material}
              contentClassName="surface-content"
              data-testid={`material-${material}`}
            >
              <h2>{copy[material]}</h2>
            </LumenSurface>
          ))}
        </section>
        <LumenDivider />
        <LumenSurface
          as="section"
          data-testid="running-panel"
          state={running ? 'running' : 'idle'}
          tone="info"
          contentClassName="surface-content"
        >
          <div className="surface-row">
            <LumenIndicator state={running ? 'running' : 'idle'} tone="info" />
            <span>{copy.running}</span>
          </div>
          <LumenButton variant="outlined" onClick={() => setRunning(false)}>
            {copy.finish}
          </LumenButton>
        </LumenSurface>
        <LumenButton variant="text" onClick={() => setMotion((value) => !value)}>
          {copy.motion}
        </LumenButton>
      </main>
    </LumenProvider>
  )
}
const root = document.getElementById('fixture-root')
if (!root) throw new Error('The surface fixture mount is missing')
createRoot(root).render(<SurfaceFixture />)
