import type {HbarAppUiBillingContent, HbarAppUiBillingInvoiceComposerContent, HbarAppUiBillingRecoveryContent, HbarAppUiBillingStatementContent, HbarAppUiBillingUsageContent} from '../../packages/hbar-app-ui/src/index'

const statement: HbarAppUiBillingStatementContent = {
    labels: {
        pageTitle: 'Billing',
        pageDescription: 'June statement · 7 invoices outstanding',
        export: 'Export',
        balanceLabel: 'OUTSTANDING BALANCE',
        ledgerTitle: 'Invoice ledger',
        ledgerSummary: '8 shown · 2 past due',
        recoveryLeading: '',
        recoveryEmphasis: '$1,530 overdue',
        recoveryTrailing: ' across 2 invoices. Auto-collection is on.',
        viewStatement: 'View statement',
        startRecovery: 'Start recovery',
        searchLabel: 'Search customers',
        searchPlaceholder: 'Search customers',
        newInvoice: 'New invoice',
        customerColumn: 'Customer',
        invoiceColumn: 'Invoice',
        planColumn: 'Plan',
        amountColumn: 'Amount',
        dueColumn: 'Due',
        statusColumn: 'Status',
        actionsForInvoice: (invoice) => `Actions for ${invoice}`,
        emptyLedger: 'No invoices match this search.',
    },
    balance: {
        amount: '$14,170',
        detail: '16 invoices this cycle. Oldest past due 18 days.',
        metrics: [
            {id: 'current', label: 'CURRENT', value: '$12,640'},
            {id: 'overdue', label: 'OVERDUE', value: '$1,530', tone: 'danger'},
            {id: 'collected', label: 'COLLECTED', value: '$48,480', tone: 'positive'},
            {id: 'payout', label: 'NEXT PAYOUT', value: 'Jun 30'},
        ],
    },
    invoices: [
        {id: 'inv-20418', customer: 'Halcyon Pay', customerMeta: 'ACC-3092', invoice: 'INV-20418', invoiceMeta: 'May usage · seats', plan: 'Scale', amount: '$890', paymentMethod: 'Visa ending 4242', dueDate: 'May 28', dueDetail: '18d overdue', status: 'Past due', statusTone: 'danger'},
        {id: 'inv-20402', customer: 'Lumendesk', customerMeta: 'ACC-3088', invoice: 'INV-20402', invoiceMeta: 'May usage overage', plan: 'Growth', amount: '$640', paymentMethod: 'Mastercard ending 8829', dueDate: 'Jun 10', dueDetail: '6d overdue', status: 'Past due', statusTone: 'danger'},
        {id: 'inv-20425', customer: 'Meridian Labs', customerMeta: 'ACC-3090', invoice: 'INV-20425', invoiceMeta: 'June seats', plan: 'Growth', amount: '$2,480', paymentMethod: 'Mastercard ending 4417', dueDate: 'Jun 19', dueDetail: 'Due in 3d', status: 'Open', statusTone: 'neutral'},
        {id: 'inv-20429', customer: 'Orbital Systems', customerMeta: 'ACC-3101', invoice: 'INV-20429', invoiceMeta: 'June seats', plan: 'Scale', amount: '$4,800', paymentMethod: 'Visa ending 1190', dueDate: 'Jun 22', dueDetail: 'Due in 6d', status: 'Open', statusTone: 'neutral'},
        {id: 'inv-20419', customer: 'Northwind Retail', customerMeta: 'ACC-3072', invoice: 'INV-20419', invoiceMeta: 'June seats', plan: 'Growth', amount: '$2,980', paymentMethod: 'ACH transfer', dueDate: 'Jun 25', dueDetail: 'Due in 9d', status: 'Open', statusTone: 'neutral'},
        {id: 'inv-20423', customer: 'Cedar Labs', customerMeta: 'ACC-3085', invoice: 'INV-20423', invoiceMeta: 'June usage', plan: 'Growth', amount: '$1,950', paymentMethod: 'Visa ending 7732', dueDate: 'Jun 28', dueDetail: 'Due in 12d', status: 'Open', statusTone: 'neutral'},
        {id: 'inv-20431', customer: 'Atlas Freight', customerMeta: 'ACC-3110', invoice: 'INV-20431', invoiceMeta: 'June seats', plan: 'Starter', amount: '$430', paymentMethod: 'Visa ending 6604', dueDate: 'Jun 30', dueDetail: 'Due in 14d', status: 'Open', statusTone: 'neutral'},
        {id: 'inv-20396', customer: 'Wexler Group', customerMeta: 'ACC-3061', invoice: 'INV-20396', invoiceMeta: 'May seats', plan: 'Scale', amount: '$5,240', paymentMethod: 'ACH transfer', dueDate: 'Jun 2', dueDetail: 'Paid Jun 1', status: 'Paid', statusTone: 'positive'},
    ],
    listStrategy: {kind: 'pane-scroll', expectedMaximum: 40},
}

const plans = {
    labels: {
        pageTitle: 'Plans',
        pageDescription: '3 plans · 3 live · edited 14 min ago by Amelia Whitfield',
        newPlan: 'New plan',
        unsavedTitle: 'Unsaved changes',
        unsavedDescription: '4 edits across Scale and Enterprise are not published yet.',
        discard: 'Discard',
        save: 'Save changes',
        entitlementsTitle: 'ENTITLEMENTS',
        addOnsTitle: 'ADD-ONS',
        addEntitlement: 'Add entitlement',
        editPlan: (name: string) => `Edit ${name}`,
        togglePlan: (name: string, label: string) => `${name} ${label}`,
        emptyPlans: 'No plans configured.',
    },
    initialDirty: true,
    plans: [
        {
            id: 'starter', name: 'Starter', status: 'Active', statusTone: 'positive' as const, meta: 'PLAN-Starter · 1,840 subscribers', price: '$29', priceSuffix: 'per seat / mo',
            entitlements: [{id: 'seats', label: 'Seats', value: '5 included', icon: 'people' as const}, {id: 'api', label: 'API calls', value: '50k / month', icon: 'bolt' as const}, {id: 'storage', label: 'Storage', value: '10 GB', icon: 'storage' as const}, {id: 'env', label: 'Environments', value: '1', icon: 'layers' as const}],
            addOns: [{id: 'extra-storage', label: 'Extra storage', value: '$9 / mo', icon: 'storage' as const}],
            toggles: [{id: 'active', label: 'Active', enabled: true}, {id: 'listed', label: 'Listed publicly', enabled: true}],
        },
        {
            id: 'growth', name: 'Growth', status: 'Active', statusTone: 'positive' as const, meta: 'PLAN-Growth · 1,120 subscribers', price: '$89', priceSuffix: 'per seat / mo',
            entitlements: [{id: 'seats', label: 'Seats', value: '20 included', icon: 'people' as const}, {id: 'api', label: 'API calls', value: '500k / month', icon: 'bolt' as const}, {id: 'storage', label: 'Storage', value: '100 GB', icon: 'storage' as const}, {id: 'env', label: 'Environments', value: '3', icon: 'layers' as const}],
            addOns: [{id: 'insights', label: 'Usage insights', value: '$19 / mo', icon: 'sparkles' as const}],
            toggles: [{id: 'active', label: 'Active', enabled: true}, {id: 'listed', label: 'Listed publicly', enabled: true}],
        },
        {
            id: 'scale', name: 'Scale', status: 'Active', statusTone: 'positive' as const, meta: 'PLAN-Scale · 214 subscribers', price: '$249', priceSuffix: 'per seat / mo',
            entitlements: [{id: 'seats', label: 'Seats', value: '100 included', icon: 'people' as const}, {id: 'api', label: 'API calls', value: '5M / month', icon: 'bolt' as const}, {id: 'storage', label: 'Storage', value: '1 TB', icon: 'storage' as const}, {id: 'env', label: 'Environments', value: '10', icon: 'layers' as const}],
            addOns: [{id: 'sso', label: 'SSO and SAML', value: '$99 / mo', icon: 'shield' as const}, {id: 'insights', label: 'Usage insights', value: '$19 / mo', icon: 'sparkles' as const}],
            toggles: [{id: 'active', label: 'Active', enabled: true}, {id: 'listed', label: 'Listed publicly', enabled: true}],
        },
    ],
    listStrategy: {kind: 'content-grown' as const, expectedMaximum: 8},
}

const invoiceComposer: HbarAppUiBillingInvoiceComposerContent = {
    labels: {
        pageTitle: 'New invoice', pageDescription: 'Saved automatically as a draft.', draft: 'Draft INV-20437',
        stepDetail: (position, total, label) => `Step ${position} of ${total} · ${label}`,
        saveDraft: 'Save draft', previousStep: 'Previous step', nextStep: 'Next step', complete: 'Review and send', savedNotice: 'Draft saved.',
    },
    steps: [
        {id: 'customer', label: 'Customer', description: 'Who is billed'},
        {id: 'line-items', label: 'Line items', description: 'What they owe'},
        {id: 'tax', label: 'Tax and discount', description: 'Adjustments'},
        {id: 'review', label: 'Review and send', description: 'Confirm'},
    ],
    sections: [
        {id: 'customer', title: 'Customer', description: 'Billable account and invoice reference.', fields: [
            {id: 'customer', label: 'Customer', kind: 'text', value: 'Northwind Retail', clearLabel: 'Clear customer'},
            {id: 'tax-id', label: 'Tax ID', kind: 'text', value: 'US-88-2947135'},
            {id: 'invoice-number', label: 'Invoice number', kind: 'text', value: 'INV-20437', prefix: '#'},
            {id: 'po-reference', label: 'PO reference', kind: 'text', value: 'PO-4471', placeholder: 'Optional. Printed on the invoice header.'},
        ]},
        {id: 'terms', title: 'Terms', description: 'Dates, currency, and how the balance is collected.', fields: [
            {id: 'issue-date', label: 'Issue date', kind: 'date', value: '2026-06-16'},
            {id: 'due-date', label: 'Due date', kind: 'date', value: '2026-06-30'},
            {id: 'currency', label: 'Currency', kind: 'select', value: 'usd', choices: [{id: 'usd', label: 'USD'}, {id: 'eur', label: 'EUR'}]},
            {id: 'payment-terms', label: 'Payment terms', kind: 'select', value: 'net-14', choices: [{id: 'net-14', label: 'Net 14'}, {id: 'net-30', label: 'Net 30'}]},
            {id: 'collection', label: 'Collection', kind: 'select', value: 'ach', choices: [{id: 'ach', label: 'ACH transfer'}, {id: 'card', label: 'Card'}]},
            {id: 'billing-address', label: 'Billing address', kind: 'text', value: 'Cedar Labs Inc. · 14 Warren Street, Suite 620'},
        ]},
        {id: 'tax', title: 'Tax and discount', description: 'Adjustments applied before sending.', fields: [
            {id: 'discount', label: 'Discount', kind: 'text', value: '5%'},
            {id: 'tax-rate', label: 'Sales tax', kind: 'text', value: '8.88%'},
        ]},
        {id: 'review', title: 'Review and send', description: 'Confirm the invoice before sending.', fields: [
            {id: 'recipient', label: 'Recipient email', kind: 'text', value: 'ap@cedarlabs.com'},
            {id: 'note', label: 'Note', kind: 'text', value: 'Thank you for your business.'},
        ]},
    ],
    initialStepId: 'customer',
}

const recovery: HbarAppUiBillingRecoveryContent = {
    labels: {
        pageTitle: 'Recovery queue', pageDescriptionLeading: '6 subscriptions with live retry paths · ', pageDescriptionEmphasis: '$23,950 at risk', rules: 'Rules', export: 'Export', retryDue: 'Retry due', retryAll: 'Retry all', retryNow: 'Retry now',
        listTitle: 'Past due subscriptions', listDescription: 'Retry schedule, payment method, and account owner.', managePlaybooks: 'Manage playbooks', customerColumn: 'Customer', statusColumn: 'Status', billingColumn: 'Billing', ownerColumn: 'Owner', amountColumn: 'Amount', retryColumn: 'Next retry', emptySubscriptions: 'No subscriptions need recovery.', retryAttemptLabel: (position, title) => `Attempt ${position} · ${title}`,
    },
    metrics: [
        {id: 'risk', label: 'Amount at risk', value: '$23,950', detail: 'Open failed charges', trend: '−8%', tone: 'danger', progress: 75},
        {id: 'recovered', label: 'Recovered', value: '$16,500', detail: 'Charges settled this month', trend: '+12%', tone: 'positive', progress: 62},
        {id: 'rate', label: 'Recovery rate', value: '25%', detail: 'Smart retries across accounts', trend: '+3%', progress: 25},
    ],
    subscriptions: [
        {id: 'sub-4712', customer: 'Halcyon Pay', customerMeta: 'SUB-4712 · Payments Cloud', status: 'Failed', statusTone: 'danger', plan: 'Enterprise', planMeta: 'Platform fee', owner: 'Priya Nandakumar', amount: '$6,200', paymentMethod: 'PM-7741', nextRetry: 'Jun 18', attemptSummary: 'Attempt 3 of 4', retryTitle: 'Retry attempts', retryDescription: 'Card update requested for Visa ending 4242.', invoice: 'INV-20418', actionLabel: 'Open retry attempts for Halcyon Pay', attempts: [{id: 'attempt-1', title: 'Insufficient funds', description: "Retried at the customer's usual top-up hour.", code: 'insufficient_funds', date: 'May 29'}, {id: 'attempt-2', title: 'Issuer declined', description: 'Issuer blocked a repeat attempt inside 72 hours.', code: 'do_not_honor', date: 'Jun 3'}, {id: 'attempt-3', title: 'Card declined', description: 'Hosted card update requested by email.', code: 'generic_decline', date: 'Jun 10'}]},
        {id: 'sub-4794', customer: 'Lumendesk', customerMeta: 'SUB-4794 · Database Cloud', status: 'Exhausted', statusTone: 'danger', plan: 'Scale', planMeta: 'Usage based', owner: 'Marcus Bell', amount: '$4,800', paymentMethod: 'PM-7743', nextRetry: 'Retries exhausted', attemptSummary: 'Attempt 4 of 4', retryTitle: 'Retry attempts', retryDescription: 'No further automatic retries are scheduled.', invoice: 'INV-20402', actionLabel: 'Open retry attempts for Lumendesk', attempts: []},
        {id: 'sub-4806', customer: 'Meridian Labs', customerMeta: 'SUB-4806 · Enterprise Grid', status: 'Retrying', statusTone: 'warning', plan: 'Scale', planMeta: 'Seat based', owner: 'Sofia Alvarez', amount: '$5,400', paymentMethod: 'PM-7742', nextRetry: 'Today', attemptSummary: 'Attempt 3 of 4', retryTitle: 'Retry attempts', retryDescription: 'A retry is scheduled today.', invoice: 'INV-20425', actionLabel: 'Open retry attempts for Meridian Labs', attempts: []},
        {id: 'sub-4820', customer: 'Cedar Labs', customerMeta: 'SUB-4820 · Insights', status: 'Retrying', statusTone: 'warning', plan: 'Growth', planMeta: 'Usage based', owner: 'Wei Chen', amount: '$3,150', paymentMethod: 'PM-7748', nextRetry: 'Jun 19', attemptSummary: 'Attempt 2 of 4', retryTitle: 'Retry attempts', retryDescription: 'A retry is scheduled for Jun 19.', invoice: 'INV-20423', actionLabel: 'Open retry attempts for Cedar Labs', attempts: []},
        {id: 'sub-4833', customer: 'Orbital Systems', customerMeta: 'SUB-4833 · Edge Delivery', status: 'Failed', statusTone: 'danger', plan: 'Growth', planMeta: 'Seat based', owner: 'Tomás Guerrero', amount: '$2,400', paymentMethod: 'PM-7751', nextRetry: 'Jun 20', attemptSummary: 'Attempt 1 of 4', retryTitle: 'Retry attempts', retryDescription: 'The first retry is scheduled for Jun 20.', invoice: 'INV-20429', actionLabel: 'Open retry attempts for Orbital Systems', attempts: []},
        {id: 'sub-4841', customer: 'Atlas Freight', customerMeta: 'SUB-4841 · Logistics API', status: 'Retrying', statusTone: 'warning', plan: 'Starter', planMeta: 'Usage based', owner: 'Amelia Whitfield', amount: '$2,000', paymentMethod: 'PM-7756', nextRetry: 'Jun 21', attemptSummary: 'Attempt 2 of 4', retryTitle: 'Retry attempts', retryDescription: 'The next retry is scheduled for Jun 21.', invoice: 'INV-20431', actionLabel: 'Open retry attempts for Atlas Freight', attempts: []},
    ],
    initialExpandedId: 'sub-4712',
    listStrategy: {kind: 'pane-scroll', expectedMaximum: 24},
}

const changePlan = {
    labels: {pageTitle: 'Change plan', pageDescription: 'Cedar Labs on Growth · 20 seats', draft: 'Draft', cancel: 'Cancel', continue: 'Continue', footerNotice: 'Nothing is charged until you confirm on step 3.', planSelection: 'Choose a new plan'},
    steps: [{id: 'new-plan', label: 'New plan', description: 'Pick a tier'}, {id: 'timing', label: 'Timing', description: 'When it applies'}, {id: 'confirm', label: 'Confirm', description: 'Review the change'}],
    choices: [
        {id: 'starter', name: 'Starter', description: 'Core billing for small teams getting started.', price: '$29', priceSuffix: '/seat', accessibleLabel: 'Starter'},
        {id: 'growth', name: 'Growth', marker: 'Current', description: 'Usage analytics and seat management.', price: '$89', priceSuffix: '/seat', accessibleLabel: 'Growth'},
        {id: 'scale', name: 'Scale', marker: 'Most picked', description: 'SSO, audit exports, and priority support.', price: '$249', priceSuffix: '/seat', accessibleLabel: 'Scale'},
        {id: 'enterprise', name: 'Enterprise', description: 'Procurement review and account governance.', price: '$399', priceSuffix: '/seat', accessibleLabel: 'Enterprise'},
    ],
    initialChoiceId: 'scale',
    summary: {title: 'Proration', description: 'Recalculated as you change the tier.', actionBadge: 'Upgrade', dueLabel: 'DUE TODAY', dueAmount: '$1,920', dueDetail: 'Scale, 20 seats, prorated 18 days.', rows: [{id: 'credit', label: 'Current plan credit', value: '−$1,068', detail: 'Growth, unused 18 days'}, {id: 'charge', label: 'New plan charge', value: '$2,988', detail: 'Scale, 18 days'}, {id: 'next', label: 'Next full invoice', value: '$4,980', detail: 'Renews Jul 1'}], assurances: ['Seat count carries over unchanged.', 'Effective immediately once confirmed.', 'Invoices already issued are unaffected.']},
}

const paymentMethods = {
    labels: {pageTitle: 'Payment methods', pageDescription: 'How Cedar Labs pays for its subscription and usage.', addMethod: 'Add method', primary: 'Primary', makePrimary: 'Make primary', billingContactsTitle: 'Billing contacts', billingContactsDescription: 'Everyone here receives invoices and payment failures.', inviteContact: 'Invite a billing contact', billingAddressTitle: 'BILLING ADDRESS', editAddress: 'Edit address', taxTitle: 'TAX AND COMPLIANCE', emptyMethods: 'No payment methods on file.', emptyContacts: 'No billing contacts yet.'},
    methods: [
        {id: 'visa', kind: 'card' as const, name: 'Visa ending 4242', detail: 'Expires 04 / 2029 · Amelia Whitfield · Charged for subscriptions', primary: true, actionLabel: 'Actions for Visa ending 4242'},
        {id: 'mastercard', kind: 'card' as const, name: 'Mastercard ending 8829', status: 'Expires soon', statusTone: 'warning' as const, detail: 'Expires 09 / 2026 · Marcus Bell · Backup for failed charges', primary: false, actionLabel: 'Actions for Mastercard ending 8829'},
        {id: 'ach', kind: 'bank' as const, name: 'ACH · Northwind Trust 1190', status: 'Verified 12 Mar', statusTone: 'positive' as const, detail: '2 business days to settle · Used for invoices over $5,000', primary: false, actionLabel: 'Actions for ACH · Northwind Trust 1190'},
    ],
    contacts: [{id: 'amelia', initials: 'AW', name: 'Amelia Whitfield', detail: 'amelia@cedarlabs.com · Owner · receives every invoice', actionLabel: 'Actions for Amelia Whitfield'}, {id: 'tomas', initials: 'TG', name: 'Tomás Guerrero', detail: 'ap@cedarlabs.com · Accounts payable · receipts only', actionLabel: 'Actions for Tomás Guerrero'}],
    addressLines: ['Cedar Labs Inc.', '14 Warren Street, Suite 620', 'New York, NY 10007'],
    taxRows: [{id: 'tax-id', label: 'Tax ID', value: 'US-88-2947135'}, {id: 'status', label: 'Status', value: 'Verified 12 Mar'}, {id: 'invoices', label: 'Invoices', value: 'Emailed on issue'}],
    taxNotice: 'Card details are held by the payment processor. We store only the last four digits.',
    methodListStrategy: {kind: 'content-grown' as const, expectedMaximum: 8}, contactListStrategy: {kind: 'content-grown' as const, expectedMaximum: 12},
}

const usage: HbarAppUiBillingUsageContent = {
    labels: {pageTitle: 'Usage and overages', pageDescription: 'Growth plan · Jun 1 to Jun 30 · 12 days remaining', periodGroup: 'Usage period', meterTitle: 'Metered entitlements', meterDescription: 'Anything beyond the included allowance bills at the listed rate.', setAlert: 'Set an alert', cycleNotice: 'This cycle closes Jun 30. Overage is invoiced with the next subscription charge.', emptyMeters: 'No metered entitlements configured.', meterProgress: (label: string) => `${label} usage`},
    periods: [{id: 'current', label: 'This cycle'}, {id: 'last', label: 'Last cycle'}, {id: 'date', label: 'Cycle to date'}], initialPeriodId: 'current',
    metrics: [{id: 'estimated', label: 'ESTIMATED TOTAL', value: '$1,828.00', detail: 'Billed Jul 1'}, {id: 'plan', label: 'PLAN SUBSCRIPTION', value: '$1,780.00', detail: '20 seats included'}, {id: 'overage', label: 'METERED OVERAGE', value: '$48.00', detail: '1 meter over', tone: 'warning'}],
    meters: [
        {id: 'seats', icon: 'people' as const, label: 'Seats', status: 'Over allowance', statusTone: 'danger' as const, currentValue: '24 of 20 seats', percentage: 120, percentageLabel: '120%', detail: '4 seats over at $12.00 each', amount: '$48.00'},
        {id: 'api', icon: 'bolt' as const, label: 'API calls', status: 'Nearing limit', statusTone: 'warning' as const, currentValue: '468,000 of 500,000 calls', percentage: 94, percentageLabel: '94%', detail: '32,000 calls left this cycle', amount: '$0.00'},
        {id: 'storage', icon: 'storage' as const, label: 'Storage', status: 'Nearing limit', statusTone: 'warning' as const, currentValue: '96 of 100 GB', percentage: 96, percentageLabel: '96%', detail: '4 GB left this cycle', amount: '$0.00'},
        {id: 'email', icon: 'mail' as const, label: 'Transactional email', currentValue: '118,400 of 250,000 sends', percentage: 47, percentageLabel: '47%', detail: '131,600 sends left this cycle', amount: '$0.00'},
    ],
    cycleAmount: '$48.00', listStrategy: {kind: 'pane-scroll' as const, expectedMaximum: 16},
}

const invoiceDetail = {
    labels: {print: 'Print invoice', pdf: 'PDF', sendReminder: 'Send reminder', billedTo: 'BILLED TO', lineItemsTitle: 'Invoice line items', descriptionColumn: 'Description', quantityColumn: 'Qty', rateColumn: 'Rate', amountColumn: 'Amount', activityTitle: 'ACTIVITY', collectionTitle: 'COLLECTION', chargeNow: 'Charge now', helpNotice: 'Questions about this invoice? Reply to the billing email and it opens a ticket with the account owner attached.', emptyLines: 'No invoice line items.'},
    invoice: 'INV-20437', status: 'Awaiting payment', statusTone: 'warning' as const, description: 'Cedar Labs · issued Jun 16 · due Jun 30 · Net 14', addressLines: ['Cedar Labs Inc.', '14 Warren Street, Suite 620', 'New York, NY 10007', 'US-88-2947135'],
    metadata: [{id: 'issued', label: 'ISSUED', value: 'Jun 16, 2026'}, {id: 'due', label: 'DUE', value: 'Jun 30, 2026'}, {id: 'terms', label: 'TERMS', value: 'Net 14'}, {id: 'po', label: 'PO', value: 'PO-4471'}],
    lines: [{id: 'growth', description: 'Growth plan', detail: '20 seats · Jun 1 to Jun 30', quantity: '20', rate: '$89.00', amount: '$1,780.00'}, {id: 'seats', description: 'Additional seats', detail: '4 seats added Jun 12, prorated 18 days', quantity: '4', rate: '$53.40', amount: '$213.60'}, {id: 'api-overage', description: 'API overage', detail: '48,000 calls beyond the included 500k', quantity: '48', rate: '$1.20', amount: '$57.60'}, {id: 'insights', description: 'Usage insights add-on', detail: 'Monthly add-on · Jun 1 to Jun 30', quantity: '1', rate: '$19.00', amount: '$19.00'}],
    totals: [{id: 'subtotal', label: 'Subtotal', value: '$2,070.20'}, {id: 'discount', label: 'Volume discount (5%)', value: '−$103.51'}, {id: 'tax', label: 'Sales tax (8.88%)', value: '$174.64'}, {id: 'amount-due', label: 'Amount due', value: '$2,141.33'}],
    activities: [{id: 'issued', title: 'Invoice issued', description: 'Emailed to ap@cedarlabs.com', date: 'Jun 16, 09:04'}, {id: 'viewed', title: 'Viewed by customer', description: 'Opened twice from New York', date: 'Jun 16, 14:22'}, {id: 'reminder', title: 'Reminder sent', description: 'Automatic reminder, 3 days before due', date: 'Jun 27, 08:00'}, {id: 'due', title: 'Payment due', description: 'ACH transfer from Northwind Trust 1190', date: 'Jun 30', tone: 'warning' as const}],
    collection: [{id: 'method', label: 'Method', value: 'ACH transfer'}, {id: 'account', label: 'Account', value: 'Northwind 1190'}, {id: 'attempt', label: 'Attempt', value: 'Jun 30'}], listStrategy: {kind: 'content-grown' as const, expectedMaximum: 12},
}

export const HBAR_APP_UI_BILLING_FIXTURES: HbarAppUiBillingContent = {statement, plans, invoiceComposer, recovery, changePlan, paymentMethods, usage, invoiceDetail}

export function createHbarAppUiBillingOverflowFixtures(): HbarAppUiBillingContent {
    const base = HBAR_APP_UI_BILLING_FIXTURES
    const overflowInvoices = [...(base.statement?.invoices ?? []), ...Array.from({length: 32}, (_, index) => ({id: `overflow-invoice-${index}`, customer: `Overflow customer ${index + 1}`, customerMeta: `ACC-${4000 + index}`, invoice: `INV-${30000 + index}`, invoiceMeta: 'Monthly usage', plan: 'Growth', amount: '$120', paymentMethod: 'ACH transfer', dueDate: 'Jul 1', dueDetail: 'Due in 20d', status: 'Open', statusTone: 'neutral' as const}))]
    const overflowSubscriptions = [...(base.recovery?.subscriptions ?? []), ...Array.from({length: 24}, (_, index) => ({id: `overflow-subscription-${index}`, customer: `Overflow account ${index + 1}`, customerMeta: `SUB-${6000 + index} · Usage service`, status: 'Retrying', statusTone: 'warning' as const, plan: 'Growth', planMeta: 'Usage based', owner: `Owner ${index + 1}`, amount: '$240', paymentMethod: `PM-${8000 + index}`, nextRetry: 'Tomorrow', attemptSummary: 'Attempt 1 of 4', retryTitle: 'Retry attempts', retryDescription: 'A retry is scheduled.', invoice: `INV-${31000 + index}`, actionLabel: `Open retry attempts for overflow account ${index + 1}`, attempts: []}))]
    const overflowMethods = [...(base.paymentMethods?.methods ?? []), ...Array.from({length: 14}, (_, index) => ({id: `overflow-method-${index}`, kind: 'card' as const, name: `Backup card ${index + 1}`, status: 'Available', statusTone: 'neutral' as const, detail: 'Stored for fallback collection.', primary: false, actionLabel: `Actions for backup card ${index + 1}`}))]
    const overflowContacts = [...(base.paymentMethods?.contacts ?? []), ...Array.from({length: 18}, (_, index) => ({id: `overflow-contact-${index}`, initials: 'OV', name: `Overflow contact ${index + 1}`, detail: `contact-${index + 1}@example.test · Viewer`, actionLabel: `Actions for overflow contact ${index + 1}`}))]
    const overflowMeters = [...(base.usage?.meters ?? []), ...Array.from({length: 20}, (_, index) => ({id: `overflow-meter-${index}`, icon: 'bolt' as const, label: `Meter ${index + 1}`, currentValue: '0 of 1,000', percentage: 0, percentageLabel: '0%', detail: '1,000 units left this cycle', amount: '$0.00'}))]
    const overflowLines = [...(base.invoiceDetail?.lines ?? []), ...Array.from({length: 24}, (_, index) => ({id: `overflow-line-${index}`, description: `Additional line ${index + 1}`, detail: 'Service usage', quantity: '1', rate: '$1.00', amount: '$1.00'}))]
    return {
        ...base,
        statement: base.statement ? {...base.statement, invoices: overflowInvoices, listStrategy: {kind: 'pane-scroll', expectedMaximum: 32}} : undefined,
        recovery: base.recovery ? {...base.recovery, subscriptions: overflowSubscriptions, listStrategy: {kind: 'pane-scroll', expectedMaximum: 24}} : undefined,
        paymentMethods: base.paymentMethods ? {...base.paymentMethods, methods: overflowMethods, contacts: overflowContacts, methodListStrategy: {kind: 'pane-scroll', expectedMaximum: 24}, contactListStrategy: {kind: 'pane-scroll', expectedMaximum: 24}} : undefined,
        usage: base.usage ? {...base.usage, meters: overflowMeters, listStrategy: {kind: 'pane-scroll', expectedMaximum: 28}} : undefined,
        invoiceDetail: base.invoiceDetail ? {...base.invoiceDetail, lines: overflowLines, listStrategy: {kind: 'pane-scroll', expectedMaximum: 32}} : undefined,
    }
}

export function createHbarAppUiBillingLocalizedFixtures(): HbarAppUiBillingContent {
    const base = HBAR_APP_UI_BILLING_FIXTURES
    return {
        ...base,
        statement: base.statement ? {...base.statement, labels: {...base.statement.labels, pageTitle: 'Abrechnung', pageDescription: 'Juni-Abrechnung · 7 offene Rechnungen', ledgerTitle: 'Rechnungsübersicht', newInvoice: 'Neue Rechnung', searchPlaceholder: 'Kundinnen und Kunden suchen'}} : undefined,
        plans: base.plans ? {...base.plans, labels: {...base.plans.labels, pageTitle: 'Tarife', pageDescription: 'Sehr lange lokalisierte Beschreibung für Tarife und veröffentlichte Berechtigungen.', save: 'Änderungen speichern'}} : undefined,
        invoiceComposer: base.invoiceComposer ? {...base.invoiceComposer, labels: {...base.invoiceComposer.labels, pageTitle: 'Neue Rechnung', pageDescription: 'Automatisch als Entwurf gespeichert.', nextStep: 'Nächster Schritt'}} : undefined,
        recovery: base.recovery ? {...base.recovery, labels: {...base.recovery.labels, pageTitle: 'Zahlungswiederherstellung', listTitle: 'Überfällige Abonnements', retryNow: 'Jetzt erneut versuchen'}} : undefined,
        changePlan: base.changePlan ? {...base.changePlan, labels: {...base.changePlan.labels, pageTitle: 'Tarif ändern', continue: 'Fortfahren'}} : undefined,
        paymentMethods: base.paymentMethods ? {...base.paymentMethods, labels: {...base.paymentMethods.labels, pageTitle: 'Zahlungsmethoden', addMethod: 'Zahlungsmethode hinzufügen'}} : undefined,
        usage: base.usage ? {...base.usage, labels: {...base.usage.labels, pageTitle: 'Nutzung und Mehrverbrauch', meterDescription: 'Sehr lange lokalisierte Beschreibung der enthaltenen Kontingente und Abrechnungsgrenzen.'}} : undefined,
        invoiceDetail: base.invoiceDetail ? {...base.invoiceDetail, labels: {...base.invoiceDetail.labels, pdf: 'PDF herunterladen', sendReminder: 'Erinnerung senden'}} : undefined,
    }
}

export function createHbarAppUiBillingEmptyFixtures(): HbarAppUiBillingContent {
    const base = HBAR_APP_UI_BILLING_FIXTURES
    return {
        ...base,
        statement: base.statement ? {...base.statement, invoices: []} : undefined,
        plans: base.plans ? {...base.plans, plans: []} : undefined,
        recovery: base.recovery ? {...base.recovery, subscriptions: []} : undefined,
        paymentMethods: base.paymentMethods ? {...base.paymentMethods, methods: [], contacts: []} : undefined,
        usage: base.usage ? {...base.usage, meters: []} : undefined,
        invoiceDetail: base.invoiceDetail ? {...base.invoiceDetail, lines: []} : undefined,
    }
}

export function createHbarAppUiBillingSingleFixtures(): HbarAppUiBillingContent {
    const base = HBAR_APP_UI_BILLING_FIXTURES
    return {
        ...base,
        statement: base.statement ? {...base.statement, invoices: base.statement.invoices.slice(0, 1), listStrategy: {kind: 'pane-scroll', expectedMaximum: 1}} : undefined,
        plans: base.plans ? {...base.plans, plans: base.plans.plans.slice(0, 1), listStrategy: {kind: 'content-grown', expectedMaximum: 1}} : undefined,
        recovery: base.recovery ? {...base.recovery, subscriptions: base.recovery.subscriptions.slice(0, 1), listStrategy: {kind: 'pane-scroll', expectedMaximum: 1}} : undefined,
        paymentMethods: base.paymentMethods ? {...base.paymentMethods, methods: base.paymentMethods.methods.slice(0, 1), contacts: base.paymentMethods.contacts.slice(0, 1), methodListStrategy: {kind: 'content-grown', expectedMaximum: 1}, contactListStrategy: {kind: 'content-grown', expectedMaximum: 1}} : undefined,
        usage: base.usage ? {...base.usage, meters: base.usage.meters.slice(0, 1), listStrategy: {kind: 'pane-scroll', expectedMaximum: 1}} : undefined,
        invoiceDetail: base.invoiceDetail ? {...base.invoiceDetail, lines: base.invoiceDetail.lines.slice(0, 1), listStrategy: {kind: 'content-grown', expectedMaximum: 1}} : undefined,
    }
}

export function createHbarAppUiBillingBoundaryFixtures(): HbarAppUiBillingContent {
    const base = HBAR_APP_UI_BILLING_FIXTURES
    return {
        ...base,
        statement: base.statement ? {...base.statement, listStrategy: {kind: 'pane-scroll', expectedMaximum: base.statement.invoices.length}} : undefined,
        plans: base.plans ? {...base.plans, listStrategy: {kind: 'content-grown', expectedMaximum: base.plans.plans.length}} : undefined,
        recovery: base.recovery ? {...base.recovery, listStrategy: {kind: 'pane-scroll', expectedMaximum: base.recovery.subscriptions.length}} : undefined,
        paymentMethods: base.paymentMethods ? {...base.paymentMethods, methodListStrategy: {kind: 'content-grown', expectedMaximum: base.paymentMethods.methods.length}, contactListStrategy: {kind: 'content-grown', expectedMaximum: base.paymentMethods.contacts.length}} : undefined,
        usage: base.usage ? {...base.usage, listStrategy: {kind: 'pane-scroll', expectedMaximum: base.usage.meters.length}} : undefined,
        invoiceDetail: base.invoiceDetail ? {...base.invoiceDetail, listStrategy: {kind: 'content-grown', expectedMaximum: base.invoiceDetail.lines.length}} : undefined,
    }
}
