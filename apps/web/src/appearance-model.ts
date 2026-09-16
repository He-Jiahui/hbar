import type { HbarAppUiPreferenceAction } from 'hbar-app-ui/settings-form'
import { setLocale } from './locale'
import { useWorkbench } from './stores'

/** Device preferences are persisted by the workbench; unsupported values leave them unchanged. */
export function updateAppearance(action: HbarAppUiPreferenceAction): void {
  if (action.type === 'theme' && (action.id === 'dark' || action.id === 'light' || action.id === 'white')) {
    useWorkbench.setState({ theme: action.id })
  } else if (action.type === 'language' && (action.id === 'zh-CN' || action.id === 'en-US')) {
    setLocale(action.id)
  }
}
