import { createRoot, type Root } from 'react-dom/client'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { DEFAULT_LUMEN_APPEARANCE, LumenFrame, LumenProvider } from '@lumen/app-ui'
import type { OnboardingReadiness } from '@hbar/app-react/onboarding'
import { workspaceSchema } from '@hbar/contracts/directory'
import { OnboardingPageView } from '../../apps/web/src/onboarding-page-view'
import { onboardingCopy } from '../../apps/web/src/onboarding-copy'
import '@lumen/app-ui/styles.css'

export interface OnboardingPathContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly readiness: OnboardingReadiness
  readonly long?: boolean
}
interface FixtureState {
  readonly input: OnboardingPathContentInput
  readonly path: string
  readonly error: string | null
  readonly busy: boolean
}
const createFixture = (input: OnboardingPathContentInput) =>
  createStore<FixtureState>(() => ({ input, path: '', error: null, busy: false }))
type FixtureStore = ReturnType<typeof createFixture>
let root: Root | undefined
let store: FixtureStore | undefined
let rejectCreate = true
const targets: { kind: string; value: string }[] = []
declare global {
  interface Window {
    mountOnboardingPathContent(input: OnboardingPathContentInput): void
    updateOnboardingPathContent(input: OnboardingPathContentInput): void
    setOnboardingPathContentBusy(busy: boolean): void
    repairOnboardingPathContent(): void
    onboardingPathContentTargets(): readonly { kind: string; value: string }[]
  }
}
function Fixture({ owner }: { readonly owner: FixtureStore }) {
  const state = useStore(owner)
  const { input } = state
  const base = onboardingCopy(input.locale)
  const labels = {
    ...base,
    setupTitle: base.setupTitle.repeat(input.long ? 8 : 1),
    readyTitle: base.readyTitle.repeat(input.long ? 8 : 1),
    setupDescription: base.setupDescription.repeat(input.long ? 8 : 1),
    readyDescription: base.readyDescription.repeat(input.long ? 8 : 1),
    setupPath: base.setupPath.repeat(input.long ? 8 : 1),
    setupPathHint: base.setupPathHint.repeat(input.long ? 8 : 1),
    continue: base.continue.repeat(input.long ? 12 : 1),
    retry: base.retry.repeat(input.long ? 12 : 1),
    error: (code: string) => base.error(code).repeat(input.long ? 8 : 1),
  }
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, textSize: 'l', motion: false }}>
      <LumenFrame
        as="main"
        aria-label={base.progress}
        tabIndex={0}
        style={{
          minInlineSize: 0,
          padding: '.5rem',
          boxSizing: 'border-box',
          blockSize: 'calc(100dvh / 1.25)',
          overflow: 'auto',
        }}
      >
        <OnboardingPageView
          readiness={input.readiness}
          labels={labels}
          error={state.error ? labels.error(state.error) : null}
          actions={{
            setupPath: state.path,
            busy: state.busy,
            error: state.error,
            onPathChange: (path) => owner.setState({ path }),
            onCreate: (path) => {
              if (owner.getState().busy) return
              targets.push({ kind: 'create', value: path })
              owner.setState({
                error: !path
                  ? 'WORKSPACE_PATH_REQUIRED'
                  : !workspaceSchema.shape.path.safeParse(path).success
                    ? 'INVALID_INPUT'
                    : rejectCreate
                      ? 'WORKSPACE_OPEN_FAILED'
                      : null,
              })
            },
            onConfigure: (kind) => {
              targets.push({ kind: 'configure', value: kind })
            },
            onOpen: () => {
              targets.push({ kind: 'open', value: 'original-workspace' })
            },
            onBack: () => {
              targets.push({ kind: 'back', value: 'workspace' })
            },
            onRetry: () => {
              targets.push({ kind: 'retry', value: 'original-workspace' })
              owner.setState({ error: null })
            },
          }}
        />
      </LumenFrame>
    </LumenProvider>
  )
}
window.mountOnboardingPathContent = (input) => {
  root?.unmount()
  targets.splice(0)
  rejectCreate = true
  store = createFixture(input)
  const element = document.getElementById('onboarding-path-content-fixture')
  if (!element) throw new Error('Missing owned onboarding mount')
  root = createRoot(element)
  root.render(<Fixture owner={store} />)
}
window.updateOnboardingPathContent = (input) => store?.setState({ input })
window.setOnboardingPathContentBusy = (busy) => store?.setState({ busy })
window.repairOnboardingPathContent = () => {
  rejectCreate = false
}
window.onboardingPathContentTargets = () => targets
