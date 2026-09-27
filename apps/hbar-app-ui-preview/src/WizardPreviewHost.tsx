import { useEffect, useState, type ReactNode } from 'react'
import { HbarAppUiWizardProvider, type HbarAppUiWizardContent } from 'hbar-app-ui/catalog'

export function WizardPreviewHost({content, children}: {readonly content: HbarAppUiWizardContent; readonly children: ReactNode}) {
  const [fields, setFields] = useState(content.referenceInformation?.fields ?? [])
  const [stepId, setStepId] = useState(content.referenceInformation?.stepId ?? '')
  const [invoiceCustomerFields, setInvoiceCustomerFields] = useState(content.referenceInvoice?.customerFields ?? [])
  const [invoiceTermsFields, setInvoiceTermsFields] = useState(content.referenceInvoice?.termsFields ?? [])
  const [upgradeStepId, setUpgradeStepId] = useState(content.referenceUpgrade?.stepId ?? '')
  const [upgradePlanId, setUpgradePlanId] = useState(content.referenceUpgrade?.selectedPlanId ?? '')
  useEffect(() => {
    setFields(content.referenceInformation?.fields ?? [])
    setStepId(content.referenceInformation?.stepId ?? '')
    setInvoiceCustomerFields(content.referenceInvoice?.customerFields ?? [])
    setInvoiceTermsFields(content.referenceInvoice?.termsFields ?? [])
    setUpgradeStepId(content.referenceUpgrade?.stepId ?? '')
    setUpgradePlanId(content.referenceUpgrade?.selectedPlanId ?? '')
  }, [content])
  const flow = content.referenceInformation
  const invoice = content.referenceInvoice
  const upgrade = content.referenceUpgrade
  return <HbarAppUiWizardProvider content={{
    ...content,
    referenceInformation: flow && {
      ...flow, fields, stepId,
      onStepChange: setStepId,
      onFieldChange: (fieldId, value) => setFields((current) => current.map((field) => field.id === fieldId ? {...field, value} : field)),
    },
    referenceInvoice: invoice && {
      ...invoice,
      customerFields: invoiceCustomerFields,
      termsFields: invoiceTermsFields,
      onFieldChange: (fieldId, value) => {
        setInvoiceCustomerFields((current) => current.map((field) => field.id === fieldId ? {...field, value} : field))
        setInvoiceTermsFields((current) => current.map((field) => field.id === fieldId ? {...field, value} : field))
      },
    },
    referenceUpgrade: upgrade && {
      ...upgrade, stepId: upgradeStepId, selectedPlanId: upgradePlanId,
      onStepChange: setUpgradeStepId,
      onPlanChange: setUpgradePlanId,
    },
  }}>{children}</HbarAppUiWizardProvider>
}
