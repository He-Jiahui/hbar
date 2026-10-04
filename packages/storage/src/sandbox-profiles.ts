import type { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import {
  SANDBOX_MAX_EXTENDS_DEPTH,
  SANDBOX_MAX_PROFILES,
  resolvedSandboxProfileSchema,
  sandboxProfileSchema,
  type ResolvedSandboxProfile,
  type SandboxProfile,
  type SandboxProfileDeleteInput,
  type SandboxProfileSaveInput,
} from '@hbar/contracts/sandbox'
import { sandboxCommands } from '@hbar/contracts/commands/sandbox'
import { createFeatureCommandReceipts, type FeatureWriteIdentity } from './feature-command-receipts'

export const SANDBOX_PROFILES_SQL = `
CREATE TABLE IF NOT EXISTS sandbox_profiles(
  id TEXT PRIMARY KEY,
  extendsId TEXT,
  data TEXT NOT NULL,
  revision INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sandbox_profiles_extends ON sandbox_profiles(extendsId);
CREATE TABLE IF NOT EXISTS sandbox_snapshots(
  digest TEXT PRIMARY KEY,
  profileId TEXT NOT NULL,
  data TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
`

/** Canonical JSON of a resolved profile and its SHA-256 digest. */
export interface SandboxSnapshotRecord {
  readonly digest: string
  readonly profileId: string
  readonly data: string
}

type ProfileRow = { id: string; data: string; revision: number; createdAt: number; updatedAt: number }

export function createSandboxProfileStorage(db: Database) {
  const receipts = createFeatureCommandReceipts(db)
  const read = (row: ProfileRow): SandboxProfile => {
    const body: unknown = JSON.parse(row.data)
    if (!body || typeof body !== 'object') throw new HbarError('INVALID_OUTPUT', 'Stored sandbox profile is invalid')
    return sandboxProfileSchema.parse({
      ...body,
      id: row.id,
      builtin: false,
      revision: row.revision,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }
  const get = (id: string): SandboxProfile | null => {
    const row = db
      .query<ProfileRow, [string]>('SELECT id,data,revision,createdAt,updatedAt FROM sandbox_profiles WHERE id=?')
      .get(id)
    return row ? read(row) : null
  }
  const parentOf = db.query<{ extendsId: string | null }, [string]>('SELECT extendsId FROM sandbox_profiles WHERE id=?')
  return {
    list(): SandboxProfile[] {
      return db
        .query<ProfileRow, [number]>(
          'SELECT id,data,revision,createdAt,updatedAt FROM sandbox_profiles ORDER BY id LIMIT ?',
        )
        .all(SANDBOX_MAX_PROFILES)
        .map(read)
    },
    get,
    receipt(
      commandId: 'sandbox.save' | 'sandbox.delete',
      input: SandboxProfileSaveInput | SandboxProfileDeleteInput,
      identity: FeatureWriteIdentity,
    ) {
      return receipts.lookup({ commandId, input, ...identity })
    },
    save(input: SandboxProfileSaveInput, identity?: FeatureWriteIdentity): SandboxProfile {
      return receipts.run('sandbox.save', input, identity, sandboxProfileSchema, () => {
        const current = db
          .query<{ revision: number }, [string]>('SELECT revision FROM sandbox_profiles WHERE id=?')
          .get(input.id)
        if (input.expectedRevision === null && current)
          throw new HbarError('COMMAND_CONFLICT', `Sandbox profile ${input.id} already exists`)
        if (input.expectedRevision !== null && current?.revision !== input.expectedRevision)
          throw new HbarError('COMMAND_CONFLICT', 'Sandbox profile revision changed')
        if (!current) {
          const count =
            db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM sandbox_profiles').get()?.count ?? 0
          if (count >= SANDBOX_MAX_PROFILES)
            throw new HbarError('LIMIT_EXCEEDED', `At most ${SANDBOX_MAX_PROFILES} sandbox profiles can be stored`)
        }
        // Built-in parents (`:` ids) are not stored; the kernel checks their depth when resolving.
        let parent = input.extends
        for (let hops = 0; parent !== null && !parent.startsWith(':'); hops++) {
          if (parent === input.id)
            throw new HbarError('SANDBOX_PROFILE_CYCLE', `Sandbox profile ${input.id} extends itself`)
          if (hops >= SANDBOX_MAX_EXTENDS_DEPTH)
            throw new HbarError('SANDBOX_PROFILE_TOO_DEEP', `Sandbox profile ${input.id} extends too many profiles`)
          const row = parentOf.get(parent)
          if (!row) throw new HbarError('SANDBOX_PROFILE_NOT_FOUND', `Sandbox profile ${parent} does not exist`)
          parent = row.extendsId
        }
        const { id, expectedRevision: _expectedRevision, ...body } = input
        const now = Date.now()
        db.query(
          'INSERT INTO sandbox_profiles(id,extendsId,data,revision,createdAt,updatedAt) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET extendsId=excluded.extendsId,data=excluded.data,revision=excluded.revision,updatedAt=excluded.updatedAt',
        ).run(id, body.extends, JSON.stringify(body), (current?.revision ?? 0) + 1, now, now)
        const saved = get(id)
        if (!saved) throw new HbarError('INVALID_OUTPUT', 'Saved sandbox profile could not be read')
        return saved
      })
    },
    delete(input: SandboxProfileDeleteInput, identity?: FeatureWriteIdentity) {
      return receipts.run('sandbox.delete', input, identity, sandboxCommands['sandbox.delete'].output, () => {
        const current = db
          .query<{ revision: number }, [string]>('SELECT revision FROM sandbox_profiles WHERE id=?')
          .get(input.id)
        if (!current) return { deleted: false }
        if (current.revision !== input.expectedRevision)
          throw new HbarError('COMMAND_CONFLICT', 'Sandbox profile revision changed')
        const child = db
          .query<{ id: string }, [string]>('SELECT id FROM sandbox_profiles WHERE extendsId=? ORDER BY id LIMIT 1')
          .get(input.id)
        if (child) throw new HbarError('SANDBOX_PROFILE_IN_USE', `Sandbox profile ${child.id} extends ${input.id}`)
        return { deleted: db.query('DELETE FROM sandbox_profiles WHERE id=?').run(input.id).changes > 0 }
      })
    },
    /** Snapshots are immutable; re-inserting the same digest must carry identical content. */
    putSnapshot(record: SandboxSnapshotRecord): void {
      if (createHash('sha256').update(record.data).digest('hex') !== record.digest)
        throw new HbarError('INVALID_INPUT', 'Sandbox snapshot digest does not match its content')
      if (resolvedSandboxProfileSchema.parse(JSON.parse(record.data)).profileId !== record.profileId)
        throw new HbarError('INVALID_INPUT', 'Sandbox snapshot profile does not match its content')
      db.transaction(() => {
        const existing = db
          .query<{ data: string }, [string]>('SELECT data FROM sandbox_snapshots WHERE digest=?')
          .get(record.digest)
        if (existing) {
          if (existing.data !== record.data)
            throw new HbarError('INVALID_STATE', 'Sandbox snapshot digest already names different content')
          return
        }
        db.query('INSERT INTO sandbox_snapshots(digest,profileId,data,createdAt) VALUES(?,?,?,?)').run(
          record.digest,
          record.profileId,
          record.data,
          Date.now(),
        )
      }).immediate()
    },
    snapshot(digest: string): ResolvedSandboxProfile | null {
      const row = db.query<{ data: string }, [string]>('SELECT data FROM sandbox_snapshots WHERE digest=?').get(digest)
      return row ? resolvedSandboxProfileSchema.parse(JSON.parse(row.data)) : null
    },
  }
}
