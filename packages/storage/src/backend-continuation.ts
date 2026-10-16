import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { HbarError, type UserInput } from '@hbar/contracts'
import { BACKEND_UNATTENDED_VALUE_KEY } from '@hbar/contracts/backend'

/** Read current committed settings; an absent field preserves legacy continuation behavior. */
export function createBackendContinuationCheck(db: Database): () => boolean {
  const layer = db.query<{ valuesJson: string }, []>(
    "SELECT valuesJson FROM settings_layers WHERE id='settings:global'",
  )
  return () => {
    const row = layer.get()
    if (!row) return true
    const values = z.record(z.string(), z.unknown()).parse(JSON.parse(row.valuesJson) as unknown)
    return !Object.hasOwn(values, BACKEND_UNATTENDED_VALUE_KEY) || values[BACKEND_UNATTENDED_VALUE_KEY] === true
  }
}

/** Called inside enqueue after accepted-request reconciliation, before any new Run writes. */
export function createBackendContinuationAdmission(db: Database): (input: UserInput) => void {
  const allowed = createBackendContinuationCheck(db)
  return (input) => {
    if (input.source !== 'goal' && input.continuation === undefined) return
    if (!allowed()) throw new HbarError('BACKEND_AUTOMATION_DISABLED', 'Automatic Goal continuation is disabled')
  }
}
