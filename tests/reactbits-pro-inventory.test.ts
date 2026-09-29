import { afterAll, beforeAll, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from '@playwright/test'
import { readReferenceVariantCards } from '../scripts/reactbits-pro-audit'

let browser: Browser
let page: Page

beforeAll(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  })
  page = await browser.newPage()
})

afterAll(async () => {
  await browser?.close()
})

function card(preview: string, description = 'Provider-first sign-in column with a company domain.') {
  return `<a href="https://pro.reactbits.dev/docs/app-ui/authentication/authentication-2">
    <div>${preview}</div>
    <div><div><div><span> authentication-2 </span></div><p> ${description} </p></div></div>
  </a>`
}

test('inventory metadata is independent of lazy loading and mounted preview copy', async () => {
  await page.setContent(card('<span>Loading preview…</span>'))
  const loading = await page.locator('a').evaluateAll(readReferenceVariantCards, 'authentication')
  await page.setContent(
    card('<h1>Sign in</h1><p>Unrelated form copy</p><span>Northwind</span><button>Sign in</button>'),
  )
  const mounted = await page.locator('a').evaluateAll(readReferenceVariantCards, 'authentication')
  expect(loading).toEqual(mounted)
  expect(mounted).toEqual([
    {
      sourceId: 'authentication-2',
      href: 'https://pro.reactbits.dev/docs/app-ui/authentication/authentication-2',
      title: 'authentication-2',
      description: 'Provider-first sign-in column with a company domain.',
    },
  ])
})

test('inventory normalizes each semantic field without merging title and description', async () => {
  await page.setContent(
    card('<span>Loading preview…</span>', 'Provider-first\n  sign-in column\twith a company domain.') +
      '<a href="https://pro.reactbits.dev/docs/app-ui/authentication">Category</a>' +
      '<a href="https://pro.reactbits.dev/docs/app-ui/forms/forms-2">Other category</a>',
  )
  const result = await page.locator('a').evaluateAll(readReferenceVariantCards, 'authentication')
  expect(result).toHaveLength(1)
  expect(result[0]?.title).toBe('authentication-2')
  expect(result[0]?.description).toBe('Provider-first sign-in column with a company domain.')
})

test('inventory rejects missing metadata rather than accepting preview text as a title', async () => {
  await page.setContent(card('<h1>Sign in</h1><p>Preview description</p>', ''))
  await expect(page.locator('a').evaluateAll(readReferenceVariantCards, 'authentication')).rejects.toThrow(
    'React Bits card metadata is missing for authentication-2',
  )
})
