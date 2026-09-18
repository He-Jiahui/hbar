import type { CompiledKeyedList, KeyedListItem, KeyedListState } from '@hbar/schema-core'
import './schema-form.css'

export type SchemaListIntent =
  | { readonly kind: 'add' }
  | { readonly kind: 'open'; readonly itemId: string }
  | { readonly kind: 'remove'; readonly itemId: string }
  | { readonly kind: 'move'; readonly itemId: string; readonly beforeId: string | null }
  | { readonly kind: 'reset'; readonly itemId?: string }

export interface HbarSchemaListLabels {
  readonly resolve: (key: string) => string
  readonly empty: string
  readonly add: string
  readonly edit: (item: KeyedListItem, index: number) => string
  readonly remove: (item: KeyedListItem, index: number) => string
  readonly moveUp: (item: KeyedListItem, index: number) => string
  readonly moveDown: (item: KeyedListItem, index: number) => string
  readonly reset: (item: KeyedListItem, index: number) => string
  readonly itemLabel: (item: KeyedListItem, index: number) => string
}

export interface HbarSchemaListProps {
  readonly schema: CompiledKeyedList
  readonly state: KeyedListState
  readonly labels: HbarSchemaListLabels
  readonly disabled?: boolean
  readonly onIntent: (intent: SchemaListIntent) => void
}

export function HbarSchemaList({ schema, state, labels, disabled = false, onIntent }: HbarSchemaListProps) {
  const dirty = new Set([...state.dirtyItems, ...state.removedItems])
  return (
    <section className="hbar-schema-list" aria-label={labels.resolve(schema.labelKey)}>
      <header>
        <h2>{labels.resolve(schema.labelKey)}</h2>
        <button
          type="button"
          disabled={disabled || state.draft.length >= schema.maxItems}
          onClick={() => onIntent({ kind: 'add' })}
        >
          {labels.add}
        </button>
      </header>
      {state.draft.length === 0 ? (
        <p>{labels.empty}</p>
      ) : (
        <ol>
          {state.draft.map((item, index) => {
            const itemId = String(item[schema.keyField])
            return (
              <li key={itemId} data-item-id={itemId} data-dirty={dirty.has(itemId) || undefined}>
                <button
                  type="button"
                  aria-label={labels.edit(item, index)}
                  disabled={disabled}
                  onClick={() => onIntent({ kind: 'open', itemId })}
                >
                  {labels.itemLabel(item, index)}
                </button>
                <span className="hbar-schema-list-actions">
                  <button
                    type="button"
                    aria-label={labels.moveUp(item, index)}
                    disabled={disabled || index === 0}
                    onClick={() => onIntent({ kind: 'move', itemId, beforeId: state.order[index - 1] ?? null })}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={labels.moveDown(item, index)}
                    disabled={disabled || index === state.draft.length - 1}
                    onClick={() => onIntent({ kind: 'move', itemId, beforeId: state.order[index + 2] ?? null })}
                  >
                    ↓
                  </button>
                  {dirty.has(itemId) && (
                    <button type="button" disabled={disabled} onClick={() => onIntent({ kind: 'reset', itemId })}>
                      {labels.reset(item, index)}
                    </button>
                  )}
                  <button type="button" disabled={disabled} onClick={() => onIntent({ kind: 'remove', itemId })}>
                    {labels.remove(item, index)}
                  </button>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
