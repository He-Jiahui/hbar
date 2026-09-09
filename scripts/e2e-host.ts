import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir, networkInterfaces } from 'node:os'
import { join, resolve } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'

function isPrivateIpv4(address: string) {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false
  const [first, second] = octets as [number, number, number, number]
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
}

function lanAddress() {
  const candidates = Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? []).flatMap((address) =>
      address.family === 'IPv4' && !address.internal && isPrivateIpv4(address.address)
        ? [{ name, address: address.address }]
        : [],
    ),
  )
  return candidates
    .sort((left, right) => {
      const score = ({ name, address }: { name: string; address: string }) => {
        const virtual = /vpn|tun|tap|virtual|vmware|hyper-v|wsl/i.test(name) ? 20 : 0
        const physical = /wlan|wi-?fi|ethernet|以太网/i.test(name) ? 0 : 5
        const subnet = address.startsWith('192.168.') ? 0 : address.startsWith('10.') ? 1 : 2
        return virtual + physical + subnet
      }
      return score(left) - score(right) || left.name.localeCompare(right.name) || left.address.localeCompare(right.address)
    })
    .at(0)?.address
}

const root = await mkdtemp(join(tmpdir(), 'hbar-browser-'))
const kernel = await Kernel.create({
  home: join(root, 'data'),
  workspace: root,
  demo: true,
  secrets: new MemorySecrets(),
})
const history = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id, '10k history')
for (let i = 0; i < 10_000; i++)
  await kernel.storage.call('commit', history.id, 'history', i % 2 ? 'assistant' : 'user', [
    { type: 'text', text: `History entry ${i}` },
  ])
const host = await startServer(kernel, { hostname: '0.0.0.0', port: Number(process.env.HBAR_E2E_PORT ?? 4329) })
const lan = lanAddress()
const device = await host.auth.createDevice('Browser test controller')
await mkdir('.dev', { recursive: true })
await writeFile(
  '.dev/e2e.json',
  JSON.stringify({
    url: `http://127.0.0.1:${host.server.port}`,
    lanUrl: lan ? `http://${lan}:${host.server.port}` : undefined,
    token: device.token,
    code: host.pairing.code,
    root,
    historyId: history.id,
  }),
  { mode: 0o600 },
)
await writeFile(join(root, 'sample.ts'), 'export const answer = 42\n')
console.log(`Browser test host ready on ${host.server.port}`)
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await host.close()
  await kernel.close()
  await rm(root, { recursive: true, force: true })
  await rm(resolve('.dev/e2e.json'), { force: true })
  process.exit(0)
}
process.on('SIGTERM', () => {
  void stop()
})
process.on('SIGINT', () => {
  void stop()
})
