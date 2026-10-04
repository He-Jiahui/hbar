import {
  toolPresentationDeclarationSchema,
  type ContentBlock,
  type Message,
  type ToolCallPresentation,
} from '@hbar/contracts'
import type { ToolRegistry } from '@hbar/plugin-sdk'

/** Capture actual scoped registrations, not mutable declarations supplied by selection/driver hooks. */
export function captureToolPresentations(
  selectedNames: ReadonlySet<string>,
  registry: Pick<ToolRegistry, 'get'>,
): ReadonlyMap<string, Readonly<ToolCallPresentation>> {
  const captured = new Map<string, Readonly<ToolCallPresentation>>()
  for (const name of selectedNames) {
    const parsed = toolPresentationDeclarationSchema.safeParse(registry.get(name)?.presentation)
    if (parsed.success) captured.set(name, Object.freeze({ ...parsed.data, version: 1 }))
  }
  return captured
}

/** Preserve the requested args exactly. Only assistant calls acquire Host-captured display metadata. */
export function enrichToolCallPresentations(
  role: Message['role'],
  blocks: readonly ContentBlock[],
  captured: ReadonlyMap<string, Readonly<ToolCallPresentation>>,
): ContentBlock[] {
  return blocks.map((block) => {
    if (block.type !== 'tool_call') return block
    const presentation = role === 'assistant' ? captured.get(block.name) : undefined
    return {
      type: 'tool_call',
      callId: block.callId,
      name: block.name,
      args: block.args,
      ...(presentation ? { presentation } : {}),
    }
  })
}
