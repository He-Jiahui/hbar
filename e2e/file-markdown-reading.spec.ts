import { expect, test } from '@playwright/test'
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { removeOwnedTempDirectory } from './support/owned-temp-directory'

const longCode = Array.from({ length: 25 }, (_, i) => `const line${i + 1} = "Markdown file proof ${i + 1}";`).join('\n')
const diagramCode = 'flowchart TD\n  Start[Open document] --> Parse[Parse Markdown]\n  Parse --> Render[Render Mermaid]'
const text =
  '# Project notes — 项目说明\n\nRead the document, keep its original file identity.\n\n## Review steps\n\n1. **Read** the proposal.\n2. Inspect the source.\n3. Return to the conversation.\n\n| State | Next action |\n| --- | --- |\n| Draft | Review |\n| Confirmed | Continue |\n\n```ts\nexport const ready = true\n```\n\n![Remote image must not load](https://markdown-fixture.invalid/pixel.png)\n\n<script>window.markdownExecuted = true</script>\n\n' +
  `\n\`\`\`typescript\n${longCode}\n\`\`\`\n\n` +
  `\n\`\`\`mermaid\n${diagramCode}\n\`\`\`\n\n` +
  Array.from(
    { length: 28 },
    (_, i) =>
      `## Section ${i + 1}\n\nA longer paragraph with **emphasis**, [an explicit external link](https://markdown-fixture.invalid/read), and a natural reading flow. 阅读内容变长时保留标题与正文层次。\n\n`,
  ).join('')

async function removeOwnedFixture(root: string): Promise<void> {
  await removeOwnedTempDirectory(root, 'hbar-markdown-reading-')
}

for (const scenario of [
  { locale: 'en-US', width: 1440 },
  { locale: 'zh-CN', width: 320 },
] as const) {
  test(`Markdown file reading keeps source, editing and return continuous: ${scenario.locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-markdown-reading-'))
    const context = await browser.newContext({
      locale: scenario.locale,
      viewport: { width: 1440, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write'],
    })
    const copy = getShellCopy(scenario.locale)
    let host: WebSessionHost | undefined
    try {
      await writeFile(join(root, 'README.md'), text)
      await writeFile(join(root, 'other.txt'), 'A separate ordinary text file.\n')
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      const remoteRequests: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await context.route('https://markdown-fixture.invalid/**', (route) => {
        remoteRequests.push(route.request().url())
        return route.abort()
      })
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'Keep this draft while reading Markdown — 文档往返不丢草稿'
      await prompt.click()
      await expect(prompt).toBeFocused()
      await page.keyboard.insertText(draft)
      await expectComposerText(prompt, draft)
      await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
      await page.getByText('README.md', { exact: true }).click()
      await page.setViewportSize({ width: scenario.width, height: 900 })
      const markdown = page.locator('.hbar-file-markdown-preview')
      await expect(markdown.getByRole('heading', { name: 'Project notes — 项目说明', exact: true })).toBeVisible()
      await expect(markdown.locator('strong').first()).toHaveText('Read')
      await expect(markdown.locator('table')).toHaveCount(1)
      await expect(markdown.locator('img,script,iframe')).toHaveCount(0)
      const shortCode = markdown.locator('.hbar-file-markdown-code').first()
      await expect(shortCode.locator('code')).toHaveAttribute('data-code-highlight', 'ready')
      await expect(shortCode.locator('[data-code-token="keyword"]').first()).toHaveText('export')
      await expect(shortCode.locator('[data-code-token="number"]')).toHaveText('true')
      const diagram = markdown.locator('.hbar-markdown-diagram')
      await expect(diagram.locator('.hbar-diagram-inline svg')).toBeVisible()
      await diagram.getByRole('button', { name: copy.files.markdownCode.copy, exact: true }).click()
      await expect
        .poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'))
        .toBe(diagramCode)
      const opener = diagram.getByRole('button', { name: copy.files.markdownCode.diagram.preview, exact: true }).first()
      await opener.focus()
      await opener.press('Enter')
      const diagramDialog = page.getByRole('dialog', {
        name: copy.files.markdownCode.diagram.previewTitle,
        exact: true,
      })
      await expect(diagramDialog.locator('.hbar-diagram-svg svg')).toBeVisible()
      await page.screenshot({ path: info.outputPath(`markdown-diagram-preview-${scenario.locale}.png`) })
      await page.keyboard.press('Escape')
      await expect(opener).toBeFocused()
      await diagram.getByRole('button', { name: copy.files.markdownCode.diagram.source, exact: true }).click()
      await expect(diagram.locator('pre')).toHaveText(`${diagramCode}\n`)
      await diagram.getByRole('button', { name: copy.files.markdownCode.diagram.diagram, exact: true }).click()
      expect(await page.evaluate(() => 'markdownExecuted' in window)).toBe(false)
      expect(remoteRequests).toEqual([])
      const longBlock = markdown.locator('.hbar-file-markdown-code').nth(1)
      await expect(longBlock.locator('code')).toHaveAttribute('data-code-highlight', 'ready')
      await expect(longBlock.locator('[data-code-tail]')).toBeHidden()
      await longBlock.getByRole('button', { name: copy.files.markdownCode.copy, exact: true }).click()
      await expect
        .poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'))
        .toBe(longCode)
      await expect(longBlock.getByRole('button', { name: copy.files.markdownCode.copied, exact: true })).toBeVisible()
      const more = longBlock.getByRole('button', { name: copy.files.markdownCode.showMore(5), exact: true })
      await more.focus()
      await more.press('Enter')
      const less = longBlock.getByRole('button', { name: copy.files.markdownCode.showLess, exact: true })
      await expect(less).toBeFocused()
      await expect(longBlock.locator('[data-code-tail]')).toBeVisible()
      const codeBody = longBlock.locator('.hbar-message-code-body')
      await codeBody.hover()
      await page.mouse.wheel(0, 800)
      await expect.poll(() => codeBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
      expect(
        await codeBody.evaluate((element) => {
          const tail = element.querySelector('[data-code-tail]')
          if (!tail) return false
          const walker = document.createTreeWalker(tail, NodeFilter.SHOW_TEXT)
          const needle = 'Markdown file proof 25'
          let node = walker.nextNode()
          while (node && !node.textContent?.includes(needle)) node = walker.nextNode()
          if (!node?.textContent) return false
          const range = document.createRange()
          const start = node.textContent.indexOf(needle)
          range.setStart(node, start)
          range.setEnd(node, start + needle.length)
          const line = range.getBoundingClientRect()
          const pane = element.getBoundingClientRect()
          return line.top >= pane.top && line.bottom <= pane.bottom
        }),
      ).toBe(true)
      await less.press('Enter')
      await expect(more).toBeFocused()
      await expect(longBlock.locator('[data-code-tail]')).toBeHidden()
      await markdown.evaluate((element) => {
        element.scrollTop = 0
      })
      await page.screenshot({ path: info.outputPath(`markdown-read-${scenario.locale}.png`) })
      await markdown.evaluate((element) => {
        element.scrollTop = 480
      })
      const readingTop = await markdown.evaluate((element) => element.scrollTop)
      expect(readingTop).toBeGreaterThan(100)
      await page.getByRole('button', { name: copy.files.source, exact: true }).click()
      await expect(page.locator('.hbar-file-text-preview')).toContainText('# Project notes — 项目说明')
      await page.getByRole('button', { name: copy.files.edit, exact: true }).click()
      const editor = page.getByRole('textbox', { name: 'README.md', exact: true })
      const changed = text.replace('# Project notes — 项目说明', '# Revised notes — 修订说明')
      await editor.fill(changed)
      await page.getByRole('button', { name: copy.files.preview, exact: true }).click()
      await expect(markdown.getByRole('heading', { name: 'Revised notes — 修订说明', exact: true })).toBeVisible()
      await expect.poll(() => markdown.evaluate((element) => element.scrollTop)).toBe(readingTop)
      expect(await readFile(join(root, 'README.md'), 'utf8')).toBe(text)
      await page.getByRole('button', { name: copy.files.edit, exact: true }).click()
      await expect(editor).toHaveValue(changed)
      await page.getByRole('button', { name: copy.files.save, exact: true }).click()
      await expect.poll(() => readFile(join(root, 'README.md'), 'utf8')).toBe(changed)
      await page.getByRole('button', { name: copy.files.preview, exact: true }).click()
      await page.screenshot({ path: info.outputPath(`markdown-saved-${scenario.locale}.png`) })
      // An explicit local link goes through the original Files action, not browser navigation.
      await page.getByRole('button', { name: copy.files.edit, exact: true }).click()
      await editor.fill(changed + '\n[Related file](other.txt)\n')
      await page.getByRole('button', { name: copy.files.preview, exact: true }).click()
      await markdown.getByRole('button', { name: copy.files.openLinkedFile('other.txt'), exact: true }).click()
      await expect(page.locator('.hbar-file-text-preview')).toContainText('A separate ordinary text file.')
      await page.getByRole('tab', { name: copy.files.previews.tab('README.md', 'document'), exact: true }).click()
      await expect(markdown.getByRole('heading', { name: 'Revised notes — 修订说明', exact: true })).toBeVisible()
      expect(await readFile(join(root, 'README.md'), 'utf8')).toBe(changed)
      await page.getByRole('button', { name: copy.files.close, exact: true }).click()
      await expectComposerText(prompt, draft)
      expect(remoteRequests).toEqual([])
      expect(errors).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedFixture(root)
    }
  })
}
