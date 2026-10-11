import { expect, test } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { workbenchAcceptanceCopy } from '../tests/fixtures/workbench-acceptance-copy'
import { stopOwnedWebSessionHostChild } from './support/web-session-host'

let server: ChildProcess
const origin = 'http://127.0.0.1:5197'
test.beforeAll(async () => {
  server = spawn(
    'bun',
    [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--config',
      'apps/hbar-app-ui-preview/vite.config.ts',
      '--host',
      '127.0.0.1',
      '--port',
      '5197',
      '--strictPort',
    ],
    { stdio: 'pipe', windowsHide: true },
  )
  await expect
    .poll(async () => {
      if (server.exitCode !== null) throw new Error('Owned preview server exited')
      return fetch(`${origin}/workbench-acceptance.html`)
        .then((response) => response.ok)
        .catch(() => false)
    })
    .toBe(true)
})
test.afterAll(async () => {
  if (server) await stopOwnedWebSessionHostChild(server)
})

for (const locale of ['zh-CN', 'en-US'] as const)
  for (const theme of ['dark', 'light'] as const) {
    test(`semantic preview capacity, full copy and smooth state feedback: ${locale} ${theme}`, async ({ browser }) => {
      test.setTimeout(90000)
      const context = await browser.newContext({
        locale,
        colorScheme: theme,
        permissions: ['clipboard-read', 'clipboard-write'],
      })
      const page = await context.newPage()
      const copy = workbenchAcceptanceCopy[locale]
      const directory = `artifacts/visual-upgrade/acceptance/${locale}-${theme}`
      await mkdir(directory, { recursive: true })
      try {
        await page.goto(`${origin}/workbench-acceptance.html?locale=${locale}&theme=${theme}`)
        await expect(page.getByRole('heading', { name: copy.title, exact: true })).toBeVisible()
        const contrast = await page.locator('[data-text-context]').evaluateAll((nodes) => {
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 1
          const context = canvas.getContext('2d')!
          const rgba = (color: string) => {
            context.clearRect(0, 0, 1, 1)
            context.fillStyle = color
            context.fillRect(0, 0, 1, 1)
            return [...context.getImageData(0, 0, 1, 1).data]
          }
          const blend = (front: number[], back: number[]) => {
            const alpha = (front[3] ?? 255) / 255
            return front
              .slice(0, 3)
              .map((value, index) => value * alpha + (back[index] ?? 255) * (1 - alpha))
              .concat(255)
          }
          const luminance = (color: number[]) =>
            color.slice(0, 3).reduce((sum, value, index) => {
              const scaled = value / 255
              return (
                sum +
                (scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4) *
                  [0.2126, 0.7152, 0.0722][index]!
              )
            }, 0)
          return nodes
            .filter((node) => (node as HTMLElement).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
            .map((node) => {
              let parent: Element | null = node
              const backgrounds: number[][] = []
              while (parent) {
                backgrounds.push(rgba(getComputedStyle(parent).backgroundColor))
                parent = parent.parentElement
              }
              const background = backgrounds
                .reverse()
                .reduce((color, layer) => blend(layer, color), [255, 255, 255, 255])
              const style = getComputedStyle(node)
              const foreground = blend(rgba(style.color), background)
              const first = luminance(foreground),
                second = luminance(background)
              const ratio = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
              const large =
                parseFloat(style.fontSize) >= 24 ||
                (parseFloat(style.fontSize) >= 18.66 && parseFloat(style.fontWeight) >= 700)
              return {
                text: node.textContent?.trim(),
                context: node.getAttribute('data-text-context'),
                ratio,
                minimum: large ? 3 : 4.5,
              }
            })
        })
        await writeFile(`${directory}/contrast.json`, JSON.stringify(contrast, null, 2))
        expect(contrast.filter((sample) => sample.ratio < sample.minimum)).toEqual([])
        for (const width of [320, 768, 1088, 1440, 1920]) {
          await page.setViewportSize({ width, height: width === 768 ? 480 : 960 })
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          const violation = await page
            .locator('[data-text-flow="single"]')
            .evaluateAll((nodes) =>
              nodes
                .filter(
                  (node) =>
                    getComputedStyle(node).whiteSpace !== 'nowrap' ||
                    getComputedStyle(node).textOverflow === 'ellipsis',
                )
                .map((node) => node.textContent),
            )
          expect(violation).toEqual([])
          await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true })
        }
        await page.setViewportSize({ width: 320, height: 720 })
        const trigger = page.getByRole('button', { name: copy.more, exact: true })
        await trigger.click()
        await expect(page.getByRole('button', { name: copy.permission, exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(trigger).toBeFocused()
        await page.getByRole('button', { name: copy.primary, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: copy.dialog, exact: true })
        await expect(dialog).toBeVisible()
        const body = dialog.locator('[data-text-context="dialog.body"]')
        await expect(body).toHaveText(copy.dialogBody)
        expect(await body.evaluate((node) => getComputedStyle(node).whiteSpace)).not.toBe('nowrap')
        await page.screenshot({ path: `${directory}/dialog-320.png` })
        await page.keyboard.press('Escape')
        await expect(page.getByRole('button', { name: copy.primary, exact: true })).toBeFocused()
        await page.getByText(copy.details, { exact: true }).click()
        await page.getByRole('button', { name: copy.copy, exact: true }).click()
        await expect(page.getByRole('button', { name: copy.copied, exact: true })).toBeVisible()
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(copy.command)
        await page.setViewportSize({ width: 1440, height: 960 })
        const action = page.getByRole('button', { name: copy.primary, exact: true })
        const sample = () =>
          action.evaluate((node) => {
            const style = getComputedStyle(node)
            const box = node.getBoundingClientRect()
            return {
              level: Number(style.getPropertyValue('--lumen-effect-level')),
              width: box.width,
              height: box.height,
              animation: style.animationName,
            }
          })
        await page.mouse.move(1, 1)
        await page.waitForTimeout(300)
        const start = await sample()
        // Sample the actual CSS transition on its browser timeline. Separate CDP
        // round trips can otherwise compare different instants under CPU load.
        await action.evaluate((node) => {
          type MotionSample = { level: number; width: number; height: number; animation: string }
          type MotionTarget = HTMLElement & {
            acceptanceMotion?: {
              middle?: MotionSample
              reverse?: MotionSample
              enterDuration?: number
              reverseDuration?: number
              reverseTransition?: Animation
            }
          }
          const target = node as MotionTarget
          const motion: NonNullable<MotionTarget['acceptanceMotion']> = {}
          target.acceptanceMotion = motion
          const capture = (): MotionSample => {
            const style = getComputedStyle(target)
            const box = target.getBoundingClientRect()
            return {
              level: Number(style.getPropertyValue('--lumen-effect-level')),
              width: box.width,
              height: box.height,
              animation: style.animationName,
            }
          }
          const effectTransition = () => {
            // Flush the :hover change before finding its native CSSTransition.
            getComputedStyle(target).getPropertyValue('--lumen-effect-level')
            const transition = target
              .getAnimations()
              .find((animation) => animation instanceof CSSTransition && animation.transitionProperty === '--lumen-effect-level')
            if (!transition) throw new Error('The effect intensity must have a CSS transition')
            return transition
          }
          target.addEventListener(
            'pointerenter',
            () => {
              const transition = effectTransition()
              const duration = transition.effect?.getComputedTiming().duration
              if (typeof duration !== 'number' || duration <= 0) throw new Error('Hover transition must animate')
              motion.enterDuration = duration
              transition.pause()
              transition.currentTime = duration / 3
              motion.middle = capture()
            },
            { once: true },
          )
          target.addEventListener(
            'pointerleave',
            () => {
              const transition = effectTransition()
              const duration = transition.effect?.getComputedTiming().duration
              if (typeof duration !== 'number' || duration <= 0) throw new Error('Reverse transition must animate')
              motion.reverseDuration = duration
              transition.pause()
              transition.currentTime = 0
              motion.reverse = capture()
              motion.reverseTransition = transition
            },
            { once: true },
          )
        })
        await action.hover()
        await page.mouse.move(1, 1)
        const motion = await action.evaluate((node) => {
          const target = node as HTMLElement & {
            acceptanceMotion?: {
              middle?: { level: number; width: number; height: number; animation: string }
              reverse?: { level: number; width: number; height: number; animation: string }
              enterDuration?: number
              reverseDuration?: number
              reverseTransition?: Animation
            }
          }
          const motion = target.acceptanceMotion
          if (!motion?.middle || !motion.reverse || !motion.reverseTransition) throw new Error('Native pointer transition samples missing')
          motion.reverseTransition.play()
          return {
            middle: motion.middle,
            reverse: motion.reverse,
            enterDuration: motion.enterDuration,
            reverseDuration: motion.reverseDuration,
          }
        })
        const { middle, reverse } = motion
        await page.waitForTimeout(300)
        const end = await sample()
        expect(middle.level).toBeGreaterThan(start.level)
        expect(middle.level).toBeLessThan(0.29)
        expect(Math.abs(reverse.level - middle.level)).toBeLessThan(0.001)
        expect(Math.abs(end.level - start.level)).toBeLessThan(0.01)
        expect(new Set([start, middle, reverse, end].map((state) => `${state.width}:${state.height}`)).size).toBe(1)
        const running = page.getByRole('button', { name: copy.toggleRun, exact: true })
        expect(await running.evaluate((node) => getComputedStyle(node).animationName)).toContain('lumen-breathe')
        await page.getByRole('button', { name: copy.motion, exact: true }).click()
        expect(await running.evaluate((node) => getComputedStyle(node).animationName)).toBe('none')
        await page.getByRole('button', { name: copy.motion, exact: true }).click()
        await page.emulateMedia({ reducedMotion: 'reduce' })
        expect(await running.evaluate((node) => getComputedStyle(node).animationName)).toBe('none')
        await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' })
        await action.focus()
        expect(await action.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe('none')
        await page.emulateMedia({ forcedColors: 'none' })
        await page.getByRole('button', { name: copy.glow, exact: true }).click()
        expect(await running.evaluate((node) => Number(getComputedStyle(node).getPropertyValue('--lumen-glow')))).toBe(
          0,
        )
        await writeFile(
          `${directory}/motion.json`,
          JSON.stringify(
            { start, ...motion, end, reducedMotion: true, forcedColorsFocus: true, completeClipboard: true },
            null,
            2,
          ),
        )
      } finally {
        await context.close()
      }
    })
  }
