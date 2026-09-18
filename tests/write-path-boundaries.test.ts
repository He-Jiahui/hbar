import { expect, test } from 'bun:test'
import { LEGACY_WRITE_RPC_METHODS } from '@hbar/contracts'

test('consumer source never calls deprecated write RPCs directly', async () => {
  const violations: string[] = []
  for (const pattern of ['apps/{cli,web,desktop}/src/**/*.{ts,tsx}', 'packages/{app-runtime,app-react,ui-sdk}/src/**/*.{ts,tsx}']) {
    for await (const path of new Bun.Glob(pattern).scan('.')) {
      const source = await Bun.file(path).text()
      for (const method of LEGACY_WRITE_RPC_METHODS) {
        const single = `.call('${method}'`
        const double = `.call("${method}"`
        if (source.includes(single) || source.includes(double)) violations.push(`${path}: ${method}`)
      }
    }
  }
  expect(violations).toEqual([])
})

test('Host compatibility mutations delegate to canonical command handlers', async () => {
  const source = await Bun.file('apps/host/src/server.ts').text()
  const failures: string[] = []
  for (const method of LEGACY_WRITE_RPC_METHODS) {
    const marker = `case '${method}':`
    const start = source.indexOf(marker)
    if (start < 0) {
      failures.push(`${method}: missing adapter`)
      continue
    }
    const next = source.indexOf("\n      case '", start + marker.length)
    const block = source.slice(start, next < 0 ? source.length : next)
    if (!block.includes('.execute(')) failures.push(`${method}: bypasses command handler`)
  }
  expect(failures).toEqual([])
})
