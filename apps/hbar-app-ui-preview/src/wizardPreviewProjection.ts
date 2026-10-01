import { uniqueHbarAppUiWizardItems, type HbarAppUiWizardContent } from 'hbar-app-ui/catalog'
import type {
  WizardPreviewField,
  WizardPreviewFlow,
  WizardPreviewScope,
  WizardPreviewSeed,
  WizardPreviewStoreApi,
} from './wizardPreviewModel'

function fieldSeed(field: {
  readonly id: string
  readonly value: string
  readonly kind: string
  readonly options?: readonly { readonly id: string }[] | undefined
}): WizardPreviewField {
  return {
    id: field.id,
    value: field.value,
    ...(field.kind === 'select' ? { optionIds: (field.options ?? []).map((option) => option.id) } : {}),
  }
}

export function createWizardPreviewSeed(input: HbarAppUiWizardContent, scope: WizardPreviewScope): WizardPreviewSeed {
  let flow: WizardPreviewFlow = { kind: 'empty' }
  switch (scope.variant) {
    case 1: {
      const content = input.referenceInformation
      if (content)
        flow = {
          kind: 'information',
          fields: content.fields.map(fieldSeed),
          stepIds: content.steps.map((step) => step.id),
          stepId: content.stepId,
        }
      break
    }
    case 2: {
      const content = input.referenceInvoice
      if (content)
        flow = { kind: 'invoice', fields: [...content.customerFields, ...content.termsFields].map(fieldSeed) }
      break
    }
    case 3: {
      const content = input.referenceUpgrade
      if (content)
        flow = {
          kind: 'upgrade',
          stepIds: content.steps.map((step) => step.id),
          stepId: content.stepId,
          planIds: content.plans.map((plan) => plan.id),
          planId: content.selectedPlanId,
        }
      break
    }
    case 4: {
      const content = input.referenceEnvironment
      if (content)
        flow = {
          kind: 'environment',
          serviceIds: content.services.map((service) => service.id),
          selectedIds: content.selectedServiceIds,
        }
      break
    }
    case 5: {
      const content = input.referenceReview
      if (content) flow = { kind: 'review', confirmed: content.confirmed }
      break
    }
    case 6: {
      const content = input.referenceMigration
      if (content)
        flow = {
          kind: 'migration',
          progress: content.progress,
          step: content.progressStep,
          intervalMs: content.progressIntervalMs,
          ceiling: content.progressCeiling,
        }
      break
    }
    case 7: {
      const content = input.referenceShipping
      if (content)
        flow = {
          kind: 'shipping',
          questions: content.questions.map((question) => ({
            id: question.id,
            optionIds: question.options.map((option) => option.id),
          })),
          questionId: content.currentQuestionId,
          answers: content.selectedOptionIds,
        }
      break
    }
  }
  return { scope, flow }
}

function fields<T extends { readonly id: string; readonly value: string }>(
  input: readonly T[],
  values: readonly WizardPreviewField[],
): readonly T[] {
  return uniqueHbarAppUiWizardItems(input).flatMap((field) => {
    const value = values.find((item) => item.id === field.id)
    return value ? [{ ...field, value: value.value }] : []
  })
}

/** Only the active surface gets a contract and callbacks; source-passive controls stay passive. */
export function projectWizardPreview(
  input: HbarAppUiWizardContent,
  store: WizardPreviewStoreApi,
): HbarAppUiWizardContent {
  const { scope, flow } = store.getState()
  switch (scope.variant) {
    case 1: {
      const content = input.referenceInformation
      return {
        information: input.information,
        referenceInformation:
          content && flow.kind === 'information'
            ? {
                ...content,
                fields: fields(content.fields, flow.fields),
                stepId: flow.stepId,
                onFieldChange: (id, value) => {
                  store.getState().field(scope, id, value)
                },
                onStepChange: (id) => {
                  store.getState().step(scope, id)
                },
              }
            : undefined,
      }
    }
    case 2: {
      const content = input.referenceInvoice
      const customerIds = new Set(content?.customerFields.map((field) => field.id))
      return {
        invoice: input.invoice,
        referenceInvoice:
          content && flow.kind === 'invoice'
            ? {
                ...content,
                customerFields: fields(content.customerFields, flow.fields),
                termsFields: fields(
                  content.termsFields.filter((field) => !customerIds.has(field.id)),
                  flow.fields,
                ),
                onFieldChange: (id, value) => {
                  store.getState().field(scope, id, value)
                },
              }
            : undefined,
      }
    }
    case 3: {
      const content = input.referenceUpgrade
      return {
        upgrade: input.upgrade,
        referenceUpgrade:
          content && flow.kind === 'upgrade'
            ? {
                ...content,
                stepId: flow.stepId,
                selectedPlanId: flow.planId,
                onStepChange: (id) => {
                  store.getState().step(scope, id)
                },
                onPlanChange: (id) => {
                  store.getState().plan(scope, id)
                },
              }
            : undefined,
      }
    }
    case 4: {
      const content = input.referenceEnvironment
      return {
        environment: input.environment,
        referenceEnvironment:
          content && flow.kind === 'environment'
            ? {
                ...content,
                selectedServiceIds: flow.selectedIds,
                onServiceToggle: (id) => {
                  store.getState().service(scope, id)
                },
              }
            : undefined,
      }
    }
    case 5: {
      const content = input.referenceReview
      return {
        review: input.review,
        referenceReview:
          content && flow.kind === 'review'
            ? {
                ...content,
                confirmed: flow.confirmed,
                onConfirmationChange: (value) => {
                  store.getState().confirm(scope, value)
                },
              }
            : undefined,
      }
    }
    case 6: {
      const content = input.referenceMigration
      return {
        migration: input.migration,
        referenceMigration: content && flow.kind === 'migration' ? { ...content, progress: flow.progress } : undefined,
      }
    }
    case 7: {
      const content = input.referenceShipping
      return {
        shipping: input.shipping,
        referenceShipping:
          content && flow.kind === 'shipping'
            ? {
                ...content,
                currentQuestionId: flow.questionId,
                selectedOptionIds: flow.answers,
                onQuestionChange: (id) => {
                  store.getState().question(scope, id)
                },
                onOptionChange: (id, option) => {
                  store.getState().answer(scope, id, option)
                },
              }
            : undefined,
      }
    }
  }
}
