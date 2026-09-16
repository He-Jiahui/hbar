import { describe, expect, test } from 'bun:test'
import * as production from '../packages/hbar-app-ui/src/production'
import { listHbarAppUiVariants } from '../packages/hbar-app-ui/src/catalog'

describe('app-ui production boundary', () => {
  test('keeps the catalog opt-in while preserving its stable registrations', () => {
    expect(production.HbarAppUiRunActivity).toBeFunction()
    expect(Object.keys(production)).not.toContain('listHbarAppUiVariants')
    expect(Object.keys(production)).not.toContain('HBAR_APP_UI_VARIANT_SPECS')
    expect(new Set(listHbarAppUiVariants().map(({ spec }) => spec.id)).size).toBe(300)
  })

  test('bundling the public production entry does not traverse catalog or fixtures', async () => {
    const inputs = new Set<string>()
    const result = await Bun.build({
      entrypoints: [
        'packages/hbar-app-ui/src/production.ts',
        'packages/hbar-app-ui/src/ai-usage.ts',
        'packages/hbar-app-ui/src/app-dialog.ts',
        'packages/hbar-app-ui/src/settings-form.ts',
        'packages/hbar-app-ui/src/authentication.ts',
        'packages/hbar-app-ui/src/forms.ts',
      ],
      target: 'browser',
      external: ['react', 'react/jsx-runtime', 'lucide-react'],
      plugins: [
        {
          name: 'observe-production-dependencies',
          setup(build) {
            build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (args) => {
              inputs.add(args.path.replaceAll('\\', '/'))
              return undefined
            })
          },
        },
      ],
    })
    expect(result.success).toBe(true)
    expect(inputs.size).toBeGreaterThan(1)
    expect(
      [...inputs].filter((path) => /\/(fixtures|profiles|specs|registry|variants|catalog)(\/|\.)/.test(path)),
    ).toEqual([])
  })
})
