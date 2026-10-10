import { useEffect, useId, useState } from 'react'
import { LumenFrame, LumenText, LumenButton, LumenFormField, LumenIcon } from '@lumen/app-ui'
import { Plus, Trash2 } from 'lucide-react'
import type { ProviderEditorState } from '@hbar/app-runtime'
import type { z } from 'zod'
import type { providerContextFieldSchema } from '@hbar/contracts/commands/configuration'
import { HbarLumenDisclosure } from './lumen-disclosure'
import { HbarProviderContextNumber } from './provider-context-number'

type Field = z.output<typeof providerContextFieldSchema>
export interface HbarProviderContextRulesLabels {
  readonly title: string
  readonly description: string
  readonly standard: string
  readonly empty: string
  readonly add: string
  readonly tier: (index: number, window: number) => string
  readonly remove: (index: number) => string
  readonly field: (key: Field['labelKey']) => string
  readonly invalid: (code: string) => string
  readonly required: string
}
export type HbarProviderContextIntent =
  | { readonly kind: 'add-context-tier'; readonly modelId: string }
  | { readonly kind: 'remove-context-tier'; readonly modelId: string; readonly tierId: string }
  | {
      readonly kind: 'set-context-field'
      readonly modelId: string
      readonly tierId?: string
      readonly field: Field['name']
      readonly value: number | null
    }

/** At most eight tiers; content grows inside the provider page's existing scroll region. */
export function HbarProviderContextRules({
  editor,
  labels,
  disabled,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly labels: HbarProviderContextRulesLabels
  readonly disabled: boolean
  readonly onIntent: (intent: HbarProviderContextIntent) => void
}) {
  const prefix = useId()
  const [expanded, setExpanded] = useState(false)
  const description = editor.description.contextPricing
  const modelIndex = editor.draft.models.findIndex((item) => item.id === editor.selectedModelId)
  const model = editor.draft.models[modelIndex]
  const tiers = model?.contextTiers ?? []
  const issues = editor.draftIssues.filter(
    (issue) =>
      issue.path.startsWith(`models.${modelIndex}.`) &&
      (issue.path.includes('.contextTiers') ||
        [
          'contextWindow',
          'inputPrice',
          'outputPrice',
          'cacheReadPrice',
          'cacheWritePrice',
          'maxModePricingMultiplier',
        ].includes(issue.path.split('.').at(-1) ?? '')),
  )
  useEffect(() => {
    if (issues.length > 0) setExpanded(true)
  }, [issues.length])
  if (!model || !description) return null
  const fields = (descriptors: readonly Field[], tierIndex?: number) => {
    const tier = tierIndex === undefined ? undefined : tiers[tierIndex]
    const values = tier ?? model
    return descriptors
      .toSorted((a, b) => a.order - b.order)
      .map((field) => {
        const id = `${prefix}-${tier?.id ?? 'standard'}-${field.name}`
        const path = `models.${modelIndex}.${tier ? `contextTiers.${tierIndex}.` : ''}${field.name}`
        const issue = issues.find((item) => item.path === path)
        const value =
          field.name === 'inputTokensAbove'
            ? tier?.inputTokensAbove
            : field.name === 'maxModePricingMultiplier'
              ? model.maxModePricingMultiplier
              : values[field.name]
        return (
          <LumenFormField
            key={field.name}
            controlId={id}
            label={labels.field(field.labelKey)}
            required={field.required}
            requiredIndicator={labels.required}
            {...(issue ? { error: labels.invalid(issue.code) } : {})}
          >
            <HbarProviderContextNumber
              id={id}
              field={field.name}
              tier={tier?.id ?? 'standard'}
              value={value}
              required={field.required}
              integer={field.type === 'integer'}
              minimum={field.minimum}
              maximum={field.maximum}
              disabled={disabled}
              onCommit={(next) =>
                onIntent({
                  kind: 'set-context-field',
                  modelId: model.id,
                  ...(tier ? { tierId: tier.id } : {}),
                  field: field.name,
                  value: next,
                })
              }
            />
          </LumenFormField>
        )
      })
  }
  return (
    <HbarLumenDisclosure
      label={labels.title}
      className="hbar-provider-context-rules"
      open={expanded || issues.length > 0}
      onOpenChange={setExpanded}
    >
      <LumenText as="p" className="hbar-provider-context-description">
        {labels.description}
      </LumenText>
      <LumenText as="h3">{labels.standard}</LumenText>
      <LumenFrame className="hbar-provider-context-fields">{fields(description.fields)}</LumenFrame>
      {tiers.length === 0 && (
        <LumenText as="p" className="hbar-provider-context-description">
          {labels.empty}
        </LumenText>
      )}
      {tiers.map((tier, index) => (
        <LumenFrame key={tier.id} as="section" className="hbar-provider-context-tier">
          <LumenFrame as="header" className="hbar-provider-context-tier-heading">
            <LumenText as="h3">{labels.tier(index + 1, tier.contextWindow)}</LumenText>
            <LumenButton
              type="button"
              variant="text"
              indicator="none"
              size="s"
              disabled={disabled}
              aria-label={labels.remove(index + 1)}
              onClick={() => onIntent({ kind: 'remove-context-tier', modelId: model.id, tierId: tier.id })}
            >
              <LumenIcon icon={Trash2} tier="sm" />
            </LumenButton>
          </LumenFrame>
          <LumenFrame className="hbar-provider-context-fields">{fields(description.tierFields, index)}</LumenFrame>
        </LumenFrame>
      ))}
      {issues.some((issue) => /\.contextTiers(?:\.\d+)?$/.test(issue.path)) && (
        <LumenText as="p" role="alert">
          {labels.invalid('custom')}
        </LumenText>
      )}
      <LumenButton
        type="button"
        size="s"
        disabled={
          disabled ||
          tiers.length >= description.maxTiers ||
          (tiers.at(-1)?.contextWindow ?? model.contextWindow) >= 10_000_000
        }
        onClick={() => onIntent({ kind: 'add-context-tier', modelId: model.id })}
      >
        <LumenIcon icon={Plus} tier="sm" />
        {labels.add}
      </LumenButton>
    </HbarLumenDisclosure>
  )
}
