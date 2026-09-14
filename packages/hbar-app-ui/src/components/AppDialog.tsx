import type {HbarAppUiVariantProps} from '../types'
import {AlertRuleDrawer} from './app-dialog/AlertRuleDrawer'
import {AppDialogActionsMenu} from './app-dialog/AppDialogActionsMenu'
import {DeleteProjectDialog} from './app-dialog/DeleteProjectDialog'
import {EvidenceDetailsPanel} from './app-dialog/EvidenceDetailsPanel'
import {InviteMemberDialog} from './app-dialog/InviteMemberDialog'
import {PlanChangeDialog} from './app-dialog/PlanChangeDialog'
import {WorkspaceWizardDialog} from './app-dialog/WorkspaceWizardDialog'
import './app-dialog/AppDialogSurface.css'

type AppDialogProps = HbarAppUiVariantProps

/**
 * The catalog entry stays a small dispatcher. Each dialog state has its own
 * view and local interaction model so changing one surface cannot perturb the
 * geometry of the others.
 */
export function AppDialog({spec, onAction}: AppDialogProps): React.JSX.Element {
    switch (spec.variant) {
        case 1:
            return <PlanChangeDialog spec={spec} onAction={onAction}/>
        case 2:
            return <DeleteProjectDialog spec={spec} onAction={onAction}/>
        case 3:
            return <InviteMemberDialog spec={spec} onAction={onAction}/>
        case 4:
            return <WorkspaceWizardDialog spec={spec} onAction={onAction}/>
        case 5:
            return <AlertRuleDrawer spec={spec} onAction={onAction}/>
        case 6:
            return <EvidenceDetailsPanel spec={spec} onAction={onAction}/>
        case 7:
            return <AppDialogActionsMenu spec={spec} onAction={onAction}/>
        default:
            return <PlanChangeDialog spec={spec} onAction={onAction}/>
    }
}
