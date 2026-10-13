/** A capacity reservation that becomes a Core-visible active process after launch. */
export interface NodeProcessReservation {
  readonly operationId: string
  readonly controller: AbortController
  readonly signal: AbortSignal
  release(): void
  activate(input: {
    readonly controller: AbortController
    readonly finished: Promise<void>
    readonly cancel?: () => Promise<void>
  }): () => void
}
