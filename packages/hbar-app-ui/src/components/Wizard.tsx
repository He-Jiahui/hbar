import type {HbarAppUiVariantProps} from '../types'
import {BillingUpgradeWizard} from './wizard/BillingUpgradeWizard'
import {EnvironmentWizard} from './wizard/EnvironmentWizard'
import {InformationWizard} from './wizard/InformationWizard'
import {InvoiceWizard} from './wizard/InvoiceWizard'
import {MigrationWizard} from './wizard/MigrationWizard'
import {ReviewWizard} from './wizard/ReviewWizard'
import {ShippingQuestion} from './wizard/ShippingQuestion'
import './wizard/WizardSurface.css'

type WizardProps = HbarAppUiVariantProps

/** Category dispatcher; each workflow variant has its own semantic surface. */
export function Wizard({spec, onAction}: WizardProps) {
    switch (spec.variant) {
        case 1:
            return <InformationWizard spec={spec} onAction={onAction}/>
        case 2:
            return <InvoiceWizard spec={spec} onAction={onAction}/>
        case 3:
            return <BillingUpgradeWizard spec={spec} onAction={onAction}/>
        case 4:
            return <EnvironmentWizard spec={spec} onAction={onAction}/>
        case 5:
            return <ReviewWizard spec={spec} onAction={onAction}/>
        case 6:
            return <MigrationWizard spec={spec} onAction={onAction}/>
        case 7:
            return <ShippingQuestion spec={spec} onAction={onAction}/>
        default:
            return <InformationWizard spec={spec} onAction={onAction}/>
    }
}
