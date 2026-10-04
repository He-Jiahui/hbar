import {
  type Forms8ConditionField,
  type Forms8Condition,
  type Forms8ConditionValue,
  type Forms8MatchMode,
  type Forms8OperatorDefinition,
  type Forms8PreviewStoreSeed,
  type Forms8PreviewStoreState,
  type Forms8RuleAction,
} from './forms8PreviewStore'

export type Forms8PreviewLocale = 'en' | 'de'

export interface Forms8PreviewCopy {
  readonly pageTitle: string
  readonly pageDescription: string
  readonly whenHeading: string
  readonly thenHeading: string
  readonly actionOrderHelper: string
  readonly matchModeGroupLabel: string
  readonly matchAllLabel: string
  readonly matchAnyLabel: string
  readonly addConditionLabel: string
  readonly removeConditionLabel: string
  readonly fieldPickerLabel: (conditionNumber: number) => string
  readonly operatorPickerLabel: (fieldLabel: string) => string
  readonly numberValueLabel: (fieldLabel: string) => string
  readonly lowerRangeLabel: (fieldLabel: string) => string
  readonly upperRangeLabel: (fieldLabel: string) => string
  readonly textValueLabel: (fieldLabel: string) => string
  readonly choiceValueLabel: (fieldLabel: string) => string
  readonly choicePlaceholder: string
  readonly numberPlaceholder: string
  readonly summaryLabel: string
  readonly incompleteConditionMessage: string
  readonly booleanValueGroupLabel: (fieldLabel: string) => string
  readonly yesLabel: string
  readonly noLabel: string
  readonly testRuleLabel: string
  readonly saveRuleLabel: string
  readonly formatSummary: (
    mode: Forms8MatchMode,
    conditionCount: number,
    actions: readonly Forms8RuleAction[],
  ) => string
}

export interface Forms8PreviewContent {
  readonly copy: Forms8PreviewCopy
  readonly fields: readonly Forms8ConditionField[]
  readonly matchMode: Forms8MatchMode
  readonly conditions: readonly Forms8Condition[]
  readonly actions: readonly Forms8RuleAction[]
  readonly summary: string
  readonly isComplete: boolean
  readonly validationMessage: string | undefined
  readonly conditionCollection: {
    readonly kind: 'pane-scroll'
    readonly capacityEvidence: 'not-observed'
  }
}

export interface Forms8PreviewFixture {
  readonly locale: Forms8PreviewLocale
  readonly copy: Forms8PreviewCopy
  readonly storeSeed: Forms8PreviewStoreSeed
  readonly contentFor: (state: Forms8PreviewStoreState) => Forms8PreviewContent
}

function actionPhrase(action: Forms8RuleAction, locale: Forms8PreviewLocale): string {
  if (locale === 'de') {
    return action.kind === 'route-to-zone'
      ? `es zu ${action.zoneLabel} leiten`
      : `${action.recipientLabel} benachrichtigen`
  }
  return action.kind === 'route-to-zone' ? `route it to ${action.zoneLabel}` : `notify ${action.recipientLabel}`
}

function copyFor(locale: Forms8PreviewLocale): Forms8PreviewCopy {
  if (locale === 'de') {
    return {
      pageTitle: 'Regel für die Eingangspaletten-Zuordnung',
      pageDescription:
        'Prüfen Sie ankommende Paletten anhand dieser Bedingungen und führen Sie danach die passenden Aktionen in der angegebenen Reihenfolge aus.',
      whenHeading: 'Wenn',
      thenHeading: 'Dann',
      actionOrderHelper: 'Aktionen werden der Reihe nach ausgeführt, wenn die Bedingungen zutreffen.',
      matchModeGroupLabel: 'Bedingungsmodus',
      matchAllLabel: 'Alle Bedingungen',
      matchAnyLabel: 'Beliebige Bedingung',
      addConditionLabel: 'Bedingung hinzufügen',
      removeConditionLabel: 'Bedingung entfernen',
      fieldPickerLabel: (conditionNumber) => `Feld für Bedingung ${conditionNumber} auswählen`,
      operatorPickerLabel: (fieldLabel) => `Operator für ${fieldLabel} auswählen`,
      numberValueLabel: (fieldLabel) => `Zahlenwert für ${fieldLabel}`,
      lowerRangeLabel: (fieldLabel) => `Untergrenze für ${fieldLabel}`,
      upperRangeLabel: (fieldLabel) => `Obergrenze für ${fieldLabel}`,
      textValueLabel: (fieldLabel) => `Textwert für ${fieldLabel}`,
      choiceValueLabel: (fieldLabel) => `Auswahl für ${fieldLabel}`,
      choicePlaceholder: 'Wert auswählen',
      numberPlaceholder: '0',
      summaryLabel: 'Zusammenfassung',
      incompleteConditionMessage: 'Füllen Sie jeden Bedingungswert aus',
      booleanValueGroupLabel: (fieldLabel) => `${fieldLabel} Wert`,
      yesLabel: 'Ja',
      noLabel: 'Nein',
      testRuleLabel: 'Regel testen',
      saveRuleLabel: 'Regel speichern',
      formatSummary: (mode, conditionCount, actions) => {
        const conditionPhrase = mode === 'all' ? 'alle' : 'beliebige'
        const actionText = actions.map((action) => actionPhrase(action, locale)).join(' und ')
        return `Wenn ${conditionPhrase} ${conditionCount} Bedingungen zutreffen, ${actionText || 'sind keine Aktionen konfiguriert'}.`
      },
    }
  }

  return {
    pageTitle: 'Inbound pallet routing rule',
    pageDescription: 'Match arriving pallets, then decide where they go.',
    whenHeading: 'When',
    thenHeading: 'Then',
    actionOrderHelper: 'Actions run in order when the conditions match.',
    matchModeGroupLabel: 'Match mode',
    matchAllLabel: 'Match all',
    matchAnyLabel: 'Match any',
    addConditionLabel: 'Add condition',
    removeConditionLabel: 'Remove condition',
    fieldPickerLabel: (conditionNumber) => `Condition ${conditionNumber} field`,
    operatorPickerLabel: (fieldLabel) => `${fieldLabel} operator`,
    numberValueLabel: (fieldLabel) => `${fieldLabel} value`,
    lowerRangeLabel: (fieldLabel) => `${fieldLabel} lower value`,
    upperRangeLabel: (fieldLabel) => `${fieldLabel} upper value`,
    textValueLabel: (fieldLabel) => `${fieldLabel} value`,
    choiceValueLabel: (fieldLabel) => `${fieldLabel} value`,
    choicePlaceholder: 'Select a value',
    numberPlaceholder: '0',
    summaryLabel: 'Summary',
    incompleteConditionMessage: 'Fill in every condition value',
    booleanValueGroupLabel: (fieldLabel) => `${fieldLabel} value`,
    yesLabel: 'Yes',
    noLabel: 'No',
    testRuleLabel: 'Test rule',
    saveRuleLabel: 'Save rule',
    formatSummary: (mode, conditionCount, actions) => {
      const conditionPhrase = mode === 'all' ? 'all' : 'any of the'
      const actionText = actions.map((action) => actionPhrase(action, locale)).join(' and ')
      return `When ${conditionPhrase} ${conditionCount} conditions match, ${actionText || 'no actions are configured'}.`
    },
  }
}

function hasCompleteValue(value: Forms8ConditionValue): boolean {
  switch (value.kind) {
    case 'number':
    case 'text':
      return value.value.trim().length > 0
    case 'number-range':
      return value.lower.trim().length > 0 && value.upper.trim().length > 0
    case 'text-list':
      return value.values.some((item) => item.trim().length > 0)
    case 'choice':
      return value.optionId.length > 0
    case 'choice-many':
      return value.optionIds.length > 0
    case 'boolean':
      return true
  }
}

function choiceOperators(locale: Forms8PreviewLocale): readonly Forms8OperatorDefinition[] {
  return locale === 'de'
    ? [
        { id: 'is', label: 'ist', valueKind: 'choice' },
        { id: 'is-not', label: 'ist nicht', valueKind: 'choice' },
        { id: 'is-any-of', label: 'ist einer von', valueKind: 'choice-many' },
      ]
    : [
        { id: 'is', label: 'is', valueKind: 'choice' },
        { id: 'is-not', label: 'is not', valueKind: 'choice' },
        { id: 'is-any-of', label: 'is any of', valueKind: 'choice-many' },
      ]
}

function textOperators(locale: Forms8PreviewLocale): readonly Forms8OperatorDefinition[] {
  return locale === 'de'
    ? [
        { id: 'is', label: 'ist', valueKind: 'text' },
        { id: 'is-not', label: 'ist nicht', valueKind: 'text' },
        { id: 'is-any-of', label: 'ist einer von', valueKind: 'text-list' },
      ]
    : [
        { id: 'is', label: 'is', valueKind: 'text' },
        { id: 'is-not', label: 'is not', valueKind: 'text' },
        { id: 'is-any-of', label: 'is any of', valueKind: 'text-list' },
      ]
}

function fieldsFor(locale: Forms8PreviewLocale): readonly Forms8ConditionField[] {
  const numericOperators: readonly Forms8OperatorDefinition[] =
    locale === 'de'
      ? [
          { id: 'equals', label: 'ist gleich', valueKind: 'number' },
          { id: 'greater-than', label: 'ist größer als', valueKind: 'number' },
          { id: 'between', label: 'liegt zwischen', valueKind: 'number-range' },
        ]
      : [
          { id: 'equals', label: 'equals', valueKind: 'number' },
          { id: 'greater-than', label: 'greater than', valueKind: 'number' },
          { id: 'between', label: 'between', valueKind: 'number-range' },
        ]
  const booleanOperator: Forms8OperatorDefinition = {
    id: 'is',
    label: locale === 'de' ? 'ist' : 'is',
    valueKind: 'boolean',
  }
  const labels =
    locale === 'de'
      ? {
          palletWeight: 'Palettengewicht',
          palletHeight: 'Palettenhöhe',
          skuCategory: 'SKU-Kategorie',
          destinationZone: 'Zielzone',
          carrierName: 'Transportunternehmen',
          referenceCode: 'Referenznummer',
          hazardousFlag: 'Gefahrgutkennzeichnung',
          frozen: 'Tiefgekühlt',
        }
      : {
          palletWeight: 'Pallet weight',
          palletHeight: 'Pallet height',
          skuCategory: 'SKU category',
          destinationZone: 'Destination zone',
          carrierName: 'Carrier name',
          referenceCode: 'Reference code',
          hazardousFlag: 'Hazardous flag',
          frozen: 'Frozen',
        }

  return [
    {
      id: 'pallet-weight',
      label: labels.palletWeight,
      kind: 'number',
      unitLabel: 'kg',
      operators: numericOperators,
      modelEvidence: 'source-observed',
    },
    {
      id: 'pallet-height',
      label: labels.palletHeight,
      kind: 'number',
      operators: numericOperators,
      modelEvidence: 'inferred-from-field-type',
    },
    {
      id: 'sku-category',
      label: labels.skuCategory,
      kind: 'choice',
      operators: choiceOperators(locale),
      options: {
        completeness: 'partial',
        items: [{ id: 'frozen', label: labels.frozen }],
      },
      modelEvidence: 'source-observed',
    },
    {
      id: 'destination-zone',
      label: labels.destinationZone,
      kind: 'choice',
      operators: choiceOperators(locale),
      options: { completeness: 'unobserved', items: [] },
      modelEvidence: 'inferred-from-field-type',
    },
    {
      id: 'carrier-name',
      label: labels.carrierName,
      kind: 'text',
      operators: textOperators(locale),
      modelEvidence: 'inferred-from-field-type',
    },
    {
      id: 'reference-code',
      label: labels.referenceCode,
      kind: 'text',
      operators: textOperators(locale),
      modelEvidence: 'inferred-from-field-type',
    },
    {
      id: 'hazardous-flag',
      label: labels.hazardousFlag,
      kind: 'boolean',
      operators: [booleanOperator],
      modelEvidence: 'source-observed',
    },
  ]
}

const sourceActions: readonly Forms8RuleAction[] = [
  {
    id: 'action-route-to-cold-store',
    kind: 'route-to-zone',
    label: 'Route to zone',
    zoneId: 'cold-store',
    zoneLabel: 'Cold store',
  },
  {
    id: 'action-notify-cold-chain-lead',
    kind: 'notify',
    label: 'Notify',
    recipientId: 'cold-chain-lead',
    recipientLabel: 'the cold-chain lead',
  },
]

function sourceInitialConditions(locale: Forms8PreviewLocale): readonly Forms8Condition[] {
  const fields = fieldsFor(locale)
  const weightField = fields.find((field) => field.id === 'pallet-weight')
  const skuField = fields.find((field) => field.id === 'sku-category')
  const hazardField = fields.find((field) => field.id === 'hazardous-flag')
  const greaterThan = weightField?.operators.find((operator) => operator.id === 'greater-than')
  const isCategory = skuField?.operators.find((operator) => operator.id === 'is')
  const isHazardous = hazardField?.operators.find((operator) => operator.id === 'is')
  if (!greaterThan || !isCategory || !isHazardous) {
    throw new RangeError('Forms 8 source condition catalogs are incomplete.')
  }

  const weightValue: Forms8ConditionValue = { kind: 'number', value: '500' }
  const categoryValue: Forms8ConditionValue = { kind: 'choice', optionId: 'frozen' }
  const hazardousValue: Forms8ConditionValue = { kind: 'boolean', value: false }
  return [
    {
      id: 'condition-pallet-weight',
      fieldId: 'pallet-weight',
      operatorId: greaterThan.id,
      value: weightValue,
    },
    {
      id: 'condition-sku-category',
      fieldId: 'sku-category',
      operatorId: isCategory.id,
      value: categoryValue,
    },
    {
      id: 'condition-hazardous-flag',
      fieldId: 'hazardous-flag',
      operatorId: isHazardous.id,
      value: hazardousValue,
    },
  ]
}

export function createForms8PreviewFixture(locale: Forms8PreviewLocale = 'en'): Forms8PreviewFixture {
  const copy = copyFor(locale)
  const fields = fieldsFor(locale)
  const storeSeed: Forms8PreviewStoreSeed = {
    fields,
    initialMatchMode: 'all',
    initialConditions: sourceInitialConditions(locale),
    actions: sourceActions.map((action) =>
      locale === 'de'
        ? action.kind === 'route-to-zone'
          ? { ...action, label: 'Weiterleiten an Zone', zoneLabel: 'Kühllager' }
          : { ...action, label: 'Benachrichtigen', recipientLabel: 'die Kühlkettenleitung' }
        : { ...action },
    ),
  }

  return {
    locale,
    copy,
    storeSeed,
    contentFor: (state) => {
      const isComplete = state.conditions.every((condition) => hasCompleteValue(condition.value))
      return {
        copy,
        fields: state.fields,
        matchMode: state.matchMode,
        conditions: state.conditions,
        actions: state.actions,
        summary: copy.formatSummary(state.matchMode, state.conditions.length, state.actions),
        isComplete,
        validationMessage: isComplete ? undefined : copy.incompleteConditionMessage,
        conditionCollection: { kind: 'pane-scroll', capacityEvidence: 'not-observed' },
      }
    },
  }
}
