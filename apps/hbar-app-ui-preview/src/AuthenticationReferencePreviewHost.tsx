import type { ReactNode } from 'react'
import type { LumenAuthContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { Authentication2PreviewHost } from './Authentication2PreviewHost'
import { Authentication3PreviewHost } from './Authentication3PreviewHost'
import { Authentication4PreviewHost } from './Authentication4PreviewHost'
import { Authentication5PreviewHost } from './Authentication5PreviewHost'
import { AuthenticationPreviewHost } from './AuthenticationPreviewHost'
import type { Authentication2PreviewFixture } from './authentication2PreviewFixtures'
import type { Authentication3PreviewFixture } from './authentication3PreviewFixtures'
import type { Authentication4PreviewFixture } from './authentication4PreviewFixtures'

interface AuthenticationReferencePreviewHostProps extends HbarAppUiVariantProps {
  readonly content: LumenAuthContent
  readonly referenceFixture: Authentication2PreviewFixture
  readonly quoteReferenceFixture: Authentication3PreviewFixture
  readonly twoStepReferenceFixture?: Authentication4PreviewFixture | undefined
  readonly children: ReactNode
}

/** Reference hosts own their state without activating legacy multi-variant timers. */
export function AuthenticationReferencePreviewHost(props: AuthenticationReferencePreviewHostProps) {
  if (props.spec.category === 'authentication') {
    if (props.spec.variant === 2) return <Authentication2PreviewHost {...props} />
    if (props.spec.variant === 3)
      return <Authentication3PreviewHost {...props} referenceFixture={props.quoteReferenceFixture} />
    if (props.spec.variant === 4 && props.twoStepReferenceFixture)
      return <Authentication4PreviewHost {...props} referenceFixture={props.twoStepReferenceFixture} />
    if (props.spec.variant === 5 && props.content.magicLink) return <Authentication5PreviewHost {...props} />
  }
  return <AuthenticationPreviewHost {...props} />
}
