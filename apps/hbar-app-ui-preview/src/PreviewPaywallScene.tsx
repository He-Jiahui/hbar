import { Paywall4PreviewHost } from './Paywall4PreviewHost'
import { Paywall5PreviewHost } from './Paywall5PreviewHost'
import { Paywall3PreviewHost } from './Paywall3PreviewHost'
import { Paywall6PreviewHost } from './Paywall6PreviewHost'
import { Paywall7PreviewHost } from './Paywall7PreviewHost'
import type { PreviewHostProps } from './preview-scene-contract'
export function PreviewPaywallScene({ selected, onAction, fixtures, children }: PreviewHostProps) {
  const {
    paywallContent,
    paywall4ReferenceFixture,
    paywall5ReferenceFixture,
    paywall3ReferenceFixture,
    paywall6ReferenceFixture,
    paywall7ReferenceFixture,
  } = fixtures
  return (
    <Paywall4PreviewHost
      content={paywallContent}
      spec={selected.spec}
      onAction={onAction}
      referenceFixture={paywall4ReferenceFixture}
    >
      <Paywall5PreviewHost
        content={paywallContent}
        spec={selected.spec}
        onAction={onAction}
        referenceFixture={paywall5ReferenceFixture}
      >
        <Paywall3PreviewHost
          content={paywallContent}
          spec={selected.spec}
          onAction={onAction}
          referenceFixture={paywall3ReferenceFixture}
        >
          <Paywall6PreviewHost
            content={paywallContent}
            spec={selected.spec}
            onAction={onAction}
            referenceFixture={paywall6ReferenceFixture}
          >
            <Paywall7PreviewHost
              content={paywallContent}
              spec={selected.spec}
              onAction={onAction}
              referenceFixture={paywall7ReferenceFixture}
            >
              {children}
            </Paywall7PreviewHost>
          </Paywall6PreviewHost>
        </Paywall3PreviewHost>
      </Paywall5PreviewHost>
    </Paywall4PreviewHost>
  )
}
