import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { auditResponsiveCss, lumenProductionCss, validateResponsiveRule } from '../../../scripts/check-responsive-contracts'

async function removeOwnedFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-responsive-'))
    throw new Error(`Unexpected responsive fixture path: ${target}`)
  await rm(target, { recursive: true, force: true })
}

describe('responsive CSS contracts', () => {
  it('allows only the shared half-open viewport boundaries', () => {
    expect(validateResponsiveRule('media', '(width < 40rem) and (width >= 40rem)')).toEqual([])
    expect(validateResponsiveRule('media', '(width <= 40rem)')).not.toHaveLength(0)
    expect(validateResponsiveRule('media', '(width < 42rem)')).not.toHaveLength(0)
    expect(validateResponsiveRule('media', '(max-width: 40rem)')).not.toHaveLength(0)
  })

  it('allows component-specific container geometry with half-open rem comparisons', () => {
    expect(validateResponsiveRule('container', 'provider-dialog (width < 80rem)')).toEqual([])
    expect(validateResponsiveRule('container', 'provider-dialog (width <= 80rem)')).not.toHaveLength(0)
    expect(validateResponsiveRule('container', 'provider-dialog (max-width: 48rem)')).not.toHaveLength(0)
  })

  it('fails closed with the import path when production CSS is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-responsive-contract-'))
    const source = join(root, 'packages/lumen-app-ui/src')
    try {
      await mkdir(source, { recursive: true })
      await writeFile(join(source, 'styles.css'), "@import './missing.css';\n")
      await writeFile(join(source, 'workbench-component-styles.ts'), '')

      await expect(lumenProductionCss(root)).rejects.toThrow('missing.css')
    } finally {
      await removeOwnedFixture(root)
    }
  })

  it('rejects named container queries without a production container declaration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-responsive-container-'))
    const lumenSource = join(root, 'packages/lumen-app-ui/src')
    const webSource = join(root, 'apps/web/src')
    const appReactSource = join(root, 'packages/app-react/src')
    try {
      await Promise.all([
        mkdir(lumenSource, { recursive: true }),
        mkdir(webSource, { recursive: true }),
        mkdir(appReactSource, { recursive: true }),
      ])
      await writeFile(join(lumenSource, 'styles.css'), "@import './component.css';\n")
      await writeFile(join(lumenSource, 'component.css'), '@container missing-pane (width < 40rem) { .item { display: none; } }\n')
      await writeFile(join(lumenSource, 'workbench-component-styles.ts'), '')

      const result = await auditResponsiveCss(root)
      expect(result.errors.some((error) => error.includes('@container missing-pane (width < 40rem) has no declared named container.'))).toBe(
        true,
      )
    } finally {
      await removeOwnedFixture(root)
    }
  })

  it('keeps the production CSS graph within contract', async () => {
    const result = await auditResponsiveCss()
    expect(result.cssFiles).toBeGreaterThan(200)
    expect(result.widthQueries).toBeGreaterThan(100)
    expect(result.widthConditions).toBeGreaterThan(result.widthQueries)
    expect(result.errors).toEqual([])
  })
})
