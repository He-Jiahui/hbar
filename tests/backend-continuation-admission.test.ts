import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { HbarError, type UserInput } from '@hbar/contracts'
import { BACKEND_UNATTENDED_VALUE_KEY } from '@hbar/contracts/backend'
import { createBackendContinuationAdmission } from '../packages/storage/src/backend-continuation'

const automatic: UserInput = {
  text: '',
  images: [],
  source: 'goal',
  continuation: { goalId: 'goal', intentId: 'intent' },
}

test('continuation admission preserves missing configuration and requires explicit true for an owned field', () => {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE settings_layers(id TEXT PRIMARY KEY,valuesJson TEXT NOT NULL)')
  const admit = createBackendContinuationAdmission(db)
  const save = (values: Record<string, unknown>) =>
    db.query('INSERT OR REPLACE INTO settings_layers VALUES(?,?)').run('settings:global', JSON.stringify(values))
  try {
    expect(() => admit(automatic)).not.toThrow()
    save({ unrelated: false })
    expect(() => admit(automatic)).not.toThrow()
    save({ [BACKEND_UNATTENDED_VALUE_KEY]: true })
    expect(() => admit(automatic)).not.toThrow()
    for (const value of [false, null, 'true', 1]) {
      save({ [BACKEND_UNATTENDED_VALUE_KEY]: value })
      expect(() => admit(automatic)).toThrow(HbarError)
      try {
        admit(automatic)
      } catch (error) {
        expect(error).toMatchObject({ code: 'BACKEND_AUTOMATION_DISABLED' })
      }
    }
  } finally {
    db.close()
  }
})

test('admission rechecks current settings inside a transaction without caching earlier permission', () => {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE settings_layers(id TEXT PRIMARY KEY,valuesJson TEXT NOT NULL)')
  const admit = createBackendContinuationAdmission(db)
  const save = (enabled: boolean) =>
    db
      .query('INSERT OR REPLACE INTO settings_layers VALUES(?,?)')
      .run('settings:global', JSON.stringify({ [BACKEND_UNATTENDED_VALUE_KEY]: enabled }))
  try {
    save(true)
    expect(() => admit(automatic)).not.toThrow()
    save(false)
    expect(() => db.transaction(() => admit(automatic))()).toThrow('Automatic Goal continuation is disabled')
    save(true)
    expect(() => db.transaction(() => admit(automatic))()).not.toThrow()
  } finally {
    db.close()
  }
})

test('disabled automation still admits explicit user and system work, and cannot hide a continuation binding', () => {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE settings_layers(id TEXT PRIMARY KEY,valuesJson TEXT NOT NULL)')
  db.query('INSERT INTO settings_layers VALUES(?,?)').run(
    'settings:global',
    JSON.stringify({ [BACKEND_UNATTENDED_VALUE_KEY]: false }),
  )
  const admit = createBackendContinuationAdmission(db)
  try {
    expect(() => admit({ text: 'Start my task', images: [] })).not.toThrow()
    expect(() => admit({ text: 'Start my task', images: [], source: 'user' })).not.toThrow()
    expect(() => admit({ text: 'Dedicated maintenance', images: [], source: 'system' })).not.toThrow()
    expect(() => admit({ ...automatic, source: 'user' })).toThrow(HbarError)
    expect(() => admit({ text: '', images: [], source: 'goal' })).toThrow(HbarError)
  } finally {
    db.close()
  }
})
