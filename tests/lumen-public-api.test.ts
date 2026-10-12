import { expect, test } from 'bun:test'
import * as workbench from '@lumen/app-ui'
import * as catalog from '@lumen/app-ui/catalog'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import postcss from 'postcss'

test('the root API provides workbench controls and isolates optional reference families', () => {
  expect(typeof workbench.LumenButton).toBe('object')
  expect(typeof workbench.LumenConversation).toBe('function')
  expect(typeof workbench.LumenAppShell).toBe('function')
  expect(typeof workbench.createLumenTheme).toBe('function')
  const optional = /^(?:LumenBilling|LumenAuthentication|LumenKanban|LumenPaywall)/
  expect(Object.keys(workbench).filter((name) => optional.test(name))).toEqual([])
  expect(Object.keys(catalog).some((name) => name.startsWith('LumenBilling'))).toBe(true)
  expect(typeof catalog.LumenKanban01).toBe('function')
})

test('workbench and catalog styles have independent public exports and import graphs', () => {
  const directory = resolve(import.meta.dirname, '../packages/lumen-app-ui')
  const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8')) as {
    exports: Record<string, string>
    publishConfig: { exports: Record<string, unknown> }
  }
  expect(manifest.publishConfig.exports['./styles.css']).not.toBe(
    manifest.publishConfig.exports['./catalog/styles.css'],
  )
  const visited = new Set<string>()
  const visit = (path: string) => {
    if (visited.has(path)) return
    visited.add(path)
    postcss.parse(readFileSync(path, 'utf8')).walkAtRules('import', (rule) => {
      const relative = /^['"](.+?)['"]/.exec(rule.params)?.[1]
      if (relative?.startsWith('.')) visit(resolve(dirname(path), relative))
    })
  }
  visit(resolve(directory, manifest.exports['./styles.css']!))
  expect([...visited].filter((path) => /[\\/](?:authentication|billing|kanban|paywall)/.test(path))).toEqual([])
  expect(manifest.exports['./catalog/styles.css']).toBeDefined()
  expect(Object.keys(manifest.publishConfig.exports).sort()).toEqual(Object.keys(manifest.exports).sort())
})
