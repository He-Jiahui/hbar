import { useEffect, useState, type ReactNode } from 'react'
import { HbarAppUiWizardProvider, type HbarAppUiWizardContent } from 'hbar-app-ui/catalog'

export function WizardPreviewHost({content, children}: {readonly content: HbarAppUiWizardContent; readonly children: ReactNode}) {
  const [fields, setFields] = useState(content.referenceInformation?.fields ?? [])
  const [stepId, setStepId] = useState(content.referenceInformation?.stepId ?? '')
  const [invoiceCustomerFields, setInvoiceCustomerFields] = useState(content.referenceInvoice?.customerFields ?? [])
  const [invoiceTermsFields, setInvoiceTermsFields] = useState(content.referenceInvoice?.termsFields ?? [])
  const [upgradeStepId, setUpgradeStepId] = useState(content.referenceUpgrade?.stepId ?? '')
  const [upgradePlanId, setUpgradePlanId] = useState(content.referenceUpgrade?.selectedPlanId ?? '')
  const [environmentSelectedIds, setEnvironmentSelectedIds] = useState(content.referenceEnvironment?.selectedServiceIds ?? [])
  useEffect(() => {
    setFields(content.referenceInformation?.fields ?? [])
    setStepId(content.referenceInformation?.stepId ?? '')
    setInvoiceCustomerFields(content.referenceInvoice?.customerFields ?? [])
    setInvoiceTermsFields(content.referenceInvoice?.termsFields ?? [])
    setUpgradeStepId(content.referenceUpgrade?.stepId ?? '')
    setUpgradePlanId(content.referenceUpgrade?.selectedPlanId ?? '')
    setEnvironmentSelectedIds(content.referenceEnvironment?.selectedServiceIds ?? [])
  }, [content])
  const flow = content.referenceInformation
  const invoice = content.referenceInvoice
  const upgrade = content.referenceUpgrade
  const environment = content.referenceEnvironment
  return <HbarAppUiWizardProvider content={{
    ...content,
    referenceEnvironment: environment && {
      ...environment, selectedServiceIds: environmentSelectedIds,
      onServiceToggle: (serviceId) => setEnvironmentSelectedIds((current) => current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId]),
    },
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
