import type { HbarAppUiWizardContent } from '../../packages/hbar-app-ui/src/index'

const grown = { kind: 'content-grown', expectedMaximum: 16 } as const
const scroll = { kind: 'pane-scroll', expectedMaximum: 64 } as const

export const HBAR_APP_UI_WIZARD_FIXTURES: HbarAppUiWizardContent = {
  referenceReview: {
    labels: {
      title: 'Review before sending', detail: 'Nothing sends until you confirm. Each section can still be changed.',
      edit: 'Edit', editSection: (title) => `Edit ${title}`,
      confirmation: 'I have checked the audience and schedule. Sending to 18,204 contacts cannot be undone once delivery starts.',
      back: 'Back', send: 'Schedule send', empty: 'Nothing to review',
    },
    steps: [{id: 'details', label: 'Details'}, {id: 'schedule', label: 'Schedule'}, {id: 'recipients', label: 'Recipients'}, {id: 'review', label: 'Review'}],
    currentStepId: 'review', completedStepIds: ['details', 'schedule', 'recipients'],
    sections: [
      {id: 'campaign', title: 'Campaign details', rows: [
        {id: 'name', label: 'Name', value: 'Spring product update'},
        {id: 'sender', label: 'Sender', value: 'Kepler Works <news@kepler.works>'},
        {id: 'reply', label: 'Reply-to', value: 'support@kepler.works'},
      ]},
      {id: 'schedule', title: 'Schedule', rows: [
        {id: 'send-at', label: 'Send at', value: '24 April 2026, 09:00'},
        {id: 'timezone', label: 'Timezone', value: 'Europe/Lisbon'},
        {id: 'throttle', label: 'Throttle', value: '5,000 per hour'},
      ]},
      {id: 'recipients', title: 'Recipients', rows: [
        {id: 'audience', label: 'Audience', value: 'Product subscribers'},
        {id: 'size', label: 'Size', value: '18,204 contacts'},
        {id: 'suppressed', label: 'Suppressed', value: '412 unsubscribed'},
      ]},
    ],
    confirmed: false, listStrategy: grown, onConfirmationChange() {},
  },
  referenceEnvironment: {
    labels: {
      title: 'New environment', detail: 'staging · eu-west', back: 'Back to region', save: 'Save and exit',
      heading: 'Pick the services this environment runs', subtitle: 'Anything left out can be attached later without a rebuild.',
      group: 'Available services', safety: 'Every selected service is provisioned inside the same private network. Nothing is exposed publicly until you add a route.',
      selection: (count, total) => `${count} of ${total} selected`, estimate: (seconds) => `Adds about ${seconds}s to each deploy`,
      next: 'Set limits', empty: 'No services available',
    },
    steps: [{id: 'region', label: 'Region'}, {id: 'services', label: 'Services'}, {id: 'limits', label: 'Limits'}, {id: 'review', label: 'Review'}],
    currentStepId: 'services', completedStepIds: ['region'],
    services: [
      {id: 'postgres', label: 'Managed Postgres', detail: 'Primary store with nightly snapshots.', icon: 'database', deploySeconds: 12},
      {id: 'cache', label: 'In-memory cache', detail: 'Shared key store for sessions.', icon: 'cache', deploySeconds: 4},
      {id: 'storage', label: 'Object storage', detail: 'Buckets for uploads and exports.', icon: 'storage', deploySeconds: 6},
      {id: 'queue', label: 'Background queue', detail: 'Retries and dead-letter handling.', icon: 'queue', deploySeconds: 8},
      {id: 'jobs', label: 'Scheduled jobs', detail: 'Cron runners with a shared log.', icon: 'clock', deploySeconds: 5},
      {id: 'search', label: 'Search index', detail: 'Rebuilt from Postgres on write.', icon: 'search', deploySeconds: 14},
      {id: 'metrics', label: 'Metrics pipeline', detail: 'Request, queue, and job counters.', icon: 'activity', deploySeconds: 7},
      {id: 'logs', label: 'Log retention', detail: 'Thirty days of searchable output.', icon: 'log', deploySeconds: 3},
    ],
    selectedServiceIds: ['postgres', 'cache', 'queue'], listStrategy: scroll, onServiceToggle() {},
  },
  referenceUpgrade: {
    labels: {
      title: 'Billing upgrade', detail: 'Change plan, seats, and payment terms before renewal.', draft: 'Draft',
      plan: 'Plan', seatNote: 'Seat count carries over from the current term. You can adjust it on the next step before anything is charged.',
      invoice: 'Invoice preview', annual: 'Annual', due: 'Due today', totalDetail: 'Business · 42 seats · billed once',
      footer: 'Nothing is charged until the review step.', next: 'Next',
    },
    steps: [{id: 'plan', label: 'Plan'}, {id: 'seats', label: 'Seats'}, {id: 'payment', label: 'Payment'}, {id: 'review', label: 'Review'}],
    plans: [
      {id: 'team', label: 'Team', detail: 'Workspace controls for growing product teams.', price: '$49/seat/mo'},
      {id: 'business', label: 'Business', detail: 'SAML, audit exports, and priority support.', price: '$72/seat/mo', badge: 'Recommended'},
      {id: 'enterprise', label: 'Enterprise', detail: 'Procurement review and account governance.', price: '$96/seat/mo'},
    ],
    summaryRows: [
      {id: 'seats', label: 'Seats', detail: '42 seats, annual', value: '$36,288'},
      {id: 'credit', label: 'Term credit', detail: '15% on annual', value: '−$5,443'},
      {id: 'support', label: 'Support', detail: 'Priority response', value: '$390'},
    ],
    metadataRows: [{id: 'renewal', label: 'Renewal', value: 'May 31, 2026'}, {id: 'po', label: 'Purchase order', value: 'PO-2026-184'}],
    total: '$31,235', listStrategy: grown, stepId: 'plan', selectedPlanId: 'business', onStepChange() {}, onPlanChange() {},
  },
  referenceInvoice: {
    labels: {
      title: 'Send invoice', progress: (step, total) => `${step} / ${total}`, progressBar: 'Invoice progress', close: 'Close',
      customer: 'Customer details', customerDetail: 'Customer, invoice references, and billing terms.',
      customerGroup: 'Customer', customerGroupDetail: 'Billable account and invoice reference.',
      required: 'Required', terms: 'Terms', termsDetail: 'Dates, currency, and collection method.',
      currencyBadge: 'USD', termsBadge: 'Net 14', clearCustomer: 'Clear customer', save: 'Save draft', next: 'Next step',
    },
    step: 1, totalSteps: 4, listStrategy: scroll,
    customerFields: [
      {id: 'customer', label: 'Customer', value: 'Orchid Ledger Group', kind: 'text', information: true, clear: true},
      {id: 'tax-id', label: 'Tax ID', value: 'US-88-2947135', kind: 'text', information: true, icon: 'building'},
      {id: 'number', label: 'Invoice number', value: 'INV-2048', kind: 'text', icon: 'hash'},
      {id: 'purchase-order', label: 'PO reference', value: 'PO-7418', kind: 'text'},
    ],
    termsFields: [
      {id: 'issue-date', label: 'Issue date', value: 'Apr 24, 2026', kind: 'text', icon: 'calendar'},
      {id: 'due-date', label: 'Due date', value: 'May 08, 2026', kind: 'text', icon: 'calendar'},
      {id: 'currency', label: 'Currency', value: 'USD', kind: 'select', options: [{id: 'USD', label: 'USD'}, {id: 'EUR', label: 'EUR'}, {id: 'GBP', label: 'GBP'}]},
      {id: 'terms', label: 'Payment terms', value: 'Net 14', kind: 'select', options: [{id: 'Net 14', label: 'Net 14'}, {id: 'Net 30', label: 'Net 30'}, {id: 'Due on receipt', label: 'Due on receipt'}]},
      {id: 'collection', label: 'Collection', value: 'ACH transfer', kind: 'select', options: [{id: 'ACH transfer', label: 'ACH transfer'}, {id: 'Card', label: 'Card'}, {id: 'Wire', label: 'Wire'}]},
      {id: 'address', label: 'Billing address', value: '14 Warren Street, Suite 620, New York, NY', kind: 'text'},
    ],
    onFieldChange() {},
  },
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
    referenceReview: HBAR_APP_UI_WIZARD_FIXTURES.referenceReview && {
      ...HBAR_APP_UI_WIZARD_FIXTURES.referenceReview,
      labels: {
        title: '发送前审核', detail: '确认后才会发送。所有分区仍可修改。',
        edit: '编辑', editSection: (title) => `编辑${title}`,
        confirmation: '我已核对收件人和发送时间。向 18,204 位联系人发送后，无法撤销。',
        back: '返回', send: '安排发送', empty: '没有可审核的内容',
      },
      steps: [{id: 'details', label: '详情'}, {id: 'schedule', label: '日程'}, {id: 'recipients', label: '收件人'}, {id: 'review', label: '审核'}],
      sections: [{id: 'campaign', title: '活动详情', rows: [{id: 'name', label: '名称', value: '春季产品更新'}]}],
    },
    referenceEnvironment: HBAR_APP_UI_WIZARD_FIXTURES.referenceEnvironment && {
      ...HBAR_APP_UI_WIZARD_FIXTURES.referenceEnvironment,
      labels: {
        title: '新环境', detail: '预发布 · 欧洲西区', back: '返回区域', save: '保存并退出',
        heading: '选择此环境运行的服务', subtitle: '未选择的服务可以稍后添加，无需重建环境。',
        group: '可用服务', safety: '所有选中的服务都在同一私有网络内运行。添加路由之前，服务不会向公众开放。',
        selection: (count, total) => `已选择 ${count} / ${total} 项`, estimate: (seconds) => `每次部署增加约 ${seconds} 秒`,
        next: '设置限制', empty: '暂无可用服务',
      },
      steps: [{id: 'region', label: '区域'}, {id: 'services', label: '服务'}, {id: 'limits', label: '限制'}, {id: 'review', label: '审核'}],
      services: [{id: 'postgres', label: '托管数据库', detail: '每日夜间快照与私有备份。', icon: 'database', deploySeconds: 12}],
      selectedServiceIds: ['postgres'],
    },
    referenceUpgrade: HBAR_APP_UI_WIZARD_FIXTURES.referenceUpgrade && {
      ...HBAR_APP_UI_WIZARD_FIXTURES.referenceUpgrade,
      labels: {
        title: '账单升级', detail: '续费前调整套餐与席位。', draft: '草稿', plan: '套餐', seatNote: '席位沿用当前期限，下一步可调整。',
        invoice: '发票预览', annual: '年付', due: '今日应付', totalDetail: '商业版 · 42 席 · 一次付清', footer: '审核前不会扣款。', next: '下一步',
      },
      steps: [{id: 'plan', label: '套餐'}, {id: 'seats', label: '席位'}],
      plans: [{id: 'team', label: '团队版', detail: '适合成长团队。', price: '¥49/席/月'}, {id: 'business', label: '商业版', detail: '审计与支持。', price: '¥72/席/月'}],
      summaryRows: [{id: 'seats', label: '席位', detail: '42 席，年付', value: '¥36,288'}],
      metadataRows: [{id: 'renewal', label: '续费', value: '2026 年 5 月 31 日'}],
      total: '¥31,235',
    },
    referenceInvoice: HBAR_APP_UI_WIZARD_FIXTURES.referenceInvoice && {
      ...HBAR_APP_UI_WIZARD_FIXTURES.referenceInvoice,
      labels: {
        title: '发送发票', progress: (step, total) => `${step} / ${total}`, progressBar: '发票进度', close: '关闭',
        customer: '客户资料', customerDetail: '客户、发票编号与付款条款。', required: '必填',
        customerGroup: '客户', customerGroupDetail: '付款账户与发票编号。',
        terms: '条款', termsDetail: '日期、币种与收款方式。', currencyBadge: '人民币', termsBadge: '收到即付',
        clearCustomer: '清除客户', save: '保存草稿', next: '下一步',
      },
      customerFields: [{id: 'customer', label: '客户', value: '华港公司', kind: 'text', information: true, clear: true}],
      termsFields: [{id: 'currency', label: '币种', value: 'CNY', kind: 'select', options: [{id: 'CNY', label: '人民币'}, {id: 'USD', label: '美元'}]}],
    },
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
  const invoice = HBAR_APP_UI_WIZARD_FIXTURES.referenceInvoice!
  const upgrade = HBAR_APP_UI_WIZARD_FIXTURES.referenceUpgrade!
  const environment = HBAR_APP_UI_WIZARD_FIXTURES.referenceEnvironment!
  const review = HBAR_APP_UI_WIZARD_FIXTURES.referenceReview!
  return {
    ...HBAR_APP_UI_WIZARD_FIXTURES,
    referenceReview: {
      ...review,
      sections: [...review.sections, ...Array.from({length: 25}, (_, index) => ({id: `extended-${index}`, title: `Additional review section ${index + 1}`, rows: [{id: 'long', label: `Regional compliance and delivery policy ${index + 1}`, value: `Private delivery target ${index + 1} with long account name` }]}))],
    },
    referenceEnvironment: {
      ...environment,
      services: [...environment.services, ...Array.from({length: 40}, (_, index) => ({id: `extended-${index}`, label: `Additional service ${index + 1} for a large environment`, detail: `Private provisioning details for regional workspace ${index + 1}.`, icon: 'database' as const, deploySeconds: 2}))],
    },
    referenceUpgrade: {
      ...upgrade,
      plans: [...upgrade.plans, ...Array.from({length: 30}, (_, index) => ({id: `extended-${index}`, label: `Extended plan ${index + 1}`, detail: `Enterprise agreement for region ${index + 1}`, price: '$99/seat/mo'}))],
    },
    referenceInvoice: {
      ...invoice,
      termsFields: [...invoice.termsFields, ...Array.from({length: 40}, (_, index) => ({id: `extended-${index}`, label: `Additional billing term ${index + 1}`, value: `Value ${index + 1}`, kind: 'text' as const}))],
    },
    referenceInformation: {
      ...flow,
      fields: [...flow.fields, ...Array.from({length: 40}, (_, index) => ({id: `extended-${index}`, label: `Long review field ${index + 1} for the billing owner`, value: `Value ${index + 1}`, kind: 'text' as const}))],
    },
  }
}
