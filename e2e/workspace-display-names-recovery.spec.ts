import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { z } from 'zod'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { workspaceDisplayNamesReceiptSchema } from '@hbar/contracts/commands/workspace-display-names'
import {
  start,
  stop,
  row,
  composer,
  showSidebar,
  hideSidebar,
  openEditor,
  capture,
  noExecution,
  evidence,
} from './support/workspace-display-names-fixture'
import { expectComposerText } from './support/composer-text'

const wire = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string().optional(),
    params: z.object({ commandId: z.string().optional(), kind: z.string().optional() }).passthrough().optional(),
    result: z.unknown().optional(),
  })
  .passthrough()

async function faults(page: Page, initial = { coldFailure: true, loseApply: true }) {
  const requests = new Map<string | number, string>()
  let coldFailure = initial.coldFailure
  let loseApply = initial.loseApply
  let receiptMode: 'null' | 'wrong' | 'hold' | 'exact' = 'null'
  let heldReceipt: (() => void) | null = null
  let writes = 0
  let receipts = 0
  let failReads = false
  await page.routeWebSocket('**/rpc', (socket) => {
    const server = socket.connectToServer()
    socket.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = wire.safeParse(JSON.parse(message))
        if (parsed.success && parsed.data.id !== undefined && parsed.data.params?.commandId)
          requests.set(parsed.data.id, parsed.data.params.commandId)
      }
      server.send(message)
    })
    server.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = wire.safeParse(JSON.parse(message))
        if (parsed.success && parsed.data.id !== undefined) {
          const data = parsed.data
          const request = requests.get(parsed.data.id)
          requests.delete(parsed.data.id)
          if (request === 'workspaceDisplayNames.get' && (coldFailure || failReads)) {
            coldFailure = false
            socket.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: data.id,
                error: { code: -32603, message: 'PRIVATE fixture read path must not appear', data: 'EXECUTION_FAILED' },
              }),
            )
            return
          }
          if (request === 'workspaceDisplayNames.apply') {
            workspaceDisplayNamesReceiptSchema.parse(data.result)
            writes++
            if (loseApply) {
              loseApply = false
              socket.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: data.id,
                  error: { code: -32603, message: 'PRIVATE fixture dropped accepted ACK', data: 'RESULT_UNKNOWN' },
                }),
              )
              return
            }
          }
          if (request === 'workspaceDisplayNames.receipt') {
            receipts++
            const receipt = workspaceDisplayNamesReceiptSchema.parse(data.result)
            if (receiptMode === 'null') {
              socket.send(JSON.stringify({ ...data, result: null }))
              return
            }
            if (receiptMode === 'wrong') {
              socket.send(
                JSON.stringify({
                  ...data,
                  result: { ...receipt, request: { ...receipt.request, workspaceId: 'wrong-target' } },
                }),
              )
              return
            }
            if (receiptMode === 'hold') {
              heldReceipt = () => socket.send(message)
              return
            }
          }
        }
      }
      socket.send(message)
    })
  })
  return {
    writes: () => writes,
    receipts: () => receipts,
    mode: (value: typeof receiptMode) => {
      receiptMode = value
    },
    held: () => heldReceipt !== null,
    release: () => {
      if (!heldReceipt) throw new Error('No receipt response is held')
      const send = heldReceipt
      heldReceipt = null
      receiptMode = 'exact'
      send()
    },
    failReads: (value: boolean) => {
      failReads = value
    },
    exactApply: () => {
      loseApply = false
    },
  }
}

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true })
})
for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`project alias confirmed save survives read failure and conflict requires explicit rebase: ${locale}`, async ({
    browser,
  }) => {
    let injection: Awaited<ReturnType<typeof faults>> | undefined
    const f = await start(browser, locale, 900, async (page) => {
      injection = await faults(page, { coldFailure: false, loseApply: false })
    })
    try {
      if (!injection) throw new Error('Missing fault routing')
      const api = createWorkspaceSessionCommandClient(f.external)
      await composer(f).fill('Confirmed save must preserve this draft')
      let dialog = await openEditor(f)
      const input = dialog.getByTestId('workspace-display-name-input')
      await input.fill('Confirmed name')
      injection.failReads(true)
      await input.press('Enter')
      await expect(dialog).not.toBeVisible()
      const feedback = f.page.getByTestId('workspace-display-name-feedback')
      await expect(feedback).toContainText(f.names.acknowledged)
      await expect(feedback).toContainText(f.names.readFailure('EXECUTION_FAILED'))
      await expect(feedback).not.toContainText(/PRIVATE|EXECUTION_FAILED|RESULT_UNKNOWN/)
      await expect(feedback.getByRole('button', { name: f.names.reconcile, exact: true })).toHaveCount(0)
      await expect(row(f).locator('.hbar-app-react-project-menu .lumen-action-menu-trigger')).toBeFocused()
      expect(injection.writes()).toBe(1)
      expect((await api.execute('workspaceDisplayNames.get', {})).entries).toEqual([
        { workspaceId: f.ready.firstWorkspace.id, displayName: 'Confirmed name' },
      ])
      await capture(f, `confirmed-read-failed-${locale}-900`)
      injection.failReads(false)
      await feedback.getByRole('button', { name: f.names.refresh, exact: true }).click()
      await expect(row(f)).toContainText('Confirmed name')
      await expect(feedback).toContainText(f.names.saved)
      dialog = await openEditor(f)
      await input.fill('Keep my local choice')
      const before = await api.execute('workspaceDisplayNames.get', {})
      await api.execute(
        'workspaceDisplayNames.apply',
        {
          expectedRevision: before.revision,
          workspaceId: f.ready.firstWorkspace.id,
          expectedDisplayName: 'Confirmed name',
          displayName: 'Other window choice',
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect(dialog).toContainText(f.names.conflict)
      await expect(input).toHaveValue('Keep my local choice')
      await expect(input).toBeFocused()
      await expect(dialog.getByRole('button', { name: f.names.save, exact: true })).toBeDisabled()
      expect(injection.writes()).toBe(1)
      await capture(f, `conflict-preserved-${locale}-900`)
      await dialog.getByRole('button', { name: f.names.rebase, exact: true }).click()
      await expect(input).toHaveValue('Keep my local choice')
      await expect(dialog.getByRole('button', { name: f.names.save, exact: true })).toBeEnabled()
      await dialog.getByRole('button', { name: f.names.save, exact: true }).click()
      await expect(dialog).not.toBeVisible()
      await expect(row(f)).toContainText('Keep my local choice')
      expect(injection.writes()).toBe(2)
      expect(injection.receipts()).toBe(0)
      await hideSidebar(f)
      await expectComposerText(composer(f), 'Confirmed save must preserve this draft')
      await noExecution(f)
    } finally {
      await stop(f)
    }
  })
  for (const width of [1440, 320]) {
    test(`project alias original unknown receipt, cold read and closed editor recovery: ${locale} ${width}`, async ({
      browser,
    }) => {
      test.setTimeout(120000)
      let injection: Awaited<ReturnType<typeof faults>> | undefined
      const f = await start(browser, locale, width, async (page) => {
        injection = await faults(page)
      })
      try {
        if (!injection) throw new Error('Missing fault routing')
        const api = createWorkspaceSessionCommandClient(f.external)
        const originalDraft = `Keep original A ${locale} ${width}`
        await composer(f).fill(originalDraft)
        let dialog = await openEditor(f)
        const input = dialog.getByTestId('workspace-display-name-input')
        await expect(dialog).toContainText(f.names.readFailure('EXECUTION_FAILED'))
        await expect(dialog).not.toContainText(/PRIVATE|EXECUTION_FAILED|RESULT_UNKNOWN/)
        await expect(dialog).not.toContainText(f.names.conflict)
        await expect(dialog.getByRole('button', { name: f.names.save, exact: true })).toBeDisabled()
        await input.fill('Unknown A')
        await dialog.getByRole('button', { name: f.names.refresh, exact: true }).click()
        await expect(input).toHaveValue('Unknown A')
        await expect(dialog.getByRole('button', { name: f.names.save, exact: true })).toBeEnabled()
        await input.pressSequentially(' rapid中文', { delay: 0 })
        await input.press('Enter')
        await expect(dialog).toContainText(f.names.unknown)
        expect((await api.execute('workspaceDisplayNames.get', {})).entries).toEqual([
          { workspaceId: f.ready.firstWorkspace.id, displayName: 'Unknown A rapid中文' },
        ])
        const check = dialog.getByRole('button', { name: f.names.reconcile, exact: true })
        await check.click()
        await expect.poll(injection.receipts).toBe(1)
        await expect(check).toBeEnabled()
        await expect(dialog).toContainText(f.names.unknown)
        injection.mode('wrong')
        await check.click()
        await expect.poll(injection.receipts).toBe(2)
        await expect(check).toBeEnabled()
        await expect(dialog).not.toContainText(/wrong-target|PRIVATE|INVALID_OUTPUT/)
        expect(injection.writes()).toBe(1)
        await capture(f, `unknown-${locale}-${width}`)
        await dialog.getByRole('button', { name: f.names.dismiss, exact: true }).click()
        const feedback = f.page.getByTestId('workspace-display-name-feedback')
        await expect(feedback.getByRole('button', { name: f.names.reopen, exact: true })).toBeVisible()
        await feedback.getByRole('button', { name: f.names.reopen, exact: true }).click()
        dialog = f.page.getByRole('dialog', { name: f.names.title, exact: true })
        await expect(input).toHaveValue('Unknown A rapid中文')
        await expect(input).toHaveAttribute('readonly', '')
        injection.mode('hold')
        await check.click()
        await expect.poll(injection.held).toBe(true)
        await expect(check).toBeDisabled()
        await expect(dialog.locator('form')).toHaveAttribute('aria-busy', 'true')
        await expect(dialog).toContainText(f.names.checking)
        await capture(f, `checking-${locale}-${width}`)
        await dialog.getByRole('button', { name: f.names.dismiss, exact: true }).click()
        await showSidebar(f)
        const second = row(f, f.ready.secondWorkspace.id)
        const expand = second
        if ((await expand.getAttribute('aria-expanded')) === 'false') await expand.click()
        await second.getByRole('treeitem', { name: f.ready.secondSession.title, exact: true }).click()
        await hideSidebar(f)
        await composer(f).fill('Current B must retain focus')
        const current = await api.execute('workspaceDisplayNames.get', {})
        await api.execute(
          'workspaceDisplayNames.apply',
          {
            expectedRevision: current.revision,
            workspaceId: f.ready.firstWorkspace.id,
            expectedDisplayName: 'Unknown A rapid中文',
            displayName: 'Remote later name',
          },
          { idempotencyKey: crypto.randomUUID() },
        )
        await composer(f).focus()
        injection.release()
        await expect(feedback.getByRole('button', { name: f.names.reconcile, exact: true })).toHaveCount(0)
        await expect(composer(f)).toBeFocused()
        await expectComposerText(composer(f), 'Current B must retain focus')
        expect(injection.writes()).toBe(1)
        expect(injection.receipts()).toBe(3)
        await showSidebar(f)
        await expect(row(f)).toContainText('Remote later name')
        await expect(feedback).toContainText(f.names.acknowledged)
        await capture(f, `reconciled-newer-fact-${locale}-${width}`)
        await row(f).getByRole('treeitem', { name: f.ready.firstSession.title, exact: true }).click()
        await hideSidebar(f)
        await expectComposerText(composer(f), originalDraft)
        await noExecution(f)
      } finally {
        await stop(f)
      }
    })
  }
}
