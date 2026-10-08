import { LumenButton, LumenContentText, LumenFrame } from '@lumen/app-ui'
import {
  OnboardingReadinessView,
  type OnboardingReadiness,
  type OnboardingReadinessActions,
  type OnboardingReadinessLabels,
} from '@hbar/app-react/onboarding'
import './onboarding-page.css'

export interface OnboardingPageViewProps {
  readonly readiness: OnboardingReadiness
  readonly labels: OnboardingReadinessLabels
  readonly actions: OnboardingReadinessActions
  readonly error: string | null
}

export function OnboardingPageView({ readiness, labels, actions, error }: OnboardingPageViewProps) {
  return (
    <LumenFrame className="hbar-web-onboarding-page">
      <OnboardingReadinessView readiness={readiness} labels={labels} actions={actions} />
      {error && (
        <LumenFrame className="hbar-web-onboarding-feedback" role="alert">
          <LumenContentText context="feedback.paragraph">{error}</LumenContentText>
          <LumenFrame
            className="hbar-web-onboarding-feedback-actions"
            role="group"
            aria-label={labels.retry}
            tabIndex={0}
          >
            <LumenButton
              variant="outlined"
              disabled={actions.busy === true || !actions.onRetry}
              onClick={actions.onRetry}
            >
              {labels.retry}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
