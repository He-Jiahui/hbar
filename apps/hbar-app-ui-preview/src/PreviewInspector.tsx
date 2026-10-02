import { LumenCollection, LumenCollectionItem, LumenFrame, LumenNavigationButton, LumenText } from '@lumen/app-ui'
import type { HbarAppUiEvent, HbarAppUiRegistryEntry } from 'hbar-app-ui/catalog'
import type { PreviewWorkspaceCopy } from '../../../tests/fixtures/preview-workspace-copy'
import { VariantHarness } from './VariantHarness'

export interface PreviewInspectorProps {
  readonly selected: HbarAppUiRegistryEntry
  readonly entries: readonly HbarAppUiRegistryEntry[]
  readonly eventLog: readonly HbarAppUiEvent[]
  readonly copy: PreviewWorkspaceCopy
  readonly onEntry: (entry: HbarAppUiRegistryEntry) => void
  readonly onAction: (event: HbarAppUiEvent) => void
}
export function PreviewInspector({ selected, entries, eventLog, copy, onEntry, onAction }: PreviewInspectorProps) {
  const variants = entries.filter(({ spec }) => spec.category === selected.spec.category)
  return (
    <LumenFrame as="aside" className="hbar-app-ui-preview-inspector" aria-label={copy.inspector}>
      <LumenFrame className="hbar-app-ui-preview-inspector-section">
        <LumenFrame className="hbar-app-ui-preview-section-heading">
          <LumenText as="strong">{copy.variants}</LumenText>
          <LumenText as="small">{copy.shownCount(variants.length)}</LumenText>
        </LumenFrame>
        <LumenFrame className="hbar-app-ui-preview-variant-list">
          {variants.map((entry) => (
            <LumenNavigationButton
              key={entry.spec.id}
              size="s"
              selected={entry.spec.id === selected.spec.id}
              indicatorEdge="left"
              onClick={() => onEntry(entry)}
            >
              <LumenText as="span">{entry.spec.title}</LumenText>
              <LumenText as="small">{entry.spec.layout}</LumenText>
            </LumenNavigationButton>
          ))}
        </LumenFrame>
      </LumenFrame>
      <VariantHarness spec={selected.spec} onAction={onAction} />
      <LumenFrame className="hbar-app-ui-preview-inspector-section">
        <LumenFrame className="hbar-app-ui-preview-section-heading">
          <LumenText as="strong">{copy.interactionLog}</LumenText>
          <LumenText as="small">{copy.eventCount(eventLog.length)}</LumenText>
        </LumenFrame>
        {eventLog.length ? (
          <LumenCollection as="ol" className="hbar-app-ui-preview-events">
            {eventLog.map((event, index) => (
              <LumenCollectionItem key={`${event.variantId}-${event.actionId}-${index}`}>
                <LumenText as="code">{event.actionId}</LumenText>
                {event.value && <LumenText as="span">{event.value}</LumenText>}
              </LumenCollectionItem>
            ))}
          </LumenCollection>
        ) : (
          <LumenText as="p" className="hbar-app-ui-preview-muted">
            {copy.interactionHint}
          </LumenText>
        )}
      </LumenFrame>
      <LumenFrame className="hbar-app-ui-preview-inspector-section hbar-app-ui-preview-contract">
        <LumenFrame className="hbar-app-ui-preview-section-heading">
          <LumenText as="strong">{copy.contract}</LumenText>
          <LumenText as="small">{selected.spec.density}</LumenText>
        </LumenFrame>
        <LumenCollection as="dl">
          <LumenCollectionItem as="dt">{copy.entry}</LumenCollectionItem>
          <LumenCollectionItem as="dd">
            <LumenText as="code">{selected.spec.entry}</LumenText>
          </LumenCollectionItem>
          <LumenCollectionItem as="dt">{copy.behavior}</LumenCollectionItem>
          <LumenCollectionItem as="dd">{selected.spec.behavior.join(' / ')}</LumenCollectionItem>
          <LumenCollectionItem as="dt">{copy.observation}</LumenCollectionItem>
          <LumenCollectionItem as="dd">{selected.spec.observation.join(' / ')}</LumenCollectionItem>
          <LumenCollectionItem as="dt">{copy.visualChecks}</LumenCollectionItem>
          <LumenCollectionItem as="dd">{selected.spec.visualValidation.join(' / ')}</LumenCollectionItem>
        </LumenCollection>
      </LumenFrame>
    </LumenFrame>
  )
}
