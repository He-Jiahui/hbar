import { afterEach, expect, test } from 'bun:test'
import { updateAppearance } from './appearance-model'
import { useWorkbench } from './stores'

const initial = useWorkbench.getState()
afterEach(() => useWorkbench.setState(initial))
test('appearance actions persist supported domain IDs and ignore removed or unsupported choices', () => {
  updateAppearance({ type: 'theme', id: 'white' })
  updateAppearance({ type: 'language', id: 'en-US' })
  expect(useWorkbench.getState()).toMatchObject({ theme: 'white', locale: 'en-US' })
  updateAppearance({ type: 'theme', id: 'missing' })
  updateAppearance({ type: 'language', id: 'missing' })
  updateAppearance({ type: 'toggle', id: 'unavailable', enabled: true })
  expect(useWorkbench.getState()).toMatchObject({ theme: 'white', locale: 'en-US' })
})
