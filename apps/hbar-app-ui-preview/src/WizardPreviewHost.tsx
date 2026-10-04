import { useEffect, useMemo, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiWizardProvider, type HbarAppUiWizardContent, type HbarAppUiVariantSpec } from 'hbar-app-ui/catalog'
import { createWizardPreviewStore, type WizardPreviewScope, type WizardPreviewVariant } from './wizardPreviewModel'
import { createWizardPreviewSeed, projectWizardPreview } from './wizardPreviewProjection'

interface HostProps {
  readonly spec: HbarAppUiVariantSpec
  readonly content: HbarAppUiWizardContent
  readonly children: ReactNode
}
function isWizardVariant(variant: number): variant is WizardPreviewVariant {
  return (
    variant === 1 || variant === 2 || variant === 3 || variant === 4 || variant === 5 || variant === 6 || variant === 7
  )
}
export function WizardPreviewHost(props: HostProps) {
  if (props.spec.category !== 'wizard' || !isWizardVariant(props.spec.variant)) return <>{props.children}</>
  const mode =
    typeof location === 'undefined'
      ? 'default'
      : (new URLSearchParams(location.search).get('wizardFixture') ?? 'default')
  return <WizardOwner key={`${props.spec.id}:${mode}`} {...props} variant={props.spec.variant} mode={mode} />
}
function WizardOwner({
  spec,
  content: input,
  variant,
  mode,
  children,
}: HostProps & {
  readonly variant: WizardPreviewVariant
  readonly mode: string
}) {
  const scope = useMemo<WizardPreviewScope>(
    () => ({ ownerId: `wizard-preview-${spec.id}`, variant, fixtureId: mode }),
    [spec.id, variant, mode],
  )
  const store = useMemo(() => createWizardPreviewStore(createWizardPreviewSeed(input, scope)), [input, scope])
  useStore(store, (state) => state.flow)
  useEffect(() => {
    const { scope: activeScope, flow } = store.getState()
    if (flow.kind !== 'migration' || flow.intervalMs <= 0 || flow.step <= 0 || flow.progress >= flow.ceiling) return
    const timer = window.setInterval(() => {
      if (!store.getState().tick(activeScope)) window.clearInterval(timer)
    }, flow.intervalMs)
    return () => window.clearInterval(timer)
  }, [store])
  return <HbarAppUiWizardProvider content={projectWizardPreview(input, store)}>{children}</HbarAppUiWizardProvider>
}
