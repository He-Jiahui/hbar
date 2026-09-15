# Localized content and list design reference

## Typed host label bundles

The component exposes a surface-specific contract; the host resolves it from
its own locale catalog.

```ts
export interface QueueLabels {
  readonly title: string
  readonly emptyTitle: string
  readonly emptyDescription: string
  readonly retryLabel: string
  readonly countLabel: (count: number) => string
  readonly statusLabel: (status: QueueStatus) => string
}

export interface QueueItem {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly status: QueueStatus
}

export interface QueueProps {
  readonly labels: QueueLabels
  readonly items: readonly QueueItem[]
  readonly activeId?: string
  readonly onRetry: (id: string) => void
}
```

The host can create `QueueLabels` from `useLocale()`/`t` without leaking that
hook into the reusable package. Item values may be already localized domain
values, or may carry semantic status enums that the host formats with
`statusLabel`.

## Overflow decision record

Keep the decision beside the feature contract or its test:

| Expected data | Rendering model | Test evidence |
| --- | --- | --- |
| 0-12 short choices | Content-grown or a normal menu | Long labels wrap; no clipped choices |
| Bounded workbench activity pane | Pane-owned scroll region | List `scrollHeight > clientHeight` with enough fixture rows; header/actions remain visible |
| Cursor-backed history or live stream | Pagination or virtualization | Row DOM stays bounded and focus/navigation remain correct when data exceeds one page/window |

The numbers are examples, not universal CSS thresholds. Use service/domain
evidence to choose an actual bound and record it in the feature contract.

## Safe selected-item handling

Never assume a list has a first element or that an old ID still exists:

```ts
const active = items.find((item) => item.id === activeId)
const fallback = active ?? items[0]
```

When the intended behavior is no automatic replacement, render the typed empty
or selection-required state instead. Tests must cover the chosen policy after
items are removed or the active ID is stale.

## Review checklist

- Does every rendered label come from `labels`, data, or a host formatter?
- Are translated labels absent from Zustand/domain state?
- Can a host edit/replace all displayed rows and document content through props?
- Is sample content confined to tests or an explicit preview fixture adapter?
- Is the empty/stale/over-bound path intentional and tested?
- Does the list grow, scroll, page, or virtualize for a documented reason?
- Can a longer localized string wrap without changing layout coordinates?
