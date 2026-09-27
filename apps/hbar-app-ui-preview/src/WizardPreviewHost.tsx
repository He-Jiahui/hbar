import { useEffect, useState, type ReactNode } from 'react'
import { HbarAppUiWizardProvider, type HbarAppUiWizardContent } from 'hbar-app-ui/catalog'

export function WizardPreviewHost({content, children}: {readonly content: HbarAppUiWizardContent; readonly children: ReactNode}) {
  const [fields, setFields] = useState(content.referenceInformation?.fields ?? [])
  const [stepId, setStepId] = useState(content.referenceInformation?.stepId ?? '')
  useEffect(() => {
    setFields(content.referenceInformation?.fields ?? [])
    setStepId(content.referenceInformation?.stepId ?? '')
  }, [content])
  const flow = content.referenceInformation
  return <HbarAppUiWizardProvider content={{
    ...content,
    referenceInformation: flow && {
      ...flow, fields, stepId,
      onStepChange: setStepId,
      onFieldChange: (fieldId, value) => setFields((current) => current.map((field) => field.id === fieldId ? {...field, value} : field)),
    },
  }}>{children}</HbarAppUiWizardProvider>
}
