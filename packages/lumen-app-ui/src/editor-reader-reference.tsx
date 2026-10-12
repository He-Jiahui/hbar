'use client'

import * as React from 'react'
import { Focus, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { LumenEditorAction, LumenLongDocumentReaderLabels, LumenReaderSection } from './editor'
import './editor-reader-reference.css'

export interface LumenReaderReferenceSection extends LumenReaderSection {
  readonly headingLevel: 2 | 3
}

export interface LumenReaderReferenceContent {
  readonly documentId: string
  readonly labels: LumenLongDocumentReaderLabels
  readonly workspaceLabel: string
  readonly documentLabel: string
  readonly sections: readonly LumenReaderReferenceSection[]
  readonly selectedSectionId: string | undefined
  readonly focusMode: boolean
  readonly outlineOpen: boolean
  readonly listStrategy: Readonly<{ kind: 'pane-scroll'; expectedMaximum: number }>
  readonly onSelectSection?: ((documentId: string, sectionId: string) => void) | undefined
  readonly onFocusModeChange?: ((documentId: string, enabled: boolean) => void) | undefined
  readonly onOutlineOpenChange?: ((documentId: string, open: boolean) => void) | undefined
}

export function uniqueLumenReaderReferenceSections(
  sections: readonly LumenReaderReferenceSection[],
): readonly LumenReaderReferenceSection[] {
  const seen = new Set<string>()
  return sections.filter((section) => {
    if (seen.has(section.id)) return false
    seen.add(section.id)
    return true
  })
}

export function LumenReaderReference({
  content,
  onAction,
}: {
  readonly content: LumenReaderReferenceContent
  readonly onAction: ((action: LumenEditorAction) => void) | undefined
}): React.ReactElement {
  const sections = uniqueLumenReaderReferenceSections(content.sections)
  const selected = sections.some((section) => section.id === content.selectedSectionId)
    ? content.selectedSectionId
    : sections[0]?.id
  return (
    <>
      <aside className="lumen-reader-reference-outline" data-open={content.outlineOpen}>
        <div className="lumen-reader-reference-outline-inner">
          <div className="lumen-reader-reference-outline-heading">{content.labels.outlineLabel}</div>
          <nav
            aria-label={content.labels.documentOutlineLabel}
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
          >
            {sections.length ? (
              sections.map((section) => (
                <button
                  type="button"
                  key={section.id}
                  className={section.headingLevel === 3 ? 'is-subsection' : ''}
                  aria-current={selected === section.id ? 'true' : undefined}
                  onClick={() => {
                    content.onSelectSection?.(content.documentId, section.id)
                    onAction?.({ actionId: 'section', value: section.id })
                  }}
                >
                  {section.label}
                </button>
              ))
            ) : (
              <p>{content.labels.emptyOutlineLabel}</p>
            )}
          </nav>
          <div className="lumen-reader-reference-outline-footer">
            <span>{content.labels.sectionCountLabel(sections.length)}</span>
          </div>
        </div>
      </aside>
      <div className="lumen-reader-reference-main">
        <header className="lumen-reader-reference-toolbar" role="banner">
          <button
            type="button"
            className="lumen-reader-reference-toggle"
            aria-pressed={content.outlineOpen}
            onClick={() => {
              content.onOutlineOpenChange?.(content.documentId, !content.outlineOpen)
              onAction?.({ actionId: 'outline', value: content.outlineOpen ? 'closed' : 'open' })
            }}
          >
            {content.outlineOpen ? (
              <PanelLeftClose data-icon-tier="sm" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <PanelLeftOpen data-icon-tier="sm" strokeWidth={1.5} aria-hidden="true" />
            )}
            <span className="lumen-reader-reference-visually-hidden">{content.labels.toggleOutlineLabel}</span>
          </button>
          <p className="lumen-reader-reference-breadcrumb">
            <span>{content.workspaceLabel}</span>
            <span className="lumen-reader-reference-separator">{content.labels.breadcrumbSeparator}</span>
            <span className="lumen-reader-reference-document-name">{content.documentLabel}</span>
          </p>
          <button
            type="button"
            className={`lumen-reader-reference-focus ${content.focusMode ? 'is-active' : ''}`}
            aria-pressed={content.focusMode}
            onClick={() => {
              content.onFocusModeChange?.(content.documentId, !content.focusMode)
              onAction?.({ actionId: 'focus', value: content.focusMode ? 'off' : 'on' })
            }}
          >
            <Focus data-icon-tier="sm" strokeWidth={1.5} aria-hidden="true" />
            {content.labels.focusLabel}
          </button>
        </header>
        <div
          className="lumen-reader-reference-content"
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
        >
          <article>
            {sections.map((section) => (
              <section key={section.id} className={content.focusMode && selected !== section.id ? 'is-dimmed' : ''}>
                {section.headingLevel === 2 ? <h2>{section.title}</h2> : <h3>{section.title}</h3>}
                {section.paragraphs.map((paragraph, index) => (
                  <p key={`${section.id}-${index}`}>{paragraph}</p>
                ))}
              </section>
            ))}
          </article>
        </div>
      </div>
    </>
  )
}
