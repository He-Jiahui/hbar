import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { HbarError, type UserInput } from '@hbar/contracts'
import { BACKEND_UNATTENDED_VALUE_KEY } from '@hbar/contracts/backend'

/** Called inside enqueue after accepted-request reconciliation, before any new Run writes. */
export function createBackendContinuationAdmission(db: Database): (input: UserInput) => void {
  const layer = db.query<{ valuesJson: string }, []>(
    "SELECT valuesJson FROM settings_layers WHERE id='settings:global'",
  )
  return (input) => {
    if (input.source !== 'goal' && input.continuation === undefined) return
    const row = layer.get()
    if (!row) return
    const values = z.record(z.string(), z.unknown()).parse(JSON.parse(row.valuesJson) as unknown)
    if (Object.hasOwn(values, BACKEND_UNATTENDED_VALUE_KEY) && values[BACKEND_UNATTENDED_VALUE_KEY] !== true)
      throw new HbarError('BACKEND_AUTOMATION_DISABLED', 'Automatic Goal continuation is disabled')
  }
}
