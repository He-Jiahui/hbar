import type {HbarAppUiVariantProps} from './types'
import {AiChat} from './components/AiChat'
import {AgentActivity} from './components/AgentActivity'
import {AgentApproval} from './components/AgentApproval'
import {AgentPlan} from './components/AgentPlan'
import {AiUsage} from './components/AiUsage'
import {Analytics} from './components/Analytics'
import {AppDialog} from './components/AppDialog'
import {AppShell} from './components/AppShell'
import {AppSidebar} from './components/AppSidebar'
import {Authentication} from './components/Authentication'
import {Billing} from './components/Billing'
import {Card} from './components/Card'
import {Chat} from './components/Chat'
import {Comments} from './components/Comments'
import {CommandMenu} from './components/CommandMenu'
import {Dashboard} from './components/Dashboard'
import {DataTable} from './components/DataTable'
import {Editor} from './components/Editor'
import {EmptyState} from './components/EmptyState'
import {Feedback} from './components/Feedback'
import {FileManager} from './components/FileManager'
import {Filtering} from './components/Filtering'
import {Forms} from './components/Forms'
import {Integrations} from './components/Integrations'
import {Kanban} from './components/Kanban'
import {List} from './components/List'
import {Mobile} from './components/Mobile'
import {Monitoring} from './components/Monitoring'
import {Navbar} from './components/Navbar'
import {Notifications} from './components/Notifications'
import {Onboarding} from './components/Onboarding'
import {Paywall} from './components/Paywall'
import {PromptInput} from './components/PromptInput'
import {Scheduling} from './components/Scheduling'
import {SettingsForm} from './components/SettingsForm'
import {Support} from './components/Support'
import {ToolCalls} from './components/ToolCalls'
import {Wizard} from './components/Wizard'

/**
 * Public variant router. Every category owns a separate TSX module; this file
 * only maps the stable category contract to that module.
 */
export default function HbarAppUiVariant(props: HbarAppUiVariantProps) {
    switch (props.spec.category) {
        case 'ai-chat':
            return <AiChat {...props} />
        case 'prompt-input':
            return <PromptInput {...props} />
        case 'agent-activity':
            return <AgentActivity {...props} />
        case 'tool-calls':
            return <ToolCalls {...props} />
        case 'agent-approval':
            return <AgentApproval {...props} />
        case 'agent-plan':
            return <AgentPlan {...props} />
        case 'ai-usage':
            return <AiUsage {...props} />
        case 'app-shell':
            return <AppShell {...props} />
        case 'app-sidebar':
            return <AppSidebar {...props} />
        case 'command-menu':
            return <CommandMenu {...props} />
        case 'navbar':
            return <Navbar {...props} />
        case 'mobile':
            return <Mobile {...props} />
        case 'card':
            return <Card {...props} />
        case 'data-table':
            return <DataTable {...props} />
        case 'dashboard':
            return <Dashboard {...props} />
        case 'analytics':
            return <Analytics {...props} />
        case 'list':
            return <List {...props} />
        case 'filtering':
            return <Filtering {...props} />
        case 'file-manager':
            return <FileManager {...props} />
        case 'monitoring':
            return <Monitoring {...props} />
        case 'empty-state':
            return <EmptyState {...props} />
        case 'settings-form':
            return <SettingsForm {...props} />
        case 'forms':
            return <Forms {...props} />
        case 'app-dialog':
            return <AppDialog {...props} />
        case 'notifications':
            return <Notifications {...props} />
        case 'onboarding':
            return <Onboarding {...props} />
        case 'paywall':
            return <Paywall {...props} />
        case 'authentication':
            return <Authentication {...props} />
        case 'kanban':
            return <Kanban {...props} />
        case 'wizard':
            return <Wizard {...props} />
        case 'comments':
            return <Comments {...props} />
        case 'scheduling':
            return <Scheduling {...props} />
        case 'integrations':
            return <Integrations {...props} />
        case 'editor':
            return <Editor {...props} />
        case 'feedback':
            return <Feedback {...props} />
        case 'support':
            return <Support {...props} />
        case 'billing':
            return <Billing {...props} />
        case 'chat':
            return <Chat {...props} />
    }
}
