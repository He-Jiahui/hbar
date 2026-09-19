import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarAppUiDialog } from '../packages/hbar-app-ui/src/app-dialog'

test('chromeless native dialog keeps an accessible host title without duplicating visible chrome', () => {
  const html = renderToStaticMarkup(
    createElement(HbarAppUiDialog, {
      open: true,
      chromeless: true,
      title: 'Host-owned command catalog',
      closeLabel: 'Close catalog',
      onClose: () => {},
      children: createElement('section', null, 'Host-owned modal content'),
    }),
  )
  expect(html).toContain('aria-label="Host-owned command catalog"')
  expect(html).toContain('Host-owned modal content')
  expect(html).not.toContain('<header>')
  expect(html).not.toContain('Close catalog')
})
