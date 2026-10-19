import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readChatDatabaseActiveJournalProof } from '@hbar/storage'

// Extracted from maintenance-inspection-domain: actual SQLite only, no Kernel lifecycle dependency.
test('actual SQLite proof preserves all active, unknown and malformed operation facts without writes', () => {
  const db = new Database(':memory:', { strict: true })
  try {
    db.exec('CREATE TABLE chat_database_operations(id TEXT PRIMARY KEY,dataJson TEXT NOT NULL)')
    const put = db.query('INSERT INTO chat_database_operations VALUES(?,?)')
    for (const status of ['accepted', 'running', 'cancelRequested', 'unknown', 'completed', 'failed', 'cancelled'])
      put.run(status, JSON.stringify({ status }))
    put.run('malformed', '{')
    put.run('missing-status', '{}')
    put.run('unrecognized-status', JSON.stringify({ status: 'not-a-status' }))
    db.exec('PRAGMA query_only=ON')
    const proof = readChatDatabaseActiveJournalProof(db, 'a'.repeat(64))
    expect(proof.counts).toEqual({ accepted: 1, running: 1, cancelRequested: 1, unknown: 1, invalid: 3 })
    expect(proof).toMatchObject({
      version: 1,
      coverage: 'complete-single-database',
      databaseId: 'a'.repeat(64),
      empty: false,
      firstActiveId: 'accepted',
    })
    expect(readChatDatabaseActiveJournalProof(db, 'a'.repeat(64))).toEqual(proof)
    expect(db.query('SELECT COUNT(*) AS count FROM chat_database_operations').get()).toEqual({ count: 10 })
  } finally {
    db.close()
  }
})

test('terminal operations and an empty actual SQLite database have complete empty coverage', () => {
  const db = new Database(':memory:', { strict: true })
  try {
    db.exec('CREATE TABLE chat_database_operations(id TEXT PRIMARY KEY,dataJson TEXT NOT NULL)')
    const empty = readChatDatabaseActiveJournalProof(db, 'b'.repeat(64))
    expect(empty).toMatchObject({
      empty: true,
      firstActiveId: null,
      counts: { accepted: 0, running: 0, cancelRequested: 0, unknown: 0, invalid: 0 },
    })
    const put = db.query('INSERT INTO chat_database_operations VALUES(?,?)')
    for (const status of ['completed', 'failed', 'cancelled']) put.run(status, JSON.stringify({ status }))
    db.exec('PRAGMA query_only=ON')
    expect(readChatDatabaseActiveJournalProof(db, 'b'.repeat(64))).toEqual(empty)
  } finally {
    db.close()
  }
})

test('unknown-only and malformed-only journals cannot become an empty proof', () => {
  const db = new Database(':memory:', { strict: true })
  try {
    db.exec('CREATE TABLE chat_database_operations(id TEXT PRIMARY KEY,dataJson TEXT NOT NULL)')
    db.query('INSERT INTO chat_database_operations VALUES(?,?)').run(
      'unknown-operation',
      JSON.stringify({ status: 'unknown' }),
    )
    expect(readChatDatabaseActiveJournalProof(db, 'c'.repeat(64))).toMatchObject({
      empty: false,
      firstActiveId: 'unknown-operation',
      counts: { unknown: 1, invalid: 0 },
    })
    db.query('UPDATE chat_database_operations SET dataJson=?').run('{')
    db.exec('PRAGMA query_only=ON')
    expect(readChatDatabaseActiveJournalProof(db, 'c'.repeat(64))).toMatchObject({
      empty: false,
      firstActiveId: null,
      counts: { unknown: 0, invalid: 1 },
    })
  } finally {
    db.close()
  }
})
