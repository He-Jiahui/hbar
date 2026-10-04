import type { ModelRequest } from './index'

/** Keep a complete legacy system string while marking the start of per-request Host facts. */
export function appendModelContext(request: ModelRequest, context: string): ModelRequest {
  if (!context) return request
  return {
    ...request,
    system: `${request.system}\n\n${context}`,
    systemContextOffset: request.systemContextOffset ?? request.system.length,
  }
}

/** Stable tool instructions precede changing facts without duplicating either in the journal. */
export function prependModelInstructions(request: ModelRequest, instructions: string): ModelRequest {
  if (!instructions) return request
  return {
    ...request,
    system: `${instructions}\n\n${request.system}`,
    ...(request.systemContextOffset === undefined
      ? {}
      : { systemContextOffset: request.systemContextOffset + instructions.length + 2 }),
  }
}
