import { useEffect, useState, type ReactNode } from 'react'
import { HbarAppUiWizardProvider, type HbarAppUiWizardContent } from 'hbar-app-ui/catalog'

export function WizardPreviewHost({content, children}: {readonly content: HbarAppUiWizardContent; readonly children: ReactNode}) {
  const [fields, setFields] = useState(content.referenceInformation?.fields ?? [])
  const [stepId, setStepId] = useState(content.referenceInformation?.stepId ?? '')
  const [invoiceCustomerFields, setInvoiceCustomerFields] = useState(content.referenceInvoice?.customerFields ?? [])
  const [invoiceTermsFields, setInvoiceTermsFields] = useState(content.referenceInvoice?.termsFields ?? [])
  useEffect(() => {
    setFields(content.referenceInformation?.fields ?? [])
    setStepId(content.referenceInformation?.stepId ?? '')
    setInvoiceCustomerFields(content.referenceInvoice?.customerFields ?? [])
    setInvoiceTermsFields(content.referenceInvoice?.termsFields ?? [])
  }, [content])
  const flow = content.referenceInformation
  const invoice = content.referenceInvoice
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
  }}>{children}</HbarAppUiWizardProvider>
}
