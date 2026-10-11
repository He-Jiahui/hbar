import { expect, test } from 'bun:test'
import { win32 } from 'node:path'
import { resolveBrowserExecutable } from '../plugins/browser-use/src/browser-executable'

const bundledPath = '/fixture/playwright/chromium'
const environment = {
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\fixture\\AppData\\Local',
}
const edge = (root: string) => win32.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
const chrome = (root: string) => win32.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')

function probe(available: string[]) {
  const inspected: string[] = []
  return {
    inspected,
    exists: async (path: string) => {
      inspected.push(path)
      return available.includes(path)
    },
  }
}

test('a configured executable takes precedence over all installed browsers', async () => {
  const files = probe(['custom-browser.exe', bundledPath, edge(environment.ProgramFiles)])
  expect(
    await resolveBrowserExecutable('custom-browser.exe', { bundledPath, platform: 'win32', environment, ...files }),
  ).toBe('custom-browser.exe')
  expect(files.inspected).toEqual(['custom-browser.exe'])
})

test('a missing configured executable cannot silently switch to another browser', async () => {
  const files = probe([bundledPath, edge(environment.ProgramFiles)])
  await expect(
    resolveBrowserExecutable('missing-browser.exe', { bundledPath, platform: 'win32', environment, ...files }),
  ).rejects.toHaveProperty('code', 'BROWSER_BACKEND_UNAVAILABLE')
  expect(files.inspected).toEqual(['missing-browser.exe'])
})

test('the installed Playwright Chromium remains the default when present', async () => {
  const files = probe([bundledPath, edge(environment.ProgramFiles)])
  expect(await resolveBrowserExecutable(undefined, { bundledPath, platform: 'win32', environment, ...files })).toBe(
    bundledPath,
  )
  expect(files.inspected).toEqual([bundledPath])
})

test('Windows prefers an installed Edge over Chrome across the standard roots', async () => {
  const selected = edge(environment.LOCALAPPDATA)
  const files = probe([selected, chrome(environment.ProgramFiles)])
  expect(await resolveBrowserExecutable(undefined, { bundledPath, platform: 'win32', environment, ...files })).toBe(
    selected,
  )
  expect(files.inspected).toEqual([
    bundledPath,
    edge(environment.ProgramFiles),
    edge(environment['ProgramFiles(x86)']),
    selected,
  ])
})

test('Windows can use installed Chrome when Edge is absent', async () => {
  const selected = chrome(environment['ProgramFiles(x86)'])
  const files = probe([selected])
  expect(await resolveBrowserExecutable(undefined, { bundledPath, platform: 'win32', environment, ...files })).toBe(
    selected,
  )
})

test('non-Windows resolution does not inspect Windows installation roots', async () => {
  const files = probe([edge(environment.ProgramFiles)])
  expect(
    await resolveBrowserExecutable(undefined, { bundledPath, platform: 'linux', environment, ...files }),
  ).toBeUndefined()
  expect(files.inspected).toEqual([bundledPath])
})

test('empty or relative roots cannot create arbitrary local browser candidates', async () => {
  const files = probe([])
  expect(
    await resolveBrowserExecutable(undefined, {
      bundledPath,
      platform: 'win32',
      environment: { ProgramFiles: '', 'ProgramFiles(x86)': '../other', LOCALAPPDATA: 'C:relative' },
      ...files,
    }),
  ).toBeUndefined()
  expect(files.inspected).toEqual([bundledPath])
})

test('absent browsers leave a bounded candidate list with no repeated probes', async () => {
  const files = probe([])
  expect(
    await resolveBrowserExecutable(undefined, { bundledPath, platform: 'win32', environment, ...files }),
  ).toBeUndefined()
  expect(files.inspected).toHaveLength(7)
  const repeatedRoots = probe([])
  await resolveBrowserExecutable(undefined, {
    bundledPath,
    platform: 'win32',
    environment: {
      ProgramFiles: environment.ProgramFiles,
      'ProgramFiles(x86)': environment.ProgramFiles.toUpperCase(),
    },
    ...repeatedRoots,
  })
  expect(repeatedRoots.inspected).toEqual([
    bundledPath,
    edge(environment.ProgramFiles),
    chrome(environment.ProgramFiles),
  ])
})
