import { z } from 'zod'
import { CommandError, defineCommand, type CommandRegistry } from '@hbar/commands'
import { idSchema } from '@hbar/contracts'
import type { StateReader } from './state'
import type { NavigationState } from './types'
import type { ComposerPermissionState } from './composer-permission'
import type { ComposerPlanModeState } from './composer-plan-mode'

const input = z.strictObject({
  sessionId: idSchema,
  choice: z.enum(['inherit', 'ask', 'deny', 'allow']),
  expectedPermissionRevision: z.number().int().nonnegative(),
  expectedModeRevision: z.number().int().nonnegative(),
  confirmAllow: z.literal(true).optional(),
})
const output = z.strictObject({ sessionId: idSchema, revision: z.number().int().nonnegative() })

export const composerPlanChoiceCommands = {
  'composerPlanChoice.selectOrdinary': defineCommand(
    {
      id: 'composerPlanChoice.selectOrdinary',
      version: 1,
      owner: 'hbar.app-runtime',
      kind: 'command',
      execution: 'client',
      stateEffect: 'application',
      scope: 'session',
      category: 'run.draft',
      visibility: 'internal',
      titleKey: 'commands.composerPlanChoice.selectOrdinary.title',
      descriptionKey: 'commands.composerPlanChoice.selectOrdinary.description',
      surfaces: ['api'],
    },
    input,
    output,
  ),
}

/** One user choice: confirm leaving durable Plan before changing the session approval setting. */
export function registerComposerPlanChoice(
  local: CommandRegistry,
  navigation: StateReader<NavigationState>,
  planMode: StateReader<ComposerPlanModeState>,
  permission: StateReader<ComposerPermissionState>,
) {
  local.register(composerPlanChoiceCommands['composerPlanChoice.selectOrdinary'], async (request, execution) => {
    if (navigation.getSnapshot().sessionId !== request.sessionId)
      throw new CommandError('STALE_TARGET', 'The selected session changed')
    const mode = planMode.getSnapshot().entries[request.sessionId]
    if (!mode || mode.status !== 'ready' || mode.mode !== 'plan')
      throw new CommandError('COMMAND_CONFLICT', 'The session is not in confirmed Plan mode')
    if (mode.revision !== request.expectedModeRevision)
      throw new CommandError('VERSION_CONFLICT', 'The session mode changed')
    const selected = permission.getSnapshot().entries[request.sessionId]
    if (selected?.revision !== undefined && selected.revision !== request.expectedPermissionRevision)
      throw new CommandError('VERSION_CONFLICT', 'The session approval choice changed')
    if (selected?.locked) throw new CommandError('SUBMISSION_PENDING', 'The original submission owns its approval')
    if (selected && selected.status !== 'idle')
      throw new CommandError('BUSY', 'Confirm the session approval setting before leaving Plan')
    if (request.choice === 'allow' && !request.confirmAllow)
      throw new CommandError('CONFIRMATION_REQUIRED', 'Auto-approval requires explicit confirmation')

    // A lost Host reply remains unknown in composerPlanMode. Never advance the
    // local approval choice until that durable mode has been confirmed default.
    await local.execute(
      'composerPlanMode.setMode',
      { sessionId: request.sessionId, mode: 'default', expectedRevision: request.expectedModeRevision },
      { signal: execution.signal },
    )
    if (navigation.getSnapshot().sessionId !== request.sessionId)
      throw new CommandError('STALE_TARGET', 'The selected session changed during Plan exit')
    const confirmed = planMode.getSnapshot().entries[request.sessionId]
    if (confirmed?.status !== 'ready' || confirmed.mode !== 'default')
      throw new CommandError('RESULT_UNKNOWN', 'Plan exit must be reconciled before choosing approval')
    const choice = await local.execute(
      'composerPermission.setChoice',
      {
        sessionId: request.sessionId,
        choice: request.choice,
        expectedRevision: request.expectedPermissionRevision,
        ...(request.confirmAllow ? { confirmAllow: true } : {}),
      },
      { signal: execution.signal },
    )
    return output.parse(choice)
  })
}
