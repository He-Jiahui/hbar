import { HbarError } from '@hbar/contracts'
import { sandboxProfileIdSchema } from '@hbar/contracts/sandbox'
import { encodePath } from '@hbar/schema-core'
import type { SandboxProfileService } from './sandbox-service'
import { SESSION_SANDBOX_PROFILE_SETTING_PATH, type SettingsCandidateValidator } from './settings-service'

const PROFILE_KEY = encodePath(SESSION_SANDBOX_PROFILE_SETTING_PATH)

/** Reject selecting a profile that does not exist when the selection itself changes. */
export function createSandboxSettingsValidator(profiles: SandboxProfileService): SettingsCandidateValidator {
  return async ({ changes, resolution }) => {
    if (!changes.some((change) => encodePath(change.path) === PROFILE_KEY)) return
    const id = sandboxProfileIdSchema.safeParse(resolution.reports[PROFILE_KEY]?.effectiveValue)
    if (!id.success) throw new HbarError('INVALID_SETTING', 'Choose a valid sandbox profile')
    if (!(await profiles.get(id.data)))
      throw new HbarError('SANDBOX_PROFILE_NOT_FOUND', `Sandbox profile ${id.data} does not exist`)
  }
}
