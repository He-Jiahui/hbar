import { expect, test } from '@playwright/test'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { skillImportCopy } from '../apps/web/src/skill-import-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { selectLumenOption } from './support/lumen-controls'
async function cleanup(root: string) {
  const path = await realpath(root)
  if (
    dirname(path).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(path).startsWith('hbar-skill-browser-')
  )
    throw new Error('Invalid import browser fixture root')
  await rm(path, { recursive: true, force: true })
}
for (const locale of ['zh-CN', 'en-US'] as const)
  test(`Claude and Codex skill conversion imports real files and survives refresh: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-skill-browser-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1100 } })
    let host: WebSessionHost | undefined
    try {
      const sources = { claude: join(root, 'claude-skills'), codex: join(root, 'codex-skills') }
      for (const [source, directory] of Object.entries(sources)) {
        await mkdir(join(directory, `${source}-example`, 'scripts'), { recursive: true })
        await writeFile(
          join(directory, `${source}-example`, 'SKILL.md'),
          `---\nname: "${source} 技能 😀"\ndescription: "真实临时技能"\nallowed-tools: Bash\n---\n\n${source === 'claude' ? 'Claude Code' : 'Codex CLI'} reads CLAUDE.md.\n`,
        )
        await writeFile(join(directory, `${source}-example`, 'CLAUDE.md'), '# Agent document')
        await writeFile(
          join(directory, `${source}-example`, 'scripts', 'example.sh'),
          '#!/bin/sh\nprintf "source preserved"\n',
        )
      }
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 45490) })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45489}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale),
        labels = skillImportCopy(locale)
      const openSettings = async () => {
        await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
        if (page.viewportSize()!.width > 390)
          await page
            .getByRole('navigation', { name: copy.settings.groups })
            .getByRole('button', { name: copy.settings.resolve('i18n:settings.groups.skills'), exact: true })
            .click()
        else await selectLumenOption(page.getByRole('combobox', { name: copy.settings.groups, exact: true }), 'skills')
      }
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await openSettings()
      await page.getByRole('button', { name: labels.open, exact: true }).click()
      for (const source of ['claude', 'codex'] as const) {
        await page.getByRole('button', { name: labels.sources[source], exact: true }).click()
        await page.getByRole('textbox', { name: labels.sourceRoot, exact: true }).fill(sources[source])
        await page.getByRole('button', { name: labels.preview, exact: true }).click()
        await expect(page.getByText(`${source} 技能 😀`, { exact: true })).toBeVisible()
        await expect(page.getByText(labels.warnings.platform_metadata, { exact: true })).toBeVisible()
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({ width, height: 1100 })
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          await page.screenshot({ path: `artifacts/settings-storage/import-${locale}-${source}-${width}.png` })
        }
        await page.getByRole('button', { name: labels.convert, exact: true }).click()
        const result = labels.result({
          operationId: 'test-only',
          request: { source },
          destination: '',
          status: 'succeeded',
          items: [{ id: `${source}-example`, status: 'imported', warnings: [] }],
          error: null,
        })
        await expect(page.getByText(result, { exact: true })).toBeVisible()
        await expect(page.locator(`[data-skill-id="${source}-example"]`)).toBeVisible()
        const imported = join(root, 'data', 'skills', 'global', `${source}-example`)
        expect(await readFile(join(imported, 'SKILL.md'), 'utf8')).toContain('hbar reads AGENTS.md.')
        expect(await readFile(join(imported, 'scripts', 'example.sh'), 'utf8')).toBe(
          '#!/bin/sh\nprintf "source preserved"\n',
        )
        expect(await readFile(join(sources[source], `${source}-example`, 'CLAUDE.md'), 'utf8')).toBe('# Agent document')
      }
      await page.setViewportSize({ width: 1440, height: 1100 })
      await page.reload()
      await openSettings()
      await page.getByRole('button', { name: labels.open, exact: true }).click()
      await expect(
        page.getByText(
          labels.result({
            operationId: 'restored',
            request: { source: 'codex' },
            destination: '',
            status: 'succeeded',
            items: [{ id: 'codex-example', status: 'imported', warnings: [] }],
            error: null,
          }),
          { exact: true },
        ),
      ).toBeVisible()
      await expect(page.locator('[data-skill-id="codex-example"]')).toBeVisible()
      expect(errors).toEqual([])
    } finally {
      try {
        await context.close()
      } finally {
        try {
          if (host) await stopWebSessionHost(host)
        } finally {
          await cleanup(root)
        }
      }
    }
  })
