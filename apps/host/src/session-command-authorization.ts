import { HbarError, type Device } from '@hbar/contracts'
import { executionPrincipalSchema, type ExecutionPrincipal } from '@hbar/contracts/execution-principal'
import { invocationSchema, type CommandDescriptor, type CommandInvocation } from '@hbar/commands'
import type { StoragePort } from '@hbar/storage'
import { DeviceAuthorization } from './device-authorization'

export interface SessionCommandPrincipal {
  readonly principal: ExecutionPrincipal
  readonly device: Device
}

/** Re-read the canonical source and current device on every admission/execution; no model-supplied actor or token. */
export class SessionCommandAuthorization {
  constructor(private readonly storage: StoragePort) {}
  async source(sessionId: string, runId: string): Promise<SessionCommandPrincipal> {
    const run = await this.storage.call('run', runId)
    if (run.sessionId !== sessionId)
      throw new HbarError('EXECUTION_PRINCIPAL_SOURCE', 'The source Run belongs to another session')
    const saved = await this.storage.call('runExecutionPrincipal', runId)
    if (!saved)
      throw new HbarError(
        'COMMAND_PRINCIPAL_REQUIRED',
        'This Run needs an authenticated user submission before it can execute hbar commands',
      )
    const principal = executionPrincipalSchema.parse(saved)
    const device = await this.storage.call('deviceById', principal.actorId)
    if (!device)
      throw new HbarError('COMMAND_PRINCIPAL_REVOKED', 'The device that authorized this Run is no longer paired')
    await new DeviceAuthorization(this.storage, () => undefined).assertSession(device, sessionId)
    return { principal, device }
  }
  async authorize(
    sessionId: string,
    runId: string,
    descriptor: CommandDescriptor,
    value: unknown,
  ): Promise<SessionCommandPrincipal> {
    const invocation: CommandInvocation = invocationSchema.parse(value)
    if (invocation.commandId !== descriptor.metadata.id || invocation.commandVersion !== descriptor.metadata.version)
      throw new HbarError(
        'COMMAND_DESCRIPTOR_MISMATCH',
        'Command authorization requires the prepared command definition',
      )
    const source = await this.source(sessionId, runId)
    const authorization = new DeviceAuthorization(this.storage, (id) =>
      id === invocation.commandId ? descriptor : undefined,
    )
    await authorization.authorize(source.device, 'command.execute', invocation)
    return source
  }
  async projectResult(
    sessionId: string,
    runId: string,
    descriptor: CommandDescriptor,
    invocation: CommandInvocation,
    result: unknown,
  ): Promise<unknown> {
    const source = await this.authorize(sessionId, runId, descriptor, invocation)
    if (invocation.commandId !== 'workspace.list') return result
    return (
      (await new DeviceAuthorization(this.storage, () => descriptor).workspacePage(source.device, invocation.input)) ??
      result
    )
  }
}
