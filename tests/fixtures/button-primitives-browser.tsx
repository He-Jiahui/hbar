import { createRoot } from 'react-dom/client'
import '@lumen/app-ui/styles.css'
import '../../packages/hbar-app-ui/src/theme.css'
import { buttonPrimitiveFixture } from './button-primitives'

const root = document.getElementById('fixture-root')
if (!root) throw new Error('The button fixture mount is missing')
createRoot(root).render(buttonPrimitiveFixture)
