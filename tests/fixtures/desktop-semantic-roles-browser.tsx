import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { LumenContentText, LumenFrame } from '@lumen/app-ui/ui'
import { LumenPageHeader, LumenToolPane } from '@lumen/app-ui'
import '@lumen/app-ui/styles.css'
import { applyLumenAppearance, DEFAULT_LUMEN_APPEARANCE, type LumenMode } from '@lumen/app-ui/appearance'

interface SemanticRolesFixtureCopy {
  readonly title: string
  readonly description: string
  readonly author: string
  readonly emphasis: string
  readonly isolated: string
  readonly time: string
  readonly path: string
}

interface SemanticRolesFixtureInput {
  readonly copy: SemanticRolesFixtureCopy
  readonly source: string
  readonly mode: LumenMode
}

declare global {
  interface Window {
    renderSemanticRolesFixture: (input: SemanticRolesFixtureInput) => void
    releaseSemanticRolesFixture: () => void
  }
}

function SemanticRolesFixture({ copy, source }: SemanticRolesFixtureInput) {
  return (
    <LumenFrame as="main" className="fixture">
      <LumenFrame>
        <LumenContentText context="section.title" level={3} data-title data-primary-title>
          {copy.title}
        </LumenContentText>
      </LumenFrame>
      {(
        [
          'workspace.title',
          'navigation.title',
          'tool.title',
          'collection.title',
          'dialog.title',
          'popover.title',
          'choice.title',
          'empty.title',
        ] as const
      ).map((context) => (
        <LumenContentText key={context} context={context} data-title>
          {copy.title}
        </LumenContentText>
      ))}
      <LumenPageHeader title={copy.title} context={copy.description} />
      <LumenToolPane title={copy.title} description={copy.description}>
        <LumenContentText context="reading.paragraph">{copy.description}</LumenContentText>
      </LumenToolPane>
      <LumenContentText context="section.description" data-description>
        {copy.description}
      </LumenContentText>
      <LumenContentText context="dialog.body" data-sentence>
        {copy.author}
        <LumenContentText context="inline.emphasis">{copy.emphasis}</LumenContentText>
        <LumenContentText context="inline.isolated">{copy.isolated}</LumenContentText>
        {copy.description}
      </LumenContentText>
      <LumenContentText context="metadata.time" dateTime="2026-10-06T05:24:00Z">
        {copy.time}
      </LumenContentText>
      <LumenFrame className="caption-rail" tabIndex={0} aria-label={copy.path} data-path-rail>
        <LumenContentText context="resource.path">{copy.path}</LumenContentText>
      </LumenFrame>
      <LumenContentText context="code.block" tabIndex={0}>
        {source}
      </LumenContentText>
    </LumenFrame>
  )
}

const element = document.getElementById('semantic-roles-fixture')
if (!element) throw new Error('Missing semantic role fixture root')
const root = createRoot(element)
window.renderSemanticRolesFixture = (input) => {
  applyLumenAppearance(document.documentElement, { ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode })
  flushSync(() => root.render(<SemanticRolesFixture {...input} />))
}
window.releaseSemanticRolesFixture = () => root.unmount()
