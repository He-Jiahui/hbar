import { chromium } from '@playwright/test'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type ViewportName = 'desktop' | 'tablet' | 'mobile'

type PngSize = {
  readonly width: number
  readonly height: number
}

type CaptureRecord = {
  readonly id: string
  readonly viewport: ViewportName
  readonly referencePath: string
  readonly localPath: string
  readonly width: number
  readonly height: number
}

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5180'
const referenceRoot = process.env.HBAR_APP_UI_VISUAL_REFERENCE_ROOT
const outputRoot = process.env.HBAR_APP_UI_VISUAL_OUTPUT_ROOT ?? 'artifacts/hbar-app-ui/visual-local'
const requestedIds = new Set((process.env.HBAR_APP_UI_VISUAL_IDS ?? '').split(',').map((value) => value.trim()).filter(Boolean))
const chromePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const viewportNames: readonly ViewportName[] = ['desktop', 'tablet', 'mobile']

function requireReferenceRoot(): string {
  if (!referenceRoot) {
    throw new Error('Set HBAR_APP_UI_VISUAL_REFERENCE_ROOT to a directory containing captured component previews.')
  }
  return referenceRoot
}

async function pngSize(path: string): Promise<PngSize> {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer())
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    throw new Error(`Expected a PNG file: ${path}`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

async function waitForPreview(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // The local preview may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Preview is not reachable at ${baseUrl}`)
}

async function ensurePreview(): Promise<ReturnType<typeof Bun.spawn> | undefined> {
  try {
    await waitForPreview()
    return undefined
  } catch {
    const server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1'], { stdout: 'ignore', stderr: 'ignore' })
    await waitForPreview()
    return server
  }
}

async function referenceDirectories(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  return requestedIds.size ? names.filter((name) => requestedIds.has(`hbar-app-ui-${name}`)) : names
}

async function capture(): Promise<void> {
  const root = requireReferenceRoot()
  const server = await ensurePreview()
  const records: CaptureRecord[] = []
  const browser = await chromium.launch({ headless: true, executablePath: chromePath })

  try {
    for (const name of await referenceDirectories(root)) {
      const id = `hbar-app-ui-${name}`
      for (const viewport of viewportNames) {
        const referencePath = join(root, name, `preview-${viewport}.png`)
        try {
          await stat(referencePath)
        } catch {
          continue
        }
        const size = await pngSize(referencePath)
        const page = await browser.newPage({ viewport: size })
        try {
          await page.goto(`${baseUrl}/?mode=isolated&theme=dark&variant=${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded' })
          const canvas = page.locator(`[data-hbar-app-ui-variant="${id}"]`)
          await canvas.waitFor({ state: 'visible' })
          const localDirectory = join(outputRoot, name)
          await mkdir(localDirectory, { recursive: true })
          const localPath = join(localDirectory, `${viewport}.png`)
          await canvas.screenshot({ path: localPath })
          records.push({ id, viewport, referencePath, localPath, ...size })
        } finally {
          await page.close()
        }
      }
    }
  } finally {
    await browser.close()
    server?.kill()
  }

  await mkdir(outputRoot, { recursive: true })
  await writeFile(join(outputRoot, 'capture.json'), JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, records }, null, 2))
  console.log(JSON.stringify({ captured: records.length, variants: new Set(records.map((record) => record.id)).size, outputRoot }))
}

await capture()
