import { describe, expect, test } from 'bun:test'
import { createFileBrowserModel, fileResourceKey } from '../apps/web/src/file-browser-model'
import type { FileEntry } from '@hbar/contracts'

describe('file browser ViewModel', () => {
  test('rejects replaced requests and results from a revoked host connection', async () => {
    let connection = {}
    const requests: Array<(entries: readonly FileEntry[]) => void> = []
    const model = createFileBrowserModel({
      identity: () => connection,
      list: () => new Promise((resolve) => requests.push(resolve)),
      read: async () => '',
    })
    const first = model.getState().openDirectory('workspace', '.')
    const second = model.getState().openDirectory('workspace', '.')
    requests[1]?.([])
    await second
    const accepted = model.getState().directories[fileResourceKey('workspace', '.')]
    requests[0]?.([])
    await first
    expect(model.getState().directories[fileResourceKey('workspace', '.')]).toBe(accepted)
    const stale = model.getState().openDirectory('workspace', 'other')
    connection = {}
    requests[2]?.([])
    await stale
    expect(model.getState().directories[fileResourceKey('workspace', 'other')]?.source).not.toBe(connection)
  })
  test('keeps failure local, recovers on retry, and clears cached file text while reloading', async () => {
    const connection = {}
    let failing = true
    const model = createFileBrowserModel({
      identity: () => connection,
      list: async () => [],
      read: async () => {
        if (failing) throw new Error('File unavailable')
        return 'recovered content'
      },
    })
    const key = fileResourceKey('workspace', 'a.ts')
    await model.getState().openDocument('workspace', 'a.ts')
    expect(model.getState().documents[key]?.error).toBe('File unavailable')
    expect(model.getState().documents[key]?.loading).toBe(false)
    failing = false
    await model.getState().openDocument('workspace', 'a.ts')
    expect(model.getState().documents[key]?.data).toBe('recovered content')
    expect(model.getState().documents[key]?.error).toBeUndefined()
    const pending = model.getState().openDocument('workspace', 'a.ts')
    expect(model.getState().documents[key]?.data).toBe('')
    model.getState().clear()
    await pending
    expect(model.getState().documents).toEqual({})
  })
  test('bounds cached documents and keeps workspace paths independent', async () => {
    const connection = {}
    const model = createFileBrowserModel({
      identity: () => connection,
      list: async () => [],
      read: async (_, path) => path,
    })
    model.getState().navigate('first', 'docs')
    model.getState().navigate('second', 'src')
    expect(model.getState().paths).toEqual({ first: 'docs', second: 'src' })
    for (let index = 0; index < 33; index++) await model.getState().openDocument('first', `${index}.ts`)
    expect(Object.keys(model.getState().documents)).toHaveLength(32)
    expect(model.getState().documents[fileResourceKey('first', '0.ts')]).toBeUndefined()
  })
})
