import { createRoot } from 'react-dom/client'
import { listHbarAppUiVariants } from 'hbar-app-ui/catalog'
import { previewWorkspaceCopy } from '../../../tests/fixtures/preview-workspace-copy'
import { PreviewApp } from './PreviewApp'
import './tool-calls-preview.css'
import './agent-activity-preview.css'
import './prompt-reference-preview.css'
import './empty-state-preview.css'
import './formsForm3-preview.css'
import './usage-preview.css'
import './agent-plan-preview.css'
import './agent-approval-preview.css'
import 'hbar-app-ui/theme.css'
import './preview.css'
import './authentication2-preview.css'
import './authentication3-preview.css'
import './onboarding1-preview.css'
import './onboarding2-preview.css'
import './onboarding3-preview.css'
import './onboarding4-preview.css'
import './onboarding5-preview.css'
import './onboarding6-preview.css'
import './onboarding7-preview.css'
import './paywall4-preview.css'
import './paywall5-preview.css'
import './paywall3-preview.css'
import './paywall6-preview.css'
import './paywall7-preview.css'
import './wizard-preview.css'
import './comments-preview.css'
import './scheduling-preview.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing hbar-app-ui preview root')
const parameters = new URLSearchParams(window.location.search)
const locale = parameters.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US'
createRoot(root).render(
  <PreviewApp entries={listHbarAppUiVariants()} parameters={parameters} copy={previewWorkspaceCopy[locale]} />,
)
