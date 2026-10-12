import { expect, test } from '@playwright/test'
import {
  createConfigurationCommandClient,
  createGoalPlanCommandClient,
  createModelCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'
import { preSessionLaunchCopy } from '../apps/web/src/pre-session-launch-copy'
import { sessionImageCopy } from '../apps/web/src/session-image-copy'
import { imageFile } from './support/image-file'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

type UploadedArtifact = { readonly id: string; readonly name: string; readonly mime: string; readonly size: number }
type EntryMode = 'plan' | 'goal'

const fileName = 'desktop-session-attachment-review-evidence-with-a-long-readable-name.txt'
const imageName = 'desktop-session-attachment-reference-image-with-a-long-readable-name.png'
const imageBytes = imageFile(2, imageName).buffer
const captureDirectory = process.env.HBAR_E2E_CAPTURE_DIRECTORY ?? 'artifacts/pre-session-images'

test.use({ actionTimeout: 10_000 })

async function removeOwnedTemporaryDirectory(path: string, expectedPrefix: string): Promise<void> {
  const target = resolve(path)
  const temporaryRoot = resolve(tmpdir())
  if (dirname(target) !== temporaryRoot || !basename(target).startsWith(expectedPrefix))
    throw new Error(`Refusing to remove unexpected E2E temporary path: ${target}`)
  await rm(target, { recursive: true, force: true })
}

for (const entryMode of ['plan', 'goal'] as const satisfies readonly EntryMode[]) {
  test(`no-tab ${entryMode} keeps file and image references through first send`, async ({ browser }) => {
    test.setTimeout(180_000)
    await mkdir(join(process.cwd(), captureDirectory), { recursive: true })

    for (const locale of ['en-US', 'zh-CN'] as const) {
      const root = await mkdtemp(join(tmpdir(), `hbar-pre-session-attachments-${entryMode}-`))
      const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
      const copy = getShellCopy(locale)
      const labels = preSessionCopy(locale)
      const location = preSessionLaunchCopy(locale).location
      const imageLabels = sessionImageCopy(locale)
      let host: WebSessionHost | undefined
      try {
        host = await startWebSessionHost({
          root,
          port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
          goalAutoContinue: false,
        })
        const sessions = createWorkspaceSessionCommandClient(host.client)
        const models = createModelCommandClient(host.client)
        const goals = createGoalPlanCommandClient(host.client)
        const configuration = createConfigurationCommandClient(host.client)
        const fixtureModel = (await models.execute('model.list', {})).find((item) => item.id === 'local-fixture')
        expect(fixtureModel).toBeDefined()
        const listSessions = () =>
          sessions.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 })
        const initialSnapshot = await host.client.call('session.snapshot', {
          sessionId: host.ready.sessionId,
          limit: 10,
        })
        expect(initialSnapshot.runs).toHaveLength(0)

        const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
        expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
          true,
        )
        const page = await context.newPage()
        const errors: string[] = []
        const uploaded: UploadedArtifact[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.route('**/api/artifacts', async (route) => {
          if (route.request().method() !== 'POST') {
            await route.continue()
            return
          }
          const response = await route.fetch()
          uploaded.push((await response.json()) as UploadedArtifact)
          await route.fulfill({ response })
        })

        await page.goto(base)
        const landing = page.locator('.hbar-pre-session-landing')
        const prompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input, exact: true })
        await expect(landing.getByRole('heading', { level: 1, name: copy.preSession.hero.title })).toBeVisible()
        await expect(page.getByRole('tab')).toHaveCount(0)
        expect((await listSessions()).items).toHaveLength(1)

        const add = landing.getByRole('button', { name: copy.session.addMenu.open, exact: true })
        const addMenu = landing.getByRole('group', { name: copy.session.addMenu.menu, exact: true })
        await add.click()
        const filesAction = addMenu.getByRole('button', { name: copy.session.addMenu.files, exact: true })
        await expect(filesAction).toBeVisible()
        await filesAction.click()
        const fileInput = page.locator('.hbar-composer-add-root input[type="file"]')
        await fileInput.setInputFiles(
          entryMode === 'plan'
            ? [
                { name: fileName, mimeType: 'text/plain', buffer: Buffer.from('first-send file reference') },
                { name: imageName, mimeType: 'image/png', buffer: imageBytes },
              ]
            : { name: fileName, mimeType: 'text/plain', buffer: Buffer.from('first-send file reference') },
        )

        if (entryMode === 'goal') {
          const droppedImage = await page.evaluateHandle(
            ({ name, bytes }) => {
              const data = new DataTransfer()
              data.items.add(new File([Uint8Array.from(bytes)], name, { type: 'image/png' }))
              return data
            },
            { name: imageName, bytes: Array.from(imageBytes) },
          )
          await page.locator('.hbar-composer-attachment-target').dispatchEvent('drop', { dataTransfer: droppedImage })
        }

        await expect(landing.locator('.hbar-image-file-chip')).toHaveCount(1)
        const imageTile = landing.locator('[data-image-occurrence]')
        await expect(imageTile).toHaveCount(1)
        await expect(imageTile.locator('img')).toBeVisible()
        await expect
          .poll(() => imageTile.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
          .toBeGreaterThan(0)
        await expect(landing.locator('.lumen-attachment-chip').filter({ hasText: fileName })).toBeVisible()
        await expect.poll(() => uploaded.length).toBe(2)
        expect(uploaded.map((artifact) => artifact.name).sort()).toEqual([fileName, imageName].sort())
        expect((await listSessions()).items).toHaveLength(1)
        expect(
          (await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 10 })).runs,
        ).toHaveLength(0)

        const openImage = imageTile.getByRole('button', { name: imageLabels.open(imageName), exact: true })
        await openImage.click()
        const gallery = page.getByRole('dialog', { name: imageLabels.gallery.title, exact: true })
        await expect(gallery).toBeVisible()
        await expect(gallery.locator('.lumen-image-gallery-media img')).toBeVisible()
        await page.screenshot({ path: `${captureDirectory}/gallery-${entryMode}-${locale}.png` })
        await page.keyboard.press('Escape')
        await expect(gallery).toBeHidden()
        await expect(openImage).toBeFocused()

        for (const width of [1440, 320]) {
          await page.setViewportSize({ width, height: width === 320 ? 720 : 900 })
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          await expect(landing.getByRole('heading', { level: 1, name: copy.preSession.hero.title })).toBeVisible()
          await expect(prompt).toBeVisible()
          const flow = await landing.evaluate((element) => {
            const hero = element.querySelector('.hbar-pre-session-landing-main')!.getBoundingClientRect()
            const footer = element.querySelector('.hbar-pre-session-landing-footer')!.getBoundingClientRect()
            return hero.bottom <= footer.top + 1
          })
          expect(flow).toBe(true)
          await page.screenshot({
            path: `${captureDirectory}/${entryMode}-${locale}-${width}.png`,
            fullPage: true,
          })
        }

        const initialMessage = `Keep these attachments in the ${entryMode} first send (${locale}).`
        if (entryMode === 'goal') {
          await add.click()
          await addMenu.getByRole('button', { name: copy.session.intent.goalMenu, exact: true }).click()
          await expect(prompt).toHaveAttribute('placeholder', copy.session.intent.goalPlaceholder)
        }
        await prompt.fill(initialMessage)
        const locationTrigger = landing.locator('.hbar-pre-session-location-picker > button')
        await locationTrigger.click()
        const locationRootBeforeDirectory = page.getByRole('dialog', { name: location.title, exact: true })
        if (await locationRootBeforeDirectory.isVisible())
          await locationRootBeforeDirectory.getByRole('button', { name: new RegExp(`^${location.directory}`) }).click()
        const projects = page.getByRole('dialog', { name: location.chooseDirectory, exact: true })
        await projects.getByRole('button', { name: new RegExp(host.ready.workspaceName) }).click()
        const locationRoot = page.getByRole('dialog', { name: location.title, exact: true })
        await expect(locationRoot).toBeVisible()
        await locationRoot.getByRole('button', { name: location.close, exact: true }).click()
        await landing.getByRole('button', { name: labels.model.trigger(null) }).click()
        await page
          .getByRole('dialog', { name: labels.model.title })
          .getByRole('button', { name: new RegExp(fixtureModel!.modelName) })
          .click()

        if (entryMode === 'plan') {
          const approval = landing.locator('.hbar-pre-session-approval-picker .hbar-composer-permission-trigger')
          await approval.click()
          await page
            .locator('.hbar-pre-session-approval-popover')
            .getByRole('menuitemradio', { name: new RegExp(copy.session.permissionPicker.plan.label) })
            .click()
          await expect(prompt).toHaveAttribute('placeholder', copy.session.intent.planPlaceholder)
        }

        expect((await listSessions()).items).toHaveLength(1)
        expect(
          (await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 10 })).runs,
        ).toHaveLength(0)
        await page.screenshot({ path: `${captureDirectory}/ready-${entryMode}-${locale}-320.png` })
        await landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true }).click()
        await expect(page.getByRole('tab')).toHaveCount(1)

        let createdSessionId: string | null = null
        await expect
          .poll(async () => {
            const created = (await listSessions()).items.find((item) => item.id !== host!.ready.sessionId)
            createdSessionId = created?.id ?? null
            return createdSessionId
          })
          .not.toBeNull()
        expect((await listSessions()).items).toHaveLength(2)
        const sessionId = createdSessionId!
        await expect
          .poll(async () => {
            const latest = await host!.client.call('session.snapshot', { sessionId, limit: 20 })
            return latest.runs.length
          })
          .toBe(1)
        const sent = await host.client.call('session.snapshot', { sessionId, limit: 20 })
        expect(sent.runs).toHaveLength(1)
        expect(sent.runs[0]?.input.text).toBe(initialMessage)
        const sentRefs = [...sent.runs[0]!.input.images, ...(sent.runs[0]!.input.files ?? [])]
        expect(sentRefs).toHaveLength(2)
        const refKey = ({ id, name, mime, size }: UploadedArtifact) => `${id}|${name}|${mime}|${size}`
        expect(sentRefs.map(refKey).sort()).toEqual(uploaded.map(refKey).sort())
        const composer = page.locator('.hbar-app-react-session-footer')
        await expectComposerText(composer.getByRole('textbox', { name: copy.session.prompt.input, exact: true }), '')
        await expect(composer.locator('.hbar-draft-image-content')).toHaveCount(0)
        await expect(composer.locator('.lumen-attachment-chip')).toHaveCount(0)
        await page.screenshot({ path: `${captureDirectory}/accepted-${entryMode}-${locale}-320.png` })
        if (entryMode === 'plan') {
          const mode = await configuration.execute('mode.get', { sessionId })
          expect(mode.mode).toBe('plan')
        } else {
          await expect
            .poll(async () => (await goals.execute('goal.get', { sessionId })).goal?.objective ?? null)
            .toBe(initialMessage)
        }
        expect(errors).toEqual([])
      } finally {
        await context.close()
        if (host) await stopWebSessionHost(host)
        const expectedPrefix = `hbar-pre-session-attachments-${entryMode}-`
        await removeOwnedTemporaryDirectory(root, expectedPrefix)
      }
    }
  })
}
