import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  LumenFileDocument,
  LumenFileManager01,
  LumenFileManagerProvider,
  LumenWorkspaceFiles,
  selectLumenFileManagerItem,
  uniqueLumenFileManagerItems,
} from '@lumen/app-ui'
import {
  HbarAppUiFileManagerProvider,
  selectHbarAppUiFileManagerItem,
  uniqueHbarAppUiFileManagerItems,
} from '../packages/hbar-app-ui/src/index'
import {
  HbarAppUiFileDocument,
  HbarAppUiWorkspaceFiles,
} from '../packages/hbar-app-ui/src/workspace-files'
import { HBAR_APP_UI_FILE_MANAGER_FIXTURES } from './fixtures/hbar-app-ui-file-manager-fixtures'

test('file compatibility exports are canonical Lumen contracts', () => {
  expect(HbarAppUiFileManagerProvider).toBe(LumenFileManagerProvider)
  expect(HbarAppUiWorkspaceFiles).toBe(LumenWorkspaceFiles)
  expect(HbarAppUiFileDocument).toBe(LumenFileDocument)
  expect(selectHbarAppUiFileManagerItem).toBe(selectLumenFileManagerItem)
  expect(uniqueHbarAppUiFileManagerItems).toBe(uniqueLumenFileManagerItems)
})

test('the canonical Lumen entry renders file workflow content and controls', () => {
  const markup = renderToStaticMarkup(
    createElement(LumenFileManagerProvider, {
      content: HBAR_APP_UI_FILE_MANAGER_FIXTURES,
      children: createElement(LumenFileManager01),
    }),
  )

  expect(markup).toContain('data-lumen-component="file-manager"')
  expect(markup).toContain('hbar-app-ui-file-manager-drive-table')
  expect(markup).toContain('Halcyon Drive')
  expect(markup).toContain('data-lumen-variant=')
})

test('the legacy file manager implementation and stylesheets are retired', async () => {
  const retired = [
    'AssetLibrary.tsx',
    'DriveExplorer.tsx',
    'FileDetail.tsx',
    'FileManagerPrimitives.tsx',
    'FileManagerSurface.css',
    'UploadQueue.tsx',
    'WorkspaceFiles.css',
  ]

  for (const file of retired) {
    expect(await Bun.file(`packages/hbar-app-ui/src/components/file-manager/${file}`).exists()).toBe(false)
  }
})
