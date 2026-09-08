import { parseArgs } from 'node:util'
import { resolve, join } from 'node:path'
import { HbarClient } from '@hbar/client'

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { home: { type: 'string' } } })
const home = resolve(values.home ?? '.dev/preview')
const file = Bun.file(join(home, 'connection.json'))
if (!(await file.exists())) throw new Error('No local desktop connection file. Start this Host with --desktop.')
const connection = (await file.json()) as { url: string; token: string }
const client = new HbarClient(connection.url, connection.token)
try {
  await client.connect()
  const pairing = await client.call('pairing.create', {})
  console.log(
    `URL: ${connection.url}\nPairing code: ${pairing.code}\nExpires: ${new Date(pairing.expiresAt).toLocaleString()}`,
  )
} finally {
  client.disconnect()
}
