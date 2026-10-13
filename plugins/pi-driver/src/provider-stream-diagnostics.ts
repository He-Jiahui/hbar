export type ProviderStreamSubtype =
  'completed' | 'incomplete' | 'provider_error' | 'transport_error' | 'eof' | 'aborted' | 'unknown'
export type ProviderStreamErrorClass =
  'authentication' | 'rate_limit' | 'context_capacity' | 'invalid_request' | 'upstream' | 'unknown'

export interface ProviderStreamFacts {
  readonly streamSubtype: ProviderStreamSubtype
  readonly streamEventCount: number
  readonly streamTextChars: number
  readonly streamThinkingChars: number
  readonly streamFirstEventMs?: number
  readonly streamLastEventMs?: number
  readonly streamErrorClass?: ProviderStreamErrorClass
}

const MAX_COUNT = 1_000_000
const MAX_CHARS = 2_147_483_647
const knownTerminalTypes = /* @__PURE__ */ new Set([
  'response.completed',
  'response.incomplete',
  'response.failed',
  'error',
])

function safeGet(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined
  try {
    return Reflect.get(value, key) as unknown
  } catch {
    return undefined
  }
}

function boundedAdd(current: number, amount: number): number {
  return Math.min(MAX_CHARS, current + Math.max(0, Math.trunc(amount)))
}

export function classifyProviderStreamErrorCode(value: unknown): ProviderStreamErrorClass {
  if (value === 'invalid_api_key' || value === 'authentication_error') return 'authentication'
  if (value === 'rate_limit_exceeded') return 'rate_limit'
  if (value === 'context_length_exceeded') return 'context_capacity'
  if (value === 'invalid_request_error') return 'invalid_request'
  if (value === 'server_error' || value === 'upstream_error') return 'upstream'
  return 'unknown'
}

export class ProviderStreamObservation {
  private readonly startedAt = performance.now()
  private count = 0
  private textChars = 0
  private thinkingChars = 0
  private firstEventMs: number | undefined
  private lastEventMs: number | undefined
  private observedTerminal: ProviderStreamSubtype | undefined
  private errorClass: ProviderStreamErrorClass | undefined
  private reachedEof = false

  markEof(): void {
    this.reachedEof = true
    if (!this.observedTerminal) this.observedTerminal = 'eof'
  }

  markProviderError(errorCode?: unknown): void {
    this.observedTerminal = 'provider_error'
    const classified = classifyProviderStreamErrorCode(errorCode)
    if (this.errorClass === undefined || classified !== 'unknown') this.errorClass = classified
  }

  observe(value: unknown): void {
    const now = Math.max(0, performance.now() - this.startedAt)
    this.count = Math.min(MAX_COUNT, this.count + 1)
    this.firstEventMs ??= now
    this.lastEventMs = now
    const type = safeGet(value, 'type')
    let providerError = false
    if (typeof type === 'string' && knownTerminalTypes.has(type)) {
      this.observedTerminal =
        type === 'response.completed' ? 'completed' : type === 'response.incomplete' ? 'incomplete' : 'provider_error'
      providerError = this.observedTerminal === 'provider_error'
    } else if (safeGet(value, 'error') && typeof safeGet(value, 'error') === 'object') {
      providerError = true
    }
    if (providerError) {
      const error = safeGet(value, 'error') ?? safeGet(safeGet(value, 'response'), 'error')
      this.markProviderError(safeGet(error, 'code') ?? safeGet(value, 'code'))
    }

    const delta = safeGet(value, 'delta')
    if (type === 'response.output_text.delta' && typeof delta === 'string')
      this.textChars = boundedAdd(this.textChars, delta.length)
    if (
      (type === 'response.reasoning_summary_text.delta' || type === 'response.reasoning_text.delta') &&
      typeof delta === 'string'
    )
      this.thinkingChars = boundedAdd(this.thinkingChars, delta.length)
    const choices = safeGet(value, 'choices')
    if (Array.isArray(choices)) {
      const choice = choices[0] as unknown
      const finishReason = safeGet(choice, 'finish_reason')
      if (finishReason === 'stop' || finishReason === 'tool_calls') this.observedTerminal = 'completed'
      else if (finishReason === 'length' || finishReason === 'content_filter') this.observedTerminal = 'incomplete'
      const choiceDelta = safeGet(choice, 'delta')
      const content = safeGet(choiceDelta, 'content')
      const reasoning = safeGet(choiceDelta, 'reasoning_content')
      if (typeof content === 'string') this.textChars = boundedAdd(this.textChars, content.length)
      if (typeof reasoning === 'string') this.thinkingChars = boundedAdd(this.thinkingChars, reasoning.length)
    }
  }

  facts(terminal: ProviderStreamSubtype): ProviderStreamFacts {
    return {
      streamSubtype: this.observedTerminal ?? (this.reachedEof ? 'eof' : terminal),
      streamEventCount: this.count,
      streamTextChars: this.textChars,
      streamThinkingChars: this.thinkingChars,
      ...(this.firstEventMs === undefined ? {} : { streamFirstEventMs: this.firstEventMs }),
      ...(this.lastEventMs === undefined ? {} : { streamLastEventMs: this.lastEventMs }),
      ...(this.errorClass === undefined ? {} : { streamErrorClass: this.errorClass }),
    }
  }
}
