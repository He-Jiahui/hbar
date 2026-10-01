import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import Button from '@mui/material/Button'
import { DEFAULT_LUMEN_APPEARANCE, LumenProvider } from '@lumen/app-ui'
import { HbarAppUiButton } from '../../packages/hbar-app-ui/src/primitives'
import '@lumen/app-ui/styles.css'
import '../../packages/hbar-app-ui/src/theme.css'
import { buttonPrimitiveFixture } from './button-primitives'

const root = document.getElementById('fixture-root')
if (!root) throw new Error('The button fixture mount is missing')

function ButtonEffectsFixture() {
  const [loading, setLoading] = useState(true)
  const [glow, setGlow] = useState(Number(document.documentElement.dataset.fixtureGlow ?? 65))
  const [motion, setMotion] = useState(document.documentElement.dataset.fixtureMotion !== 'off')
  const [clicks, setClicks] = useState(0)
  const mode = document.documentElement.dataset.lumenMode === 'light' ? 'light' : 'dark'
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode, glow, motion }} withCssBaseline={false}>
      {buttonPrimitiveFixture}
      <section className="button-fixture button-fixture-card" aria-label="Effects audit">
        <div className="button-fixture-row">
          <Button variant="contained" data-testid="mui-contained">
            MUI contained
          </Button>
          <Button variant="outlined" data-testid="mui-outlined">
            MUI outlined
          </Button>
          <Button variant="text" data-testid="mui-text">
            MUI text
          </Button>
          <Button variant="outlined" loading={loading} data-testid="mui-busy">
            MUI busy action
          </Button>
          <HbarAppUiButton
            data-testid="busy-button"
            variant="contained"
            loading={loading}
            onClick={() => setClicks((value) => value + 1)}
          >
            Busy action
          </HbarAppUiButton>
          <HbarAppUiButton variant="text" onClick={() => setLoading((value) => !value)}>
            Toggle busy state
          </HbarAppUiButton>
          <HbarAppUiButton variant="text" onClick={() => setGlow((value) => (value === 0 ? 65 : 0))}>
            Toggle glow
          </HbarAppUiButton>
          <HbarAppUiButton variant="text" onClick={() => setMotion((value) => !value)}>
            Toggle motion
          </HbarAppUiButton>
          <output aria-label="Completed actions">{clicks}</output>
        </div>
      </section>
    </LumenProvider>
  )
}

createRoot(root).render(<ButtonEffectsFixture />)
