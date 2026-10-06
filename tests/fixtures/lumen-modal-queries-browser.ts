import { getOpenModalSurfaces, hasOpenModalSurface, registerFloatingSurface } from '@lumen/app-ui'
import { getOpenModalSurfaces as queryUiModals } from '@lumen/app-ui/ui'

declare global {
  interface Window {
    verifyLumenModalQueries: () => readonly string[]
  }
}

window.verifyLumenModalQueries = () => {
  const checked: string[] = []
  const native = document.createElement('dialog')
  const registered = document.createElement('div')
  const anchored = document.createElement('div')
  const iframe = document.createElement('iframe')
  document.body.append(native, registered, anchored, iframe)
  const disposeModal = registerFloatingSurface({ id: 'query-modal', mode: 'modal', element: registered, close() {} })
  const disposeAnchored = registerFloatingSurface({
    id: 'query-anchor',
    mode: 'anchored',
    element: anchored,
    parentId: 'query-modal',
    close() {},
  })
  const check = (name: string, expected: readonly HTMLElement[]) => {
    const actual = getOpenModalSurfaces(document)
    if (actual.length !== expected.length || actual.some((element, index) => element !== expected[index]))
      throw new Error(`Incorrect modal ownership: ${name}`)
    if (hasOpenModalSurface(document) !== expected.length > 0) throw new Error(`Incorrect modal presence: ${name}`)
    checked.push(name)
  }
  try {
    if (getOpenModalSurfaces !== queryUiModals) throw new Error('Public entries have different modal coordinators')
    check('registered modal excludes anchored descendants', [registered])
    native.showModal()
    check('native modal and registered modal share the guard', [native, registered])
    if (!iframe.contentDocument || getOpenModalSurfaces(iframe.contentDocument).length)
      throw new Error('Modal ownership crossed documents')
    checked.push('document ownership')
    native.close()
    registered.hidden = true
    check('hidden registration', [])
    registered.hidden = false
    registered.inert = true
    check('inert registration', [])
    registered.inert = false
    registered.setAttribute('aria-hidden', 'true')
    check('aria hidden registration', [])
    registered.removeAttribute('aria-hidden')
    registered.remove()
    check('detached registration', [])
    document.body.append(registered)
    check('reconnected registration', [registered])
    disposeModal()
    check('disposed registration', [])
    return checked
  } finally {
    disposeAnchored()
    disposeModal()
    native.close()
    native.remove()
    registered.remove()
    anchored.remove()
    iframe.remove()
  }
}
