import { renderToStaticMarkup } from 'react-dom/server'
import { buttonPrimitiveFixture } from './button-primitives'

process.stdout.write(renderToStaticMarkup(buttonPrimitiveFixture))
