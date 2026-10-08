import { createRoot, type Root } from 'react-dom/client'
import { createStore } from 'zustand/vanilla'
import { DEFAULT_LUMEN_APPEARANCE, LumenFrame, LumenProvider } from '@lumen/app-ui'
import { createUsageBudget, createUsageRequests } from '@hbar/app-runtime'
import { HbarUsageBudget, HbarUsageRequests } from '@hbar/app-react'
import { CommandError } from '@hbar/commands'
import {
  budgetReceiptSchema,
  budgetCommands,
  setBudgetInputSchema,
  type BudgetReceipt,
} from '@hbar/contracts/commands/budget'
import { usageExportInputSchema } from '@hbar/contracts/commands/usage'
import { originalBudgetSessionId, usageFeedbackAttempt, usageFeedbackLabels } from './usage-feedback-data'
import '@lumen/app-ui/styles.css'

export interface UsageFeedbackInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly count: number
}
interface Scenario {
  readonly count: number
  readonly queryError: boolean
  readonly openError: boolean
  readonly write: 'success' | 'failure' | 'unknown'
  readonly duplicate: boolean
}
function createFixture(input: UsageFeedbackInput) {
  const scenario = createStore<Scenario>(() => ({
    count: input.count,
    queryError: false,
    openError: true,
    write: 'failure',
    duplicate: false,
  }))
  const target = createStore<{ sessionId: string } | null>(() => ({ sessionId: originalBudgetSessionId }))
  const receipts = new Map<string, BudgetReceipt>()
  const budgets = new Map<string, BudgetReceipt['budget']>()
  const writes: { readonly sessionId: string; readonly tokens: number; readonly key: string }[] = []
  const opened: {
    readonly usageId: string
    readonly sessionId: string
    readonly workspaceId: string
    readonly runId: string | null
  }[] = []
  let queryCount = 0
  let receiptReads = 0
  const requests = createUsageRequests({
    usage: {
      execute: async (_id, raw) => {
        queryCount++
        const config = scenario.getState()
        if (config.queryError) throw new CommandError('DISCONNECTED', 'Owned query failure')
        const query = usageExportInputSchema.parse(raw)
        const all = Array.from({ length: config.count }, (_, index) => usageFeedbackAttempt(index))
        const filtered = query.filters?.source ? all.filter((item) => item.source === query.filters?.source) : all
        const offset = query.after ? Number(query.after) : 0
        const items = filtered.slice(offset, offset + (query.limit ?? 50))
        if (config.duplicate && items.length) items.push(items[0] ?? usageFeedbackAttempt(0))
        return {
          accountingVersion: 1,
          scope: query.scope,
          observedAt: 2000,
          gap: false,
          items,
          ...(offset + 50 < filtered.length ? { nextCursor: String(offset + 50) } : {}),
        }
      },
    },
  })
  const budget = createUsageBudget({
    target: { getSnapshot: target.getState, subscribe: (listener) => target.subscribe(listener) },
    commands: {
      execute: async (id, raw, options) => {
        if (id === 'session.getBudget') {
          const parsed = budgetCommands['session.getBudget'].input.parse(raw)
          return budgets.get(parsed.sessionId) ?? null
        }
        const parsed = setBudgetInputSchema.parse(raw)
        const key = options?.idempotencyKey
        if (!key) throw new Error('Missing original idempotency key')
        writes.push({ sessionId: parsed.sessionId, tokens: parsed.tokens, key })
        if (scenario.getState().write === 'failure') throw new CommandError('COMMAND_CONFLICT', 'Owned write failure')
        const current = budgets.get(parsed.sessionId)
        const revision = (current?.revision ?? 0) + 1
        const receipt = budgetReceiptSchema.parse({
          status: 'succeeded',
          commandId: 'session.setBudget',
          commandVersion: 1,
          requestId: 'original-request',
          idempotencyKey: key,
          eventId: `event-${writes.length}`,
          revision,
          committedAt: 2,
          accountingVersion: 1,
          budget: {
            sessionId: parsed.sessionId,
            budgetId: 'original-budget',
            limit: parsed.tokens,
            phase: 'active',
            usedTokens: 0,
            remainingTokens: parsed.tokens,
            revision,
            createdAt: 1,
            updatedAt: 2,
          },
        })
        budgets.set(parsed.sessionId, receipt.budget)
        receipts.set(key, receipt)
        if (scenario.getState().write === 'unknown')
          throw new CommandError('RESULT_UNKNOWN', 'Owned lost acknowledgment')
        return receipt
      },
    },
    getReceipt: async (sessionId, key) => {
      receiptReads++
      const receipt = receipts.get(key)
      return receipt?.budget.sessionId === sessionId ? receipt : null
    },
  })
  return {
    input,
    scenario,
    target,
    requests,
    budget,
    writes,
    opened,
    get queryCount() {
      return queryCount
    },
    get receiptReads() {
      return receiptReads
    },
  }
}
type FixtureOwner = ReturnType<typeof createFixture>
let root: Root | undefined
let owner: FixtureOwner | undefined
declare global {
  interface Window {
    mountUsageFeedback(input: UsageFeedbackInput): Promise<void>
    updateUsageFeedback(patch: Partial<Scenario>): Promise<void>
    configureUsageFeedback(patch: Partial<Scenario>): void
    switchUsageFeedbackBudgetTarget(sessionId: string): void
    usageFeedbackDebug(): {
      readonly count: number
      readonly hasMore: boolean
      readonly queries: number
      readonly receiptReads: number
      readonly writes: FixtureOwner['writes']
      readonly opened: FixtureOwner['opened']
    }
  }
}
function Fixture({ owner }: { readonly owner: FixtureOwner }) {
  const labels = usageFeedbackLabels(owner.input.locale)
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: owner.input.mode, textSize: 'l', motion: false }}>
      <LumenFrame
        as="main"
        aria-label={labels.requests.title}
        style={{
          minInlineSize: 0,
          maxInlineSize: '100%',
          blockSize: 'calc(100dvh / 1.25)',
          overflowY: 'auto',
          zoom: 1.25,
        }}
      >
        <HbarUsageRequests
          managed
          runtime={owner.requests}
          labels={labels.requests}
          onOpenRequest={(target) => {
            owner.opened.push(target)
            if (owner.scenario.getState().openError)
              return Promise.reject(new CommandError('EXECUTION_FAILED', 'Owned navigation failure'))
            return Promise.resolve()
          }}
        />
        <HbarUsageBudget runtime={owner.budget} labels={labels.budget} />
      </LumenFrame>
    </LumenProvider>
  )
}
window.mountUsageFeedback = async (input) => {
  root?.unmount()
  owner?.requests.dispose()
  owner?.budget.dispose()
  owner = createFixture(input)
  await Promise.all([owner.requests.refresh(), owner.budget.refresh()])
  root = createRoot(document.getElementById('root') ?? document.body)
  root.render(<Fixture owner={owner} />)
}
window.updateUsageFeedback = async (patch) => {
  if (!owner) throw new Error('Missing owned usage fixture')
  owner.scenario.setState(patch)
  await owner.requests.refresh()
}
window.configureUsageFeedback = (patch) => owner?.scenario.setState(patch)
window.switchUsageFeedbackBudgetTarget = (sessionId) => owner?.target.setState({ sessionId })
window.usageFeedbackDebug = () => {
  if (!owner) throw new Error('Missing owned usage fixture')
  return {
    count: owner.requests.reader.getSnapshot().items.length,
    hasMore: owner.requests.reader.getSnapshot().hasMore,
    queries: owner.queryCount,
    receiptReads: owner.receiptReads,
    writes: owner.writes,
    opened: owner.opened,
  }
}
