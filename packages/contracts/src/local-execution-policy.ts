import { HbarError } from './errors'

/** Trusted Host composition input for services that can touch the Host filesystem or process tree. */
export interface LocalExecutionPolicy {
  readonly enabled: boolean
}

export const LOCAL_EXECUTION_ENABLED: LocalExecutionPolicy = Object.freeze({ enabled: true })
export const LOCAL_EXECUTION_DISABLED: LocalExecutionPolicy = Object.freeze({ enabled: false })

export function createLocalExecutionPolicy(noLocalExec = false): LocalExecutionPolicy {
  return noLocalExec ? LOCAL_EXECUTION_DISABLED : LOCAL_EXECUTION_ENABLED
}

export function assertLocalExecutionAllowed(
  policy: LocalExecutionPolicy = LOCAL_EXECUTION_ENABLED,
  operation = 'Local workspace execution',
): void {
  if (!policy.enabled)
    throw new HbarError('LOCAL_EXECUTION_DISABLED', `${operation} is disabled by the Host runtime configuration`)
}
