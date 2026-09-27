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
  const [reviewConfirmed, setReviewConfirmed] = useState(content.referenceReview?.confirmed ?? false)
  const [migrationProgress, setMigrationProgress] = useState(content.referenceMigration?.progress ?? 0)
  useEffect(() => {
    setFields(content.referenceInformation?.fields ?? [])
    setStepId(content.referenceInformation?.stepId ?? '')
    setInvoiceCustomerFields(content.referenceInvoice?.customerFields ?? [])
    setInvoiceTermsFields(content.referenceInvoice?.termsFields ?? [])
    setUpgradeStepId(content.referenceUpgrade?.stepId ?? '')
    setUpgradePlanId(content.referenceUpgrade?.selectedPlanId ?? '')
    setEnvironmentSelectedIds(content.referenceEnvironment?.selectedServiceIds ?? [])
    setReviewConfirmed(content.referenceReview?.confirmed ?? false)
    setMigrationProgress(content.referenceMigration?.progress ?? 0)
  }, [content])
  useEffect(() => {
    const migration = content.referenceMigration
    if (!migration || !Number.isFinite(migration.progressIntervalMs) || migration.progressIntervalMs <= 0) return
    const timer = window.setInterval(() => setMigrationProgress((value) => Math.min(migration.progressCeiling, value + migration.progressStep)), migration.progressIntervalMs)
    return () => window.clearInterval(timer)
  }, [content.referenceMigration])
  const flow = content.referenceInformation
  const invoice = content.referenceInvoice
  const upgrade = content.referenceUpgrade
  const environment = content.referenceEnvironment
  const review = content.referenceReview
  const migration = content.referenceMigration
  return <HbarAppUiWizardProvider content={{
    ...content,
    referenceMigration: migration && {...migration, progress: migrationProgress},
    referenceReview: review && {...review, confirmed: reviewConfirmed, onConfirmationChange: setReviewConfirmed},
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
