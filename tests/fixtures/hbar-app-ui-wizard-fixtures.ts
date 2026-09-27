import type { HbarAppUiWizardContent } from '../../packages/hbar-app-ui/src/index'

const grown = { kind: 'content-grown', expectedMaximum: 16 } as const
const scroll = { kind: 'pane-scroll', expectedMaximum: 64 } as const

export const HBAR_APP_UI_WIZARD_FIXTURES: HbarAppUiWizardContent = {
  referenceInformation: {
    labels: {
      title: 'Your information', detail: 'Billing owner details. These appear on every receipt.',
      emailHint: 'Receipts and payment failures go to this address.', back: 'Back', next: 'Next step',
      steps: 'Account setup steps', required: '*', empty: 'No information fields',
    },
    steps: [{id: 'information', label: 'Information'}, {id: 'payment', label: 'Payment'}, {id: 'completed', label: 'Completed'}],
    fields: [
      {id: 'first-name', label: 'First name', value: 'Mara', kind: 'text', required: true},
      {id: 'last-name', label: 'Last name', value: 'Chen', kind: 'text', required: true},
      {id: 'company', label: 'Company', value: 'Kepler Works', kind: 'text', required: true},
      {id: 'handle', label: 'Public handle', value: 'kepler-works', kind: 'text', prefix: '@'},
      {id: 'role', label: 'Role', value: 'Procurement owner', kind: 'select', options: [{id: 'Procurement owner', label: 'Procurement owner'}, {id: 'Finance', label: 'Finance'}, {id: 'Engineering', label: 'Engineering'}, {id: 'Founder', label: 'Founder'}]},
      {id: 'country', label: 'Country', value: 'United States', kind: 'select', options: [{id: 'United States', label: 'United States'}, {id: 'Portugal', label: 'Portugal'}, {id: 'Germany', label: 'Germany'}, {id: 'Japan', label: 'Japan'}]},
      {id: 'email', label: 'Email address', value: 'mara@kepler.works', kind: 'email', required: true},
      {id: 'mobile', label: 'Mobile', value: '+1 415 5151', kind: 'tel', prefix: 'US'},
    ],
    stepId: 'information', onStepChange() {}, onFieldChange() {},
  },
  information: {
    labels: {
      title: 'Your information',
      detail: 'Billing owner details. These appear on every receipt.',
      steps: 'Account setup steps',
      back: 'Back',
      next: 'Next step',
      complete: 'Done',
      required: '*',
      empty: 'No information fields',
    },
    steps: [
      { id: 'information', label: 'Information' },
      { id: 'payment', label: 'Payment' },
      { id: 'completed', label: 'Completed' },
    ],
    fields: [
      { id: 'first-name', label: 'First name', value: 'Mara', required: true },
      { id: 'last-name', label: 'Last name', value: 'Chen', required: true },
      { id: 'company', label: 'Company', value: 'Kepler Works', required: true },
      { id: 'role', label: 'Role', value: 'Procurement owner' },
      { id: 'email', label: 'Email address', value: 'mara@kepler.works', type: 'email', required: true },
      { id: 'mobile', label: 'Mobile', value: '+1 415 5151', type: 'tel' },
    ],
    listStrategy: grown,
  },
  invoice: {
    labels: {
      title: 'Create invoice',
      detail: 'Review customer and payment details before sending.',
      close: 'Close invoice',
      customer: 'Customer details',
      invoice: 'Invoice details',
      currency: 'Currency',
      terms: 'Payment terms',
      notes: 'Notes',
      save: 'Save draft',
      send: 'Send invoice',
      empty: 'No invoice fields',
    },
    fields: [
      { id: 'customer', label: 'Customer', value: 'Orchid Ledger Group', required: true },
      { id: 'tax-id', label: 'Tax ID', value: 'US-88-2947135' },
      { id: 'number', label: 'Invoice number', value: 'INV-2048', required: true },
      { id: 'purchase-order', label: 'Purchase order', value: 'PO-7418' },
      { id: 'issue-date', label: 'Issue date', value: '2026-04-24', type: 'date' },
      { id: 'due-date', label: 'Due date', value: '2026-05-08', type: 'date' },
    ],
    currencies: [
      { id: 'usd', label: 'USD · US dollar' },
      { id: 'eur', label: 'EUR · Euro' },
      { id: 'gbp', label: 'GBP · Pound sterling' },
    ],
    initialCurrencyId: 'usd',
    terms: [
      { id: 'net-14', label: 'Net 14' },
      { id: 'net-30', label: 'Net 30' },
      { id: 'due', label: 'Due on receipt' },
    ],
    initialTermsId: 'net-14',
    note: 'The recipient gets a secure payment link and a PDF copy.',
    listStrategy: grown,
  },
  upgrade: {
    labels: {
      title: 'Billing upgrade',
      detail: 'Change plan, seats, and payment terms before renewal.',
      plans: 'Plan',
      invoice: 'Invoice preview',
      due: 'Due today',
      next: 'Next',
      empty: 'No plans available',
    },
    plans: [
      { id: 'team', label: 'Team', detail: 'Workspace controls for growing product teams.', price: '$49 / seat' },
      {
        id: 'business',
        label: 'Business',
        detail: 'SAML, audit exports, and priority support.',
        price: '$72 / seat',
        badge: 'Recommended',
      },
      {
        id: 'enterprise',
        label: 'Enterprise',
        detail: 'Procurement review and account governance.',
        price: '$96 / seat',
      },
    ],
    initialPlanId: 'business',
    summaries: {
      team: [{ id: 'seats', label: '42 seats, annual', value: '$24,696' }],
      business: [
        { id: 'seats', label: '42 seats, annual', value: '$36,288' },
        { id: 'credit', label: 'Annual term credit', value: '−$5,443' },
        { id: 'support', label: 'Priority response', value: '$390' },
      ],
      enterprise: [{ id: 'seats', label: '42 seats, annual', value: '$48,384' }],
    },
    totals: { team: '$21,235', business: '$31,235', enterprise: '$42,235' },
    listStrategy: grown,
  },
  environment: {
    labels: {
      title: 'New environment',
      detail: 'staging · eu-west',
      services: 'Environment services',
      back: 'Back to region',
      save: 'Save and exit',
      next: 'Set limits',
      selected: (count, total) => `${count} of ${total} selected`,
      empty: 'No services available',
    },
    services: [
      { id: 'postgres', label: 'Managed Postgres', detail: 'Primary store with nightly snapshots.' },
      { id: 'cache', label: 'In-memory cache', detail: 'Shared key store for sessions.' },
      { id: 'storage', label: 'Object storage', detail: 'Buckets for uploads and exports.' },
      { id: 'queue', label: 'Background queue', detail: 'Retries and dead-letter handling.' },
      { id: 'jobs', label: 'Scheduled jobs', detail: 'Cron runners with a shared log.' },
      { id: 'search', label: 'Search index', detail: 'Rebuilt from Postgres on write.' },
    ],
    initialServiceIds: ['postgres', 'cache', 'queue'],
    listStrategy: scroll,
  },
  review: {
    labels: {
      title: 'Review before sending',
      detail: 'Confirm the delivery, audience, and safeguards.',
      edit: (label) => `Edit ${label}`,
      back: 'Back',
      submit: 'Send request',
      submitted: 'Request sent',
      empty: 'Nothing to review',
    },
    sections: [
      { id: 'audience', label: 'Audience', detail: 'Workspace finance owners', value: '14 people', status: 'Ready' },
      { id: 'delivery', label: 'Delivery', detail: 'Email with PDF attachment', value: 'Monday 09:00' },
      { id: 'approval', label: 'Approval', detail: 'Controller sign-off required', value: 'Mara Chen' },
    ],
    listStrategy: grown,
  },
  migration: {
    labels: {
      title: 'Migrating workspace',
      detail: 'You can leave this screen. The migration continues in the background.',
      cancel: 'Cancel migration',
      continue: 'View workspace',
      progress: (value) => `${value}% complete`,
      empty: 'No migration tasks',
    },
    items: [
      { id: 'members', label: 'Members and roles', detail: '312 records', status: 'Complete', progress: 100 },
      { id: 'projects', label: 'Projects', detail: '84 of 126 projects', status: 'Running', progress: 67 },
      { id: 'files', label: 'Files and attachments', detail: 'Waiting for projects', status: 'Queued', progress: 0 },
    ],
    listStrategy: scroll,
  },
  shipping: {
    labels: {
      title: 'Where do you ship to?',
      detail: 'Choose the delivery footprint that matches your business.',
      options: 'Shipping regions',
      back: 'Back',
      continue: 'Continue',
      empty: 'No shipping regions',
    },
    options: [
      { id: 'domestic', label: 'Domestic only', detail: 'One country and one tax region.' },
      { id: 'regional', label: 'A few nearby countries', detail: 'Regional carriers and customs support.' },
      { id: 'global', label: 'Worldwide', detail: 'International rates, duties, and tracking.' },
    ],
    initialOptionId: 'regional',
    listStrategy: grown,
  },
}

export function createHbarAppUiWizardLocalizedFixtures(): HbarAppUiWizardContent {
  return {
    ...HBAR_APP_UI_WIZARD_FIXTURES,
    referenceInformation: HBAR_APP_UI_WIZARD_FIXTURES.referenceInformation && {
      ...HBAR_APP_UI_WIZARD_FIXTURES.referenceInformation,
      labels: {
        title: '你的信息', detail: '账单负责人资料，将显示在每张收据上。', emailHint: '收据和支付失败信息发送到这个地址。',
        back: '上一步', next: '下一步', steps: '账户设置步骤', required: '*', empty: '没有信息字段',
      },
      steps: [{id: 'information', label: '资料'}, {id: 'payment', label: '付款'}, {id: 'completed', label: '完成'}],
      fields: [{id: 'first-name', label: '名字', value: '陈玛拉', kind: 'text', required: true}],
    },
    information: {
      ...HBAR_APP_UI_WIZARD_FIXTURES.information!,
      labels: {
        ...HBAR_APP_UI_WIZARD_FIXTURES.information!.labels,
        title: '你的信息',
        detail: '账单负责人信息将显示在每张收据上。',
        steps: '账户设置步骤',
        back: '返回',
        next: '下一步',
        complete: '完成',
        empty: '没有信息字段',
      },
      steps: [{ id: 'information', label: '基本信息' }],
      fields: [{ id: 'name', label: '姓名', value: '陈玛拉', required: true }],
    },
  }
}

export function createHbarAppUiWizardOverflowFixtures(): HbarAppUiWizardContent {
  const flow = HBAR_APP_UI_WIZARD_FIXTURES.referenceInformation!
  return {
    ...HBAR_APP_UI_WIZARD_FIXTURES,
    referenceInformation: {
      ...flow,
      fields: [...flow.fields, ...Array.from({length: 40}, (_, index) => ({id: `extended-${index}`, label: `Long review field ${index + 1} for the billing owner`, value: `Value ${index + 1}`, kind: 'text' as const}))],
    },
  }
}
