import { createRoot } from 'react-dom/client'
import { HBAR_APP_UI_VARIANT_SPECS } from 'hbar-app-ui/catalog-metadata'
import { componentGalleryCopy } from '../../../tests/fixtures/component-gallery-copy'
import { ComponentGallery } from './ComponentGallery'
import { componentGalleryEntries, readComponentGalleryState } from './component-gallery-model'
import { createComponentGalleryStore } from './component-gallery-store'
import 'hbar-app-ui/theme.css'
import './component-gallery.css'

const store = createComponentGalleryStore(readComponentGalleryState(new URLSearchParams(window.location.search)))
const entries = componentGalleryEntries(HBAR_APP_UI_VARIANT_SPECS)
const root = document.getElementById('root')
if (!root) throw new Error('Missing component gallery root')
createRoot(root).render(<ComponentGallery entries={entries} store={store} copies={componentGalleryCopy} />)
