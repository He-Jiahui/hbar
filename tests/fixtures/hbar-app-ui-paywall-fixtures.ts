import type {HbarAppUiPaywallContent, HbarAppUiPaywallFeature, HbarAppUiPaywallPlan, HbarAppUiPaywallTrialRow, HbarAppUiPaywallUsageMeter} from '../../packages/hbar-app-ui/src/index'

const featureRows: readonly HbarAppUiPaywallFeature[] = [
    {id: 'scheduled-exports', title: 'Scheduled exports', description: 'Send any saved view to S3 or a warehouse on a cron you control.'},
    {id: 'unlimited-history', title: 'Unlimited history', description: 'Query beyond the 30 days Starter keeps, with no sampling.'},
    {id: 'shared-workspaces', title: 'Shared workspaces', description: 'Invite the whole team and manage access by role.'},
]

const plans: readonly HbarAppUiPaywallPlan[] = [
    {id: 'starter', name: 'Starter', monthlyPrice: '$0', yearlyPrice: '$0', priceSuffix: 'forever', description: 'For a single project and a short history window.', features: ['1 workspace', '30 days of history', 'Community support'], current: true},
    {id: 'pro', name: 'Pro', monthlyPrice: '$24', yearlyPrice: '$19', priceSuffix: 'per seat / mo', description: 'For teams that need exports, roles and full history.', features: ['Unlimited workspaces', 'Full history, no sampling', 'Scheduled exports', 'Role-based access'], featured: true},
    {id: 'scale', name: 'Scale', monthlyPrice: '$54', yearlyPrice: '$54', priceSuffix: 'per seat / mo', description: 'For organisations with review and residency requirements.', features: ['Everything in Pro', 'Audit log and SSO', 'Region pinning', 'Named support contact']},
]

const usageMeters: readonly HbarAppUiPaywallUsageMeter[] = [
    {id: 'requests', label: 'API requests', value: '50k / 50k', progress: 100},
    {id: 'rows', label: 'Rows processed', value: '1.84M / 2.00M', progress: 92},
    {id: 'sources', label: 'Connected sources', value: '3 / 3', progress: 100},
]

const trialRows: readonly HbarAppUiPaywallTrialRow[] = [
    {id: 'workspaces', label: 'Workspaces', value: '4 kept, read-only'},
    {id: 'views', label: 'Saved views', value: '26 kept'},
    {id: 'exports', label: 'Scheduled exports', value: 'Paused'},
    {id: 'members', label: 'Team members', value: '7 signed out'},
]

export const HBAR_APP_UI_PAYWALL_FIXTURES: HbarAppUiPaywallContent = {
    article: {
        labels: {eyebrow: 'ISSUE 84 · INFRASTRUCTURE', title: 'What a database migration actually costs', byline: 'Marcus Bell · 14 min read', memberTitle: 'Keep reading with a membership', memberDescription: 'The rest of this teardown is for members. Cancel whenever, and keep everything you have downloaded.', memberAction: 'Become a member: $9/mo', alreadyAction: 'I already have an account', lockLabel: 'Members-only article'},
        paragraphs: [
            'Northwind moved 11 terabytes between two managed Postgres clusters last spring. The plan called for four hours of degraded writes on a Saturday night. What the team got instead was nine days of partial availability, an unplanned index rebuild, and a bill roughly three times the estimate.',
            'None of that came from the migration itself. The copy finished more or less on schedule. The cost showed up in everything the copy touched: connection pools sized for the old topology, a backfill job competing with production reads, and a rollback path that quietly stopped working once the first schema change landed.',
            'This teardown walks through the three decisions that turned a maintenance window into a quarter of operational cleanup.',
        ],
        benefits: ['Every issue in the archive, going back to 2019', 'The weekly teardown, two days before it goes public', 'Source files and spreadsheets for each analysis'],
        listStrategy: {kind: 'content-grown', expectedMaximum: 12},
    },
    featureGate: {
        labels: {title: 'Scheduled exports are a Pro feature', description: 'Your workspace is on Starter. Upgrading applies immediately and is prorated.', dismiss: 'Dismiss', seeIncluded: "See what's included", price: '$24 per seat, per month', defer: 'Not now', upgrade: 'Upgrade workspace'},
        features: featureRows,
        listStrategy: {kind: 'content-grown', expectedMaximum: 8},
    },
    plans: {
        labels: {title: 'Choose a plan to continue', description: 'Your trial ended on 3 March. Pick a plan to restore access to your workspaces.', yearlyNote: 'Yearly billing saves 20 percent and is charged once per year.', billingPeriod: 'Billing period', monthly: 'Monthly', yearly: 'Yearly', recommended: 'Recommended', current: 'Current', choose: 'Choose', compare: 'Compare every feature', priceNote: 'Prices in USD. Seats can be added or removed at any time.'},
        plans,
        initialPeriod: 'yearly',
        listStrategy: {kind: 'content-grown', expectedMaximum: 6},
    },
    usage: {
        labels: {title: 'You have hit the Starter limit', description: 'Ingestion is paused until 1 April, or until you raise the limit. Nothing has been deleted, and queries on existing data still work.', proTitle: 'Pro raises every limit tenfold', proDescription: '500k requests, 20M rows, unlimited sources. $24 per seat / mo.', topUp: 'Buy a one-off top-up', upgrade: 'Upgrade to Pro'},
        meters: usageMeters,
        listStrategy: {kind: 'content-grown', expectedMaximum: 6},
    },
    trial: {
        labels: {eyebrow: 'TRIAL ENDED', title: 'Your 14 days with Pro are up', description: 'Northwind Analytics is in read-only mode. Reactivate and everything picks up exactly where it stopped, including the exports that were mid-schedule.', paymentTitle: 'Card ending 4471', paymentDescription: 'Expires 08/28 · billed to Northwind Ltd', change: 'Change', reactivate: 'Reactivate Pro: $168 / yr', renewalNote: 'Renews yearly. Cancel any time before the renewal date.'},
        rows: trialRows,
        listStrategy: {kind: 'content-grown', expectedMaximum: 8},
    },
    reads: {
        labels: {eyebrow: '3 OF 3 FREE READS USED', title: 'That was your last free article this month', description: 'Your counter resets on 1 April. Leave an address and we will send the rest of this piece, plus one long read each Thursday.', emailLabel: 'Email address', emailPlaceholder: 'you@company.com', keepReading: 'Keep reading', alreadySubscribed: 'Already subscribed?', signIn: 'Sign in'},
        assurances: ['No card required', 'One email each Thursday', 'Unsubscribe in a click'],
        readProgress: 100,
        listStrategy: {kind: 'content-grown', expectedMaximum: 4},
    },
    seat: {
        labels: {title: 'Audit log needs a Scale plan', description: 'Northwind is on Pro · you do not manage billing', cardTitle: 'Ask an admin to upgrade', cardDescription: 'We will send your note to the people below. They can approve the change without you doing anything else.', reasonLabel: 'Why do you need it?', reasonPlaceholder: 'Tell the billing team what you need access for.', compare: 'Compare plans', send: 'Send request'},
        admins: [{id: 'priya', initials: 'PN', name: 'Priya Nandakumar', role: 'Workspace owner'}, {id: 'marcus', initials: 'MB', name: 'Marcus Bell', role: 'Billing admin'}],
        listStrategy: {kind: 'content-grown', expectedMaximum: 5},
    },
}

export function createHbarAppUiPaywallOverflowFixtures(): HbarAppUiPaywallContent {
    const base = HBAR_APP_UI_PAYWALL_FIXTURES
    const overflowFeatures = Array.from({length: 14}, (_, index) => ({id: `feature-${index}`, title: `Additional feature ${index + 1}`, description: 'Included with the upgraded workspace.'}))
    const overflowRows = Array.from({length: 18}, (_, index) => ({id: `meter-${index}`, label: `Usage meter ${index + 1}`, value: `${index} / 100`, progress: index * 5}))
    return {
        ...base,
        article: base.article && {...base.article, benefits: [...base.article.benefits, ...Array.from({length: 18}, (_, index) => `Additional membership benefit ${index + 1}`)], listStrategy: {kind: 'pane-scroll', expectedMaximum: 12}},
        featureGate: base.featureGate && {...base.featureGate, features: [...base.featureGate.features, ...overflowFeatures], listStrategy: {kind: 'pane-scroll', expectedMaximum: 8}},
        plans: base.plans && {...base.plans, plans: [...base.plans.plans, ...Array.from({length: 5}, (_, index) => ({id: `plan-${index}`, name: `Plan ${index + 1}`, monthlyPrice: '$28', yearlyPrice: '$22', priceSuffix: 'per seat / mo', description: 'A host-provided plan option.', features: ['Workspace access']}))], listStrategy: {kind: 'pane-scroll', expectedMaximum: 6}},
        usage: base.usage && {...base.usage, meters: [...base.usage.meters, ...overflowRows], listStrategy: {kind: 'pane-scroll', expectedMaximum: 6}},
        trial: base.trial && {...base.trial, rows: [...base.trial.rows, ...Array.from({length: 10}, (_, index) => ({id: `trial-${index}`, label: `Additional entitlement ${index + 1}`, value: 'Retained'}))], listStrategy: {kind: 'pane-scroll', expectedMaximum: 8}},
        reads: base.reads && {...base.reads, assurances: [...base.reads.assurances, ...Array.from({length: 8}, (_, index) => `Additional assurance ${index + 1}`)], listStrategy: {kind: 'pane-scroll', expectedMaximum: 4}},
        seat: base.seat && {...base.seat, admins: [...base.seat.admins, ...Array.from({length: 8}, (_, index) => ({id: `admin-${index}`, initials: 'AD', name: `Additional admin ${index + 1}`, role: 'Billing delegate'}))], listStrategy: {kind: 'pane-scroll', expectedMaximum: 5}},
    }
}

export function createHbarAppUiPaywallLocalizedFixtures(): HbarAppUiPaywallContent {
    const base = HBAR_APP_UI_PAYWALL_FIXTURES
    return {
        ...base,
        article: base.article && {...base.article, labels: {...base.article.labels, eyebrow: 'AUSGABE 84 · INFRASTRUKTUR', title: 'Was eine Datenbankmigration wirklich kostet', memberTitle: 'Mit Mitgliedschaft weiterlesen', memberAction: 'Mitglied werden: 9 $/Monat', alreadyAction: 'Ich habe bereits ein Konto'}},
        featureGate: base.featureGate && {...base.featureGate, labels: {...base.featureGate.labels, title: 'Geplante Exporte sind eine Pro-Funktion', description: 'Dein Arbeitsbereich nutzt Starter. Das Upgrade gilt sofort und wird anteilig berechnet.', dismiss: 'Schließen', defer: 'Später', upgrade: 'Arbeitsbereich upgraden'}},
        plans: base.plans && {...base.plans, labels: {...base.plans.labels, title: 'Wähle einen Plan', description: 'Deine Testphase ist beendet. Wähle einen Plan, um den Zugriff wiederherzustellen.', yearlyNote: 'Jährliche Abrechnung spart 20 Prozent.', monthly: 'Monatlich', yearly: 'Jährlich', current: 'Aktuell', choose: 'Wählen', compare: 'Alle Funktionen vergleichen'}},
        usage: base.usage && {...base.usage, labels: {...base.usage.labels, title: 'Starter-Limit erreicht', description: 'Die Aufnahme ist pausiert, bis du das Limit erhöhst.', topUp: 'Einmalig aufladen', upgrade: 'Auf Pro upgraden'}},
        trial: base.trial && {...base.trial, labels: {...base.trial.labels, eyebrow: 'TESTPHASE BEENDET', title: 'Deine 14 Pro-Tage sind vorbei', description: 'Northwind Analytics ist schreibgeschützt.', reactivate: 'Pro reaktivieren'}},
        reads: base.reads && {...base.reads, labels: {...base.reads.labels, eyebrow: '3 VON 3 KOSTENLOSEN ARTIKELN GEBRAUCHT', title: 'Das war dein letzter kostenloser Artikel', description: 'Der Zähler wird am 1. April zurückgesetzt.', emailLabel: 'E-Mail-Adresse', emailPlaceholder: 'du@beispiel.de', keepReading: 'Weiterlesen', signIn: 'Anmelden'}},
        seat: base.seat && {...base.seat, labels: {...base.seat.labels, title: 'Audit-Protokoll benötigt Scale', description: 'Northwind nutzt Pro · du verwaltest die Abrechnung nicht', cardTitle: 'Admin um Upgrade bitten', reasonLabel: 'Warum benötigst du Zugriff?', send: 'Anfrage senden'}},
    }
}
