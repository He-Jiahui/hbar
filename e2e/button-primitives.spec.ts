import { expect, test } from '@playwright/test'
import { mountButtonFixture } from './support/button-fixture'
const fixtureStyles = `
  * { box-sizing: border-box; }
  html { min-block-size: 100%; background: var(--hbar-app-ui-bg); }
  body { min-block-size: 100%; margin: 0; background: var(--lumen-frost); color: var(--lumen-ink); font-family: system-ui, sans-serif; font-size: var(--lumen-font-size); }
  .button-fixture { display: flex; max-inline-size: 68rem; min-inline-size: 0; flex-direction: column; gap: 1rem; margin-inline: auto; padding: 2rem; }
  .button-fixture-header { display: flex; min-inline-size: 0; flex-direction: column; gap: .25rem; padding-block: .5rem 1rem; }
  .button-fixture-header p, .button-fixture-header h1, .button-fixture-header span, .button-fixture-card h2 { margin: 0; }
  .button-fixture-header p { color: var(--hbar-app-ui-subtle); font-size: .75rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .button-fixture-header h1 { font-size: 1.75rem; line-height: 1.2; }
  .button-fixture-header span, .button-fixture-section-heading span { color: var(--hbar-app-ui-subtle); }
  .button-fixture-card { display: flex; min-inline-size: 0; flex-direction: column; gap: 1rem; padding: 1rem; border: var(--hbar-app-ui-divider) solid var(--hbar-app-ui-border); border-radius: .75rem; background: var(--hbar-app-ui-surface-0); }
  .button-fixture-section-heading { display: flex; min-inline-size: 0; align-items: baseline; justify-content: space-between; gap: 1rem; }
  .button-fixture-section-heading h2 { font-size: 1rem; }
  .button-fixture-section-heading span { font-size: .75rem; text-align: end; }
  .button-fixture-row { display: flex; min-inline-size: 0; flex-wrap: wrap; align-items: center; gap: .75rem; }
  .button-fixture-long-label { max-inline-size: 18rem; }
  @media (max-width: 30rem) {
    .button-fixture { padding: 1rem; }
    .button-fixture-section-heading { flex-direction: column; align-items: flex-start; gap: .25rem; }
    .button-fixture-section-heading span { text-align: start; }
    .button-fixture-long-label { max-inline-size: 100%; }
  }
`

test('button primitives keep their hierarchy and boundaries across themes and narrow screens', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  for (const viewport of [
    { name: 'desktop-1024', width: 1024, height: 900 },
    { name: 'tablet-768', width: 768, height: 900 },
    { name: 'mobile-320', width: 320, height: 900 },
  ] as const) {
    for (const colorScheme of ['dark', 'light'] as const) {
      await page.setViewportSize(viewport)
      await mountButtonFixture(page, { theme: colorScheme, styles: fixtureStyles })

      await expect(page.getByRole('heading', { name: 'Button system' })).toBeVisible()
      await expect(page.getByRole('button')).toHaveCount(26)
      await expect(page.getByRole('button', { name: 'Open settings' })).toHaveAttribute('title', 'Open settings')
      await expect(page.getByRole('button', { name: 'Run unavailable' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Selected session' })).toHaveAttribute('aria-pressed', 'true')

      const measurements = await page.evaluate(() => {
        const box = (testId: string) => {
          const element = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
          if (!element) throw new Error(`Missing ${testId}`)
          const rect = element.getBoundingClientRect()
          return {
            width: rect.width,
            height: rect.height,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          }
        }
        return {
          small: box('s-button'),
          medium: box('m-button'),
          large: box('l-button'),
          defaultButton: box('default-button'),
          smallIcon: box('s-icon-button'),
          mediumIcon: box('m-icon-button'),
          largeIcon: box('l-icon-button'),
          long: box('long-button'),
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        }
      })

      expect(measurements.small.height).toBe(30)
      expect(measurements.medium.height).toBe(36)
      expect(measurements.large.height).toBe(42)
      expect(measurements.defaultButton.height).toBe(36)
      expect(Math.abs(measurements.smallIcon.width - measurements.smallIcon.height)).toBeLessThanOrEqual(1)
      expect(Math.abs(measurements.mediumIcon.width - measurements.mediumIcon.height)).toBeLessThanOrEqual(1)
      expect(Math.abs(measurements.largeIcon.width - measurements.largeIcon.height)).toBeLessThanOrEqual(1)
      expect(measurements.smallIcon.height).toBe(30)
      expect(measurements.mediumIcon.height).toBe(36)
      expect(measurements.largeIcon.height).toBe(42)
      expect(measurements.long.scrollWidth).toBeLessThanOrEqual(measurements.long.clientWidth)
      expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth)

      await page.getByRole('heading', { name: 'Button system' }).focus()
      await page.keyboard.press('Tab')
      const focusedButton = page.locator(':focus')
      await expect(focusedButton).toHaveAttribute('data-testid', 's-button')
      await expect(page.locator('button [data-edge]')).toHaveCount(0)
      await expect.poll(() => focusedButton.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
      for (const prefix of ['', 'mui-']) {
        const contained = page.getByTestId(`${prefix}contained${prefix ? '' : '-button'}`)
        const outlined = page.getByTestId(`${prefix}outlined${prefix ? '' : '-button'}`)
        const text = page.getByTestId(`${prefix}text${prefix ? '' : '-button'}`)
        const fill = await contained.evaluate((element) => {
          const style = getComputedStyle(element)
          return { background: style.backgroundColor, color: style.color }
        })
        expect(fill.background).not.toBe('rgba(0, 0, 0, 0)')
        expect(fill.background).not.toBe(fill.color)
        expect(await outlined.evaluate((element) => getComputedStyle(element).borderTopStyle)).toBe('solid')
        expect(await text.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
      }

      await page.screenshot({
        path: `artifacts/ui-redesign/buttons/after/${colorScheme}-${viewport.name}.png`,
        fullPage: true,
      })
    }
  }

  expect(errors).toEqual([])
})

test('hover interpolates the visible light and reverses continuously for native and hbar variants', async ({
  page,
}) => {
  for (const theme of ['dark', 'light'] as const) {
    await mountButtonFixture(page, { theme, styles: fixtureStyles })
    for (const id of [
      'contained-button',
      'outlined-button',
      'text-button',
      'mui-contained',
      'mui-outlined',
      'mui-text',
    ]) {
      const action = page.getByTestId(id)
      await action.hover()
      const samples = await action.evaluate((element) => {
        const transitions = element.getAnimations().filter((animation) => animation instanceof CSSTransition)
        if (
          !transitions.some(
            (animation) =>
              animation instanceof CSSTransition && animation.transitionProperty === '--lumen-effect-level',
          )
        ) {
          throw new Error('The light did not enter a real transition')
        }
        transitions.forEach((animation) => animation.pause())
        return [0, 120, 240].map((time) => {
          transitions.forEach((animation) => {
            animation.currentTime = time
          })
          const style = getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return {
            shadow: style.boxShadow,
            textShadow: style.textShadow,
            level: Number(style.getPropertyValue('--lumen-effect-level')),
            width: rect.width,
            height: rect.height,
          }
        })
      })
      const [start, middle, end] = samples
      if (!start || !middle || !end) throw new Error('Missing transition samples')
      expect(middle.level).toBeGreaterThan(start.level)
      expect(middle.level).toBeLessThan(end.level)
      const visibleLight = id.includes('text') ? 'textShadow' : 'shadow'
      expect(middle[visibleLight]).not.toBe(start[visibleLight])
      expect(middle[visibleLight]).not.toBe(end[visibleLight])
      expect(samples.map(({ width, height }) => ({ width, height }))).toEqual(
        Array(3).fill({ width: start.width, height: start.height }),
      )
      const retained = await action.evaluate((element) => {
        element.getAnimations().forEach((animation) => {
          if (animation instanceof CSSTransition) animation.currentTime = 75
        })
        return Number(getComputedStyle(element).getPropertyValue('--lumen-effect-level'))
      })
      await page.mouse.move(0, 0)
      const reversed = await action.evaluate((element) => {
        const animation = element
          .getAnimations()
          .find((value) => value instanceof CSSTransition && value.transitionProperty === '--lumen-effect-level')
        if (!animation) throw new Error('Leaving hover did not reverse the transition')
        animation.pause()
        animation.currentTime = 0
        const initial = Number(getComputedStyle(element).getPropertyValue('--lumen-effect-level'))
        const duration = Number(animation.effect?.getTiming().duration)
        animation.currentTime = duration
        const final = Number(getComputedStyle(element).getPropertyValue('--lumen-effect-level'))
        animation.play()
        return { initial, final }
      })
      expect(Math.abs(reversed.initial - retained)).toBeLessThan(0.02)
      expect(reversed.final).toBeLessThan(reversed.initial)
    }
  }
})

test('busy light breathes without dimming or allowing duplicate actions and stops after completion', async ({
  page,
}) => {
  await mountButtonFixture(page, { theme: 'dark', styles: fixtureStyles })
  const busy = page.getByTestId('busy-button')
  await expect(busy).toBeDisabled()
  await expect(busy).toHaveAttribute('aria-busy', 'true')
  expect(await busy.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
  const wave = await busy.evaluate((element) => {
    const animation = element
      .getAnimations()
      .find((value) => value instanceof CSSAnimation && value.animationName === 'lumen-breathe')
    if (!animation) throw new Error('Busy light is not breathing')
    animation.pause()
    return [0, 1300, 2600].map((time) => {
      animation.currentTime = time
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return {
        light: style.boxShadow,
        background: style.backgroundColor,
        color: style.color,
        width: rect.width,
        height: rect.height,
      }
    })
  })
  expect(wave[0]?.light).toBe(wave[2]?.light)
  expect(wave[1]?.light).not.toBe(wave[0]?.light)
  expect(wave.map(({ light: _light, ...geometry }) => geometry)).toEqual(
    Array(3).fill(
      wave[0] && { background: wave[0].background, color: wave[0].color, width: wave[0].width, height: wave[0].height },
    ),
  )
  await busy.click({ force: true })
  await expect(page.getByRole('status', { name: 'Completed actions' })).toHaveText('0')
  await page.getByRole('button', { name: 'Toggle busy state' }).click()
  await expect(busy).toBeEnabled()
  expect(await busy.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
  await busy.click()
  await expect(page.getByRole('status', { name: 'Completed actions' })).toHaveText('1')
  await expect(page.getByTestId('mui-busy')).toBeEnabled()
})

test('press and release use a short continuous light and fill transition', async ({ page }) => {
  await mountButtonFixture(page, { theme: 'dark', styles: fixtureStyles })
  for (const id of ['contained-button', 'mui-contained']) {
    const action = page.getByTestId(id)
    await action.focus()
    await page.keyboard.down('Space')
    const pressed = await action.evaluate((element) => {
      const animation = element
        .getAnimations()
        .find((value) => value instanceof CSSTransition && value.transitionProperty === '--lumen-press-level')
      if (!animation) throw new Error('Press feedback did not transition')
      animation.pause()
      return [0, 60, 120].map((time) => {
        animation.currentTime = time
        const style = getComputedStyle(element)
        return { light: style.boxShadow, fill: style.backgroundImage }
      })
    })
    expect(pressed[0]?.fill).not.toBe(pressed[1]?.fill)
    expect(pressed[1]?.fill).not.toBe(pressed[2]?.fill)
    await page.keyboard.up('Space')
    const released = await action.evaluate((element) => {
      const animation = element
        .getAnimations()
        .find((value) => value instanceof CSSTransition && value.transitionProperty === '--lumen-press-level')
      if (!animation) throw new Error('Release feedback did not transition')
      animation.pause()
      const duration = Number(animation.effect?.getTiming().duration)
      animation.currentTime = 0
      const start = getComputedStyle(element).backgroundImage
      animation.currentTime = duration
      const end = getComputedStyle(element).backgroundImage
      animation.play()
      return { duration, start, end }
    })
    expect(released.duration).toBeLessThanOrEqual(120)
    expect(released.start).not.toBe(released.end)
  }
})

test('glow and motion switches preserve shape, focus and readable busy states', async ({ page }) => {
  await mountButtonFixture(page, { theme: 'light', styles: fixtureStyles })
  await page.getByRole('button', { name: 'Toggle glow' }).click()
  expect(
    await page
      .getByTestId('contained-button')
      .evaluate((element) => getComputedStyle(element).getPropertyValue('--lumen-glow').trim()),
  ).toBe('0')
  await page.getByRole('heading', { name: 'Button system' }).focus()
  await page.keyboard.press('Tab')
  expect(await page.locator(':focus').evaluate((element) => getComputedStyle(element).outlineWidth)).toBe('2px')
  expect(
    await page.getByTestId('outlined-button').evaluate((element) => getComputedStyle(element).borderTopStyle),
  ).toBe('solid')
  await page.getByRole('button', { name: 'Toggle motion' }).click()
  for (const id of ['busy-button', 'mui-busy']) {
    const action = page.getByTestId(id)
    expect(await action.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
    expect(await action.evaluate((element) => getComputedStyle(element).transitionProperty)).toBe('none')
    await expect(action).toBeDisabled()
  }
  await page.getByRole('button', { name: 'Toggle motion' }).click()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await page.getByTestId('busy-button').evaluate((element) => element.getAnimations().length)).toBe(0)
  expect(await page.getByTestId('mui-busy').evaluate((element) => getComputedStyle(element).transitionProperty)).toBe(
    'none',
  )
  expect(
    await page.getByTestId('mui-busy').evaluate((element) => element.getAnimations({ subtree: true }).length),
  ).toBe(0)
})
