import { useEffect, useMemo, useState } from 'react'
import type { OnboardingReadiness } from '@hbar/app-react/onboarding'
import { useHbarRuntime, useHbarRuntimeState } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'
import { onboardingCopy } from './onboarding-copy'
import { OnboardingPageView } from './onboarding-page-view'

export function OnboardingPage({
  locale,
  connected,
  onOpenWorkspace,
  onConfigure,
}: {
  readonly locale: ShellLocale
  readonly connected: boolean
  readonly onOpenWorkspace: () => void
  readonly onConfigure: (kind: 'workspace' | 'model' | 'project') => void
}) {
  const runtime = useHbarRuntime()
  const directory = useHbarRuntimeState(runtime.state.directory)
  const models = useHbarRuntimeState(runtime.state.preSessionModelCatalog)
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const labels = onboardingCopy(locale)
  const readiness: OnboardingReadiness = useMemo(
    () => ({
      connected,
      workspaceCount: connected ? Object.keys(directory.workspaces).length : 0,
      modelCount: connected && models.status === 'ready' ? models.models.filter((model) => model.hasKey).length : 0,
      projectReady: connected && Object.keys(directory.workspaces).length > 0,
    }),
    [connected, directory.workspaces, models],
  )
  useEffect(() => runtime.preSessionModelCatalog.retain(), [runtime.preSessionModelCatalog])
  const create = (requestedPath?: string) => {
    const target = (requestedPath ?? path).trim()
    if (busy) return
    if (!target) {
      setError('WORKSPACE_PATH_REQUIRED')
      return
    }
    setBusy(true)
    setError(null)
    void runtime.commands
      .execute('workspace.open', { path: target })
      .then(() => {
        setPath('')
        onOpenWorkspace()
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'WORKSPACE_OPEN_FAILED'))
      .finally(() => setBusy(false))
  }
  const retry = () => {
    setError(null)
    runtime.preSessionModelCatalog.refresh()
  }
  return (
    <OnboardingPageView
      readiness={readiness}
      labels={labels}
      actions={{
        onConfigure,
        onCreate: create,
        onPathChange: setPath,
        setupPath: path,
        onOpen: onOpenWorkspace,
        onBack: () => onConfigure('workspace'),
        onRetry: retry,
        busy,
        error,
      }}
      error={error ? labels.error(error) : null}
    />
  )
}
