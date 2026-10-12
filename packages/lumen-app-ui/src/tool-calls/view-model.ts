export type LumenToolCallsIntent =
  | { readonly actionId: 'stop' | 'copy-command' }
  | {
      readonly actionId: 'toggle-trace-item' | 'retry-tool-activity' | 'toggle-diff-file' | 'open-search-result'
      readonly itemId: string
    }
  | {
      readonly actionId: 'filter-tool-activity' | 'select-command-output'
      readonly optionId: string
    }
  | {
      readonly actionId: 'permission-request-action'
      readonly groupId: string
      readonly itemId: string
      readonly optionId: string
    }
  | {
      readonly actionId: 'toggle-permission'
      readonly groupId: string
      readonly itemId: string
      readonly enabled: boolean
    }

/** Values and intents belong to the Host. These never imply real tool execution or authorization. */
export interface LumenToolCallsViewModel {
  readonly ownerId: string
  readonly openTraceIds: readonly string[]
  readonly activeFilterId: string | null
  readonly openDiffIds: readonly string[]
  readonly selectedOutputTabId: string | null
  readonly openRequestIds: readonly {
    readonly groupId: string
    readonly itemId: string
  }[]
  readonly permissions: readonly {
    readonly groupId: string
    readonly itemId: string
    readonly enabled: boolean
  }[]
  readonly requestFeedback?:
    | readonly {
        readonly groupId: string
        readonly itemId: string
        readonly message: string
      }[]
    | undefined
  readonly notice?: string | undefined
  readonly onAction?: ((intent: LumenToolCallsIntent) => void) | undefined
}
