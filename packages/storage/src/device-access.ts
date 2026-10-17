import { z } from 'zod'
import type { Database } from 'bun:sqlite'
import { deviceSchema, deviceAccessOf, type Device } from '@hbar/contracts/device'

export const DEVICE_ACCESS_SQL = `
CREATE TABLE IF NOT EXISTS device_access(
  deviceId TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('operator','observer')),
  workspaceIds TEXT NOT NULL CHECK(json_valid(workspaceIds))
) STRICT;`

export function createDeviceStorage(db: Database, onCreated: (id: string) => void) {
  const rowSchema = z.strictObject({
    id: z.string(),
    name: z.string(),
    createdAt: z.number(),
    lastSeenAt: z.number(),
    role: z.string().nullable(),
    workspaceIds: z.string().nullable(),
  })
  const decode = (value: unknown): Device => {
    const row = rowSchema.parse(value)
    const scopes: unknown = row.workspaceIds === null ? null : JSON.parse(row.workspaceIds)
    return deviceSchema.parse({
      ...row,
      role: row.role ?? 'operator',
      workspaceIds: scopes,
    })
  }
  const columns = 'd.id,d.name,d.createdAt,d.lastSeenAt,a.role,a.workspaceIds'
  return {
    put(device: Device, tokenHash: string): void {
      const checked = deviceSchema.parse(device)
      const access = deviceAccessOf(checked)
      db.transaction(() => {
        db.query('INSERT INTO devices(id,name,tokenHash,createdAt,lastSeenAt) VALUES(?,?,?,?,?)').run(
          checked.id,
          checked.name,
          tokenHash,
          checked.createdAt,
          checked.lastSeenAt,
        )
        db.query('INSERT INTO device_access(deviceId,role,workspaceIds) VALUES(?,?,?)').run(
          checked.id,
          access.role,
          JSON.stringify(access.workspaceIds),
        )
        onCreated(checked.id)
      }).immediate()
    },
    byHash(hash: string): Device | null {
      const row = db
        .query(`SELECT ${columns} FROM devices d LEFT JOIN device_access a ON a.deviceId=d.id WHERE d.tokenHash=?`)
        .get(hash)
      return row === null ? null : decode(row)
    },
    byId(id: string): Device | null {
      const row = db
        .query(`SELECT ${columns} FROM devices d LEFT JOIN device_access a ON a.deviceId=d.id WHERE d.id=?`)
        .get(id)
      return row === null ? null : decode(row)
    },
    list(): Device[] {
      return db
        .query(
          `SELECT ${columns} FROM devices d LEFT JOIN device_access a ON a.deviceId=d.id ORDER BY d.createdAt LIMIT 10000`,
        )
        .all()
        .map(decode)
    },
    revoke(id: string): void {
      db.query('DELETE FROM devices WHERE id=?').run(id)
    },
  }
}
