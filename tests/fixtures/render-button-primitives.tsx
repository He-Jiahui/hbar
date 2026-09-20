import { renderToStaticMarkup } from 'react-dom/server'
import { Check, Play, Settings, Trash2 } from 'lucide-react'
import { HbarAppUiIcon } from '../../packages/hbar-app-ui/src/icon'
import { HbarAppUiButton, HbarAppUiIconButton } from '../../packages/hbar-app-ui/src/primitives'

const markup = renderToStaticMarkup(
  <main className="button-fixture" aria-labelledby="button-fixture-title">
    <header className="button-fixture-header">
      <p>hbar-app-ui / primitives</p>
      <h1 id="button-fixture-title" tabIndex={-1}>
        Button system
      </h1>
      <span>Semantic sizes, tones, states, localized copy, and icon controls.</span>
    </header>

    <section className="button-fixture-card" aria-labelledby="button-sizes-title">
      <div className="button-fixture-section-heading">
        <h2 id="button-sizes-title">Control hierarchy</h2>
        <span>S / M / L · 32 / 36 / 44 minimum hit areas</span>
      </div>
      <div className="button-fixture-row">
        <HbarAppUiButton data-testid="s-button" size="s">
          Small
        </HbarAppUiButton>
        <HbarAppUiButton data-testid="m-button" size="m">
          Medium
        </HbarAppUiButton>
        <HbarAppUiButton data-testid="default-button">Global default</HbarAppUiButton>
        <HbarAppUiButton data-testid="l-button" size="l" tone="accent">
          <HbarAppUiIcon icon={Play} tier="md" />
          Start run
        </HbarAppUiButton>
      </div>
    </section>

    <section className="button-fixture-card" aria-labelledby="button-tones-title">
      <div className="button-fixture-section-heading">
        <h2 id="button-tones-title">Semantic tones</h2>
        <span>Meaning survives hover and selection</span>
      </div>
      <div className="button-fixture-row">
        <HbarAppUiButton data-testid="focus-button" variant="solid">
          Neutral solid
        </HbarAppUiButton>
        <HbarAppUiButton tone="accent" variant="solid">
          Accent solid
        </HbarAppUiButton>
        <HbarAppUiButton tone="positive" variant="outline">
          <HbarAppUiIcon icon={Check} tier="sm" />
          Complete
        </HbarAppUiButton>
        <HbarAppUiButton tone="warning" variant="outline">
          Warning outline
        </HbarAppUiButton>
        <HbarAppUiButton tone="danger" variant="ghost">
          Danger ghost
        </HbarAppUiButton>
      </div>
    </section>

    <section className="button-fixture-card" aria-labelledby="button-states-title">
      <div className="button-fixture-section-heading">
        <h2 id="button-states-title">Interaction states</h2>
        <span>Selected, unavailable, and localized content</span>
      </div>
      <div className="button-fixture-row">
        <HbarAppUiButton aria-pressed="true">Selected session</HbarAppUiButton>
        <HbarAppUiButton tone="accent" disabled>
          Run unavailable
        </HbarAppUiButton>
        <HbarAppUiButton data-testid="long-button" className="button-fixture-long-label">
          应用并重新加载当前工作区中的所有模型设置
        </HbarAppUiButton>
      </div>
    </section>

    <section className="button-fixture-card" aria-labelledby="icon-buttons-title">
      <div className="button-fixture-section-heading">
        <h2 id="icon-buttons-title">Icon controls</h2>
        <span>Drawing tier stays separate from the hit area</span>
      </div>
      <div className="button-fixture-row">
        <HbarAppUiIconButton data-testid="s-icon-button" label="Open settings" size="s">
          <HbarAppUiIcon icon={Settings} tier="sm" />
        </HbarAppUiIconButton>
        <HbarAppUiIconButton data-testid="m-icon-button" label="Delete session" size="m" tone="danger">
          <HbarAppUiIcon icon={Trash2} tier="md" />
        </HbarAppUiIconButton>
        <HbarAppUiIconButton data-testid="l-icon-button" label="Confirm selection" size="l" tone="positive">
          <HbarAppUiIcon icon={Check} tier="lg" />
        </HbarAppUiIconButton>
      </div>
    </section>
  </main>,
)

process.stdout.write(markup)
