import { Onboarding2PreviewHost } from './Onboarding2PreviewHost'
import { Onboarding3PreviewHost } from './Onboarding3PreviewHost'
import { Onboarding4PreviewHost } from './Onboarding4PreviewHost'
import { Onboarding5PreviewHost } from './Onboarding5PreviewHost'
import { Onboarding6PreviewHost } from './Onboarding6PreviewHost'
import { Onboarding7PreviewHost } from './Onboarding7PreviewHost'
import { Onboarding1PreviewHost } from './Onboarding1PreviewHost'
import type { PreviewHostProps } from './preview-scene-contract'
export function PreviewOnboardingScene({ selected, onAction, fixtures, children }: PreviewHostProps) {
  const {
    onboardingContent,
    onboarding1ReferenceFixture,
    onboarding2ReferenceFixture,
    onboarding3ReferenceFixture,
    onboarding4ReferenceFixture,
    onboarding5ReferenceFixture,
    onboarding6ReferenceFixture,
    onboarding7ReferenceFixture,
  } = fixtures
  return (
    <Onboarding6PreviewHost
      content={onboardingContent}
      spec={selected.spec}
      onAction={onAction}
      referenceFixture={onboarding6ReferenceFixture}
    >
      <Onboarding7PreviewHost
        content={onboardingContent}
        spec={selected.spec}
        onAction={onAction}
        referenceFixture={onboarding7ReferenceFixture}
      >
        <Onboarding5PreviewHost
          content={onboardingContent}
          spec={selected.spec}
          onAction={onAction}
          referenceFixture={onboarding5ReferenceFixture}
        >
          <Onboarding4PreviewHost
            content={onboardingContent}
            spec={selected.spec}
            onAction={onAction}
            referenceFixture={onboarding4ReferenceFixture}
          >
            <Onboarding3PreviewHost
              content={onboardingContent}
              spec={selected.spec}
              onAction={onAction}
              referenceFixture={onboarding3ReferenceFixture}
            >
              <Onboarding2PreviewHost
                content={onboardingContent}
                spec={selected.spec}
                onAction={onAction}
                referenceFixture={onboarding2ReferenceFixture}
              >
                <Onboarding1PreviewHost
                  content={onboardingContent}
                  spec={selected.spec}
                  onAction={onAction}
                  referenceFixture={onboarding1ReferenceFixture}
                >
                  {children}
                </Onboarding1PreviewHost>
              </Onboarding2PreviewHost>
            </Onboarding3PreviewHost>
          </Onboarding4PreviewHost>
        </Onboarding5PreviewHost>
      </Onboarding7PreviewHost>
    </Onboarding6PreviewHost>
  )
}
