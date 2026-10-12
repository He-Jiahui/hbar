import type { LumenSettingsForm1Content, LumenSettingsForm1Field, LumenSettingsForm1Section } from '@lumen/app-ui/catalog'
import {
  createHbarAppUiSettingsFormLocalizedFixtures,
  HBAR_APP_UI_SETTINGS_FORM_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-settings-form-fixtures'
import type {
  SettingsForm1PreviewFeedback,
  SettingsForm1PreviewSaveState,
  SettingsForm1PreviewStoreSeed,
} from './settingsForm1PreviewStore'

export type SettingsForm1PreviewLocale = 'en' | 'de'
export type SettingsForm1PreviewSaveBehavior = 'success' | 'fail-once'

export interface SettingsForm1PreviewFixture {
  readonly locale: SettingsForm1PreviewLocale
  readonly content: LumenSettingsForm1Content
  readonly storeSeed: SettingsForm1PreviewStoreSeed
  readonly saveBehavior: SettingsForm1PreviewSaveBehavior
}

function localized(locale: SettingsForm1PreviewLocale, english: string, german: string): string {
  return locale === 'de' ? german : english
}

function text(
  id: string,
  label: string,
  description: string,
  value: string,
  inputMode: 'text' | 'url' = 'text',
): LumenSettingsForm1Field {
  return { id, kind: 'text', label, description, value, inputMode }
}

function prefixedText(
  id: string,
  label: string,
  description: string,
  value: string,
  prefix: string,
): LumenSettingsForm1Field {
  return { id, kind: 'text-prefix', label, description, value, prefix, inputMode: 'url' }
}

function textarea(
  id: string,
  label: string,
  description: string,
  value: string,
): LumenSettingsForm1Field {
  return { id, kind: 'textarea', label, description, value }
}

function select(
  id: string,
  label: string,
  description: string,
  value: string,
  options: readonly { readonly id: string; readonly label: string }[],
): LumenSettingsForm1Field {
  return { id, kind: 'select', label, description, value, options }
}

function booleanField(
  kind: 'switch' | 'checkbox',
  id: string,
  label: string,
  description: string | undefined,
  value: boolean,
): LumenSettingsForm1Field {
  const copy = { id, label, ...(description === undefined ? {} : { description }), value }
  return kind === 'switch'
    ? { ...copy, kind: 'switch' }
    : { ...copy, kind: 'checkbox' }
}

function workspaceFieldCopy(locale: SettingsForm1PreviewLocale, field: {
  readonly id: string
  readonly label: string
  readonly description: string
}) {
  if (locale !== 'de') return { label: field.label, description: field.description }
  const copy = new Map<string, Readonly<{ label: string; description: string }>>([
    ['name', { label: 'Name des Arbeitsbereichs', description: 'Wird in Seitenleisten, Einladungen und Berichten angezeigt.' }],
    ['url', { label: 'URL des Arbeitsbereichs', description: 'Nur Kleinbuchstaben, Zahlen und Bindestriche.' }],
    ['region', { label: 'Primäre Region', description: 'Legt den Standardspeicherort für neue Projekte fest.' }],
    ['description', { label: 'Beschreibung', description: 'Ein kurzer Hinweis für Personen, die dem Arbeitsbereich beitreten.' }],
    ['language', { label: 'Sprache', description: 'Standardsprache für gemeinsam genutzte Arbeitsbereichsseiten.' }],
    ['timezone', { label: 'Zeitzone', description: 'Wird für Zeitstempel in Berichten und Exporten verwendet.' }],
    ['date-format', { label: 'Datumsformat', description: 'Legt fest, wie Datumsangaben angezeigt werden.' }],
  ])
  return copy.get(field.id) ?? { label: field.label, description: field.description }
}

function workspaceOptionLabel(locale: SettingsForm1PreviewLocale, option: { readonly id: string; readonly label: string }) {
  if (locale !== 'de') return option.label
  const labels = new Map<string, string>([
    ['us-east', 'USA Ost (Nord-Virginia)'],
    ['us-west', 'USA West (Oregon)'],
    ['eu-central', 'Europa (Frankfurt)'],
    ['apac', 'Asien-Pazifik (Singapur)'],
    ['en', 'Englisch'],
    ['de', 'Deutsch'],
    ['fr', 'Französisch'],
    ['ja', 'Japanisch'],
    ['new-york', 'New York, GMT−05:00'],
    ['london', 'London, GMT+00:00'],
    ['berlin', 'Berlin, GMT+01:00'],
    ['tokyo', 'Tokio, GMT+09:00'],
    ['august', '5. Aug. 2026'],
    ['day-month', '5. Aug. 2026'],
    ['iso', '2026-08-05'],
  ])
  return labels.get(option.id) ?? option.label
}

function workspaceOptionId(fieldId: string, optionId: string): string {
  if (fieldId === 'timezone') return optionId.replaceAll('-', '_')
  if (fieldId === 'date-format') {
    if (optionId === 'august') return 'mdy'
    if (optionId === 'day-month') return 'dmy'
  }
  return optionId
}

function mapWorkspaceField(
  locale: SettingsForm1PreviewLocale,
  field: NonNullable<typeof HBAR_APP_UI_SETTINGS_FORM_FIXTURES.workspace>['fields'][number],
): LumenSettingsForm1Field {
  const copy = workspaceFieldCopy(locale, field)
  const changed = field.changed === undefined ? {} : { changed: field.changed }
  switch (field.kind) {
    case 'url':
      return {
        id: field.id,
        kind: 'text-prefix',
        label: copy.label,
        description: copy.description,
        value: field.value,
        prefix: field.prefix ?? '',
        inputMode: 'url',
        ...changed,
      }
    case 'text':
      return { id: field.id, kind: 'text', label: copy.label, description: copy.description, value: field.value, ...changed }
    case 'textarea':
      return { id: field.id, kind: 'textarea', label: copy.label, description: copy.description, value: field.value, ...changed }
    case 'select':
      return {
        id: field.id,
        kind: 'select',
        label: copy.label,
        description: copy.description,
        value: workspaceOptionId(field.id, field.value),
        options: (field.options ?? []).map((option) => ({
          id: workspaceOptionId(field.id, option.id),
          label: workspaceOptionLabel(locale, option),
        })),
        ...changed,
      }
  }
}

function extraSections(locale: SettingsForm1PreviewLocale): readonly LumenSettingsForm1Section[] {
  const billing = localized(locale, 'Billing', 'Abrechnung')
  const notifications = localized(locale, 'Notifications', 'Benachrichtigungen')
  const security = localized(locale, 'Security', 'Sicherheit')
  const advanced = localized(locale, 'Advanced', 'Erweitert')

  return [
    {
      id: 'billing',
      label: billing,
      title: billing,
      description: localized(locale, 'Who is charged, how often, and what appears on the invoice.', 'Wer belastet wird, wie oft abgerechnet wird und was auf der Rechnung steht.'),
      groups: [{
        id: 'billing-fields',
        fields: [
          select('billing-plan', localized(locale, 'Plan', 'Tarif'), localized(locale, 'Changes apply on the next invoice.', 'Änderungen gelten ab der nächsten Rechnung.'), 'business', [
            { id: 'team', label: 'Team' }, { id: 'business', label: 'Business' }, { id: 'enterprise', label: 'Enterprise' },
          ]),
          select('billing-cycle', localized(locale, 'Billing cycle', 'Abrechnungszeitraum'), localized(locale, 'Annual plans are invoiced once, in advance.', 'Jahrestarife werden einmal im Voraus berechnet.'), 'annual', [
            { id: 'monthly', label: localized(locale, 'Monthly', 'Monatlich') }, { id: 'annual', label: localized(locale, 'Annual', 'Jährlich') },
          ]),
          text('billing-email', localized(locale, 'Billing email', 'Abrechnungs-E-Mail'), localized(locale, 'Invoices and receipts are sent here.', 'Rechnungen und Belege werden hierhin gesendet.'), 'accounts-payable@northwind.co'),
          textarea('billing-address', localized(locale, 'Billing address', 'Rechnungsadresse'), localized(locale, 'Printed on every invoice.', 'Wird auf jeder Rechnung gedruckt.'), '18 Wharf Road\nLondon N1 7GS\nUnited Kingdom'),
          text('tax-id', localized(locale, 'Tax ID', 'Steuernummer'), localized(locale, 'Shown on invoices in regions that require it.', 'Wird in Regionen mit entsprechender Pflicht auf Rechnungen angezeigt.'), 'GB 428 9971 07'),
          text('purchase-order', localized(locale, 'Purchase order', 'Bestellnummer'), localized(locale, 'Added to the invoice reference. Leave empty if unused.', 'Wird der Rechnungsreferenz hinzugefügt. Leer lassen, wenn nicht benötigt.'), ''),
          booleanField('switch', 'email-receipts', localized(locale, 'Email receipts', 'E-Mail-Belege'), localized(locale, 'Send a receipt to the billing address after each charge.', 'Nach jeder Abbuchung einen Beleg an die Rechnungsadresse senden.'), true),
        ],
      }],
    },
    {
      id: 'notifications',
      label: notifications,
      title: notifications,
      description: localized(locale, 'Where workspace activity reaches people, and how often.', 'Wohin Arbeitsbereichsaktivitäten gemeldet werden und wie oft.'),
      groups: [
        {
          id: 'notification-email',
          label: localized(locale, 'Email', 'E-Mail'),
          description: localized(locale, 'Choose which messages reach the inbox.', 'Wähle aus, welche Nachrichten im Posteingang ankommen.'),
          fields: [
            booleanField('checkbox', 'product-updates', localized(locale, 'Product updates', 'Produktneuigkeiten'), undefined, false),
            booleanField('checkbox', 'security-alerts', localized(locale, 'Security alerts', 'Sicherheitswarnungen'), undefined, true),
            booleanField('checkbox', 'weekly-digest', localized(locale, 'Weekly digest', 'Wöchentliche Zusammenfassung'), undefined, true),
          ],
        },
        {
          id: 'notification-delivery',
          fields: [
            select('digest-day', localized(locale, 'Digest day', 'Tag der Zusammenfassung'), localized(locale, 'When the weekly digest is sent.', 'An welchem Tag die wöchentliche Zusammenfassung gesendet wird.'), 'monday', [
              { id: 'monday', label: localized(locale, 'Monday', 'Montag') }, { id: 'friday', label: localized(locale, 'Friday', 'Freitag') }, { id: 'sunday', label: localized(locale, 'Sunday', 'Sonntag') },
            ]),
            select('quiet-hours', localized(locale, 'Quiet hours', 'Ruhezeiten'), localized(locale, 'Hold non-urgent alerts until the morning.', 'Nicht dringende Hinweise bis zum Morgen zurückhalten.'), '18-09', [
              { id: 'off', label: localized(locale, 'Off', 'Aus') }, { id: '18-09', label: '18:00–09:00' }, { id: '22-07', label: '22:00–07:00' },
            ]),
            text('reply-to', localized(locale, 'Reply-to address', 'Antwortadresse'), localized(locale, 'Where replies to workspace email are delivered.', 'Wohin Antworten auf E-Mails des Arbeitsbereichs gesendet werden.'), 'no-reply@northwind.co'),
            booleanField('switch', 'desktop-alerts', localized(locale, 'Desktop alerts', 'Desktop-Benachrichtigungen'), localized(locale, 'Show alerts while the app is open.', 'Hinweise anzeigen, während die App geöffnet ist.'), true),
            booleanField('switch', 'mobile-push', localized(locale, 'Mobile push', 'Mobile Push-Mitteilungen'), localized(locale, 'Send alerts to signed-in mobile devices.', 'Hinweise an angemeldete Mobilgeräte senden.'), false),
            booleanField('switch', 'mentions', localized(locale, 'Mentions', 'Erwähnungen'), localized(locale, 'Notify people when someone mentions their name.', 'Personen benachrichtigen, wenn jemand sie erwähnt.'), true),
          ],
        },
      ],
    },
    {
      id: 'security',
      label: security,
      title: security,
      description: localized(locale, 'How members prove who they are and how long they stay signed in.', 'Wie Mitglieder ihre Identität bestätigen und wie lange sie angemeldet bleiben.'),
      groups: [{
        id: 'security-fields',
        fields: [
          booleanField('switch', 'two-factor', localized(locale, 'Two-factor authentication', 'Zwei-Faktor-Authentifizierung'), localized(locale, 'Require a second factor for every member.', 'Für jedes Mitglied einen zweiten Faktor verlangen.'), true),
          select('sso', localized(locale, 'Single sign-on', 'Einmalanmeldung'), localized(locale, 'Members sign in through your identity provider.', 'Mitglieder melden sich über deinen Identitätsanbieter an.'), 'okta', [
            { id: 'off', label: localized(locale, 'Off', 'Aus') }, { id: 'okta', label: 'Okta' }, { id: 'google', label: 'Google Workspace' },
          ]),
          select('session-timeout', localized(locale, 'Session timeout', 'Sitzungszeitlimit'), localized(locale, 'Sign members out after this much inactivity.', 'Mitglieder nach dieser Inaktivitätszeit abmelden.'), '24h', [
            { id: '8h', label: localized(locale, '8 hours', '8 Stunden') }, { id: '24h', label: localized(locale, '24 hours', '24 Stunden') }, { id: '7d', label: localized(locale, '7 days', '7 Tage') }, { id: '30d', label: localized(locale, '30 days', '30 Tage') },
          ]),
          text('allowed-domains', localized(locale, 'Allowed email domains', 'Zugelassene E-Mail-Domains'), localized(locale, 'Only these domains can join without an invitation.', 'Nur diese Domains können ohne Einladung beitreten.'), 'northwind.co, contractors.northwind.co'),
          textarea('ip-allowlist', localized(locale, 'IP allowlist', 'IP-Zulassungsliste'), localized(locale, 'One CIDR range per line. Empty allows every address.', 'Pro Zeile ein CIDR-Bereich. Leer lässt alle Adressen zu.'), ''),
          select('audit-retention', localized(locale, 'Audit log retention', 'Aufbewahrung des Audit-Protokolls'), localized(locale, 'How long member activity is kept.', 'Wie lange Mitgliederaktivitäten gespeichert werden.'), '1y', [
            { id: '30d', label: localized(locale, '30 days', '30 Tage') }, { id: '1y', label: localized(locale, '1 year', '1 Jahr') }, { id: '3y', label: localized(locale, '3 years', '3 Jahre') },
          ]),
          booleanField('switch', 'device-approval', localized(locale, 'Device approval', 'Gerätefreigabe'), localized(locale, 'Ask an admin to approve every new device.', 'Für jedes neue Gerät eine Admin-Freigabe verlangen.'), false),
        ],
      }],
    },
    {
      id: 'advanced',
      label: advanced,
      title: advanced,
      description: localized(locale, 'Defaults for projects, the API, and scheduled exports.', 'Vorgaben für Projekte, API und geplante Exporte.'),
      groups: [{
        id: 'advanced-fields',
        fields: [
          select('project-visibility', localized(locale, 'New project visibility', 'Sichtbarkeit neuer Projekte'), localized(locale, 'Where new projects start out.', 'Mit welcher Sichtbarkeit neue Projekte beginnen.'), 'workspace', [
            { id: 'workspace', label: localized(locale, 'Workspace', 'Arbeitsbereich') }, { id: 'private', label: localized(locale, 'Private', 'Privat') },
          ]),
          select('api-rate-limit', localized(locale, 'API rate limit', 'API-Ratenlimit'), localized(locale, 'Requests per minute across every key.', 'Anfragen pro Minute über alle Schlüssel hinweg.'), '5000', [
            { id: '1000', label: '1,000' }, { id: '5000', label: '5,000' }, { id: '10000', label: '10,000' },
          ]),
          prefixedText('webhook-endpoint', localized(locale, 'Webhook endpoint', 'Webhook-Endpunkt'), localized(locale, 'Workspace events are posted here.', 'Arbeitsbereichsereignisse werden hierhin gesendet.'), 'hooks.northwind.co/workspace', 'https://'),
          select('export-format', localized(locale, 'Export format', 'Exportformat'), localized(locale, 'Used by scheduled workspace exports.', 'Wird für geplante Arbeitsbereichsexporte verwendet.'), 'json', [
            { id: 'json', label: 'JSON' }, { id: 'csv', label: 'CSV' }, { id: 'parquet', label: 'Parquet' },
          ]),
          prefixedText('custom-domain', localized(locale, 'Custom domain', 'Eigene Domain'), localized(locale, 'Serve shared links from your own domain.', 'Gemeinsam genutzte Links über deine eigene Domain bereitstellen.'), '', 'https://'),
          booleanField('switch', 'beta-features', localized(locale, 'Beta features', 'Beta-Funktionen'), localized(locale, 'Try unreleased features before general release.', 'Unveröffentlichte Funktionen vor dem allgemeinen Start testen.'), false),
          booleanField('switch', 'usage-analytics', localized(locale, 'Usage analytics', 'Nutzungsanalysen'), localized(locale, 'Share anonymous usage data to help prioritise work.', 'Anonyme Nutzungsdaten teilen, um Prioritäten zu verbessern.'), true),
        ],
      }],
    },
  ]
}

function pageContent(locale: SettingsForm1PreviewLocale): LumenSettingsForm1Content {
  const workspace = locale === 'de'
    ? createHbarAppUiSettingsFormLocalizedFixtures().workspace
    : HBAR_APP_UI_SETTINGS_FORM_FIXTURES.workspace
  if (!workspace) throw new Error('Expected host-owned Workspace settings content')

  const workspaceLabel = locale === 'de' ? 'Arbeitsbereich' : 'Workspace'
  const workspaceSection = {
    id: 'workspace',
    label: workspaceLabel,
    title: workspace.labels.panelTitle,
    description: workspace.labels.panelDescription,
    groups: [{ id: 'workspace-fields', fields: workspace.fields.map((field) => mapWorkspaceField(locale, field)) }],
  }

  return {
    pageTitle: workspace.labels.pageTitle,
    workspaceLabel: workspace.labels.accountName,
    sectionNavigationLabel: workspace.labels.navigation,
    changedLabel: workspace.labels.changed,
    unavailableChoiceLabel: localized(locale, 'Choice unavailable', 'Auswahl nicht verfügbar'),
    emptySectionLabel: localized(locale, 'Settings for this section are unavailable.', 'Für diesen Bereich sind keine Einstellungen verfügbar.'),
    formatCharacterCount: (current, maximum) => `${current} / ${maximum}`,
    statusLabels: locale === 'de'
      ? {
          clean: 'Alle Änderungen gespeichert',
          dirty: 'Ungespeicherte Änderungen im Arbeitsbereich',
          saving: 'Wird gespeichert',
          saved: 'Gerade gespeichert',
          error: 'Speichern fehlgeschlagen',
        }
      : {
          clean: 'All changes saved',
          dirty: 'Unsaved changes in Workspace',
          saving: 'Saving',
          saved: 'Saved just now',
          error: 'Save failed',
        },
    feedbackMessages: locale === 'de'
      ? { none: '', saved: '', cancelled: '', 'save-failed': 'Speichern fehlgeschlagen. Bitte erneut versuchen.' }
      : { none: '', saved: '', cancelled: '', 'save-failed': 'Save failed. Try again.' },
    cancelLabel: workspace.labels.cancel,
    saveLabel: workspace.labels.save,
    expectedMaximumFields: 9,
    sections: [workspaceSection, ...extraSections(locale)],
    selectedSectionId: 'workspace',
  }
}

function flattenFields(sections: readonly LumenSettingsForm1Section[]) {
  return sections.flatMap((section) => section.groups.flatMap((group) => group.fields))
}

export function createSettingsForm1ReferencePreviewFixture(
  locale: SettingsForm1PreviewLocale = 'en',
  saveBehavior: SettingsForm1PreviewSaveBehavior = 'success',
): SettingsForm1PreviewFixture {
  const content = pageContent(locale)
  const fields = flattenFields(content.sections)
  const storeFields = fields.map((field) => ({
    id: field.id,
    kind: field.kind,
    value: field.value,
    ...(field.id === 'name' ? { savedValue: 'Northwind' } : {}),
    ...(field.kind === 'select' ? { allowedValueIds: field.options.map((option) => option.id) } : {}),
  })) satisfies SettingsForm1PreviewStoreSeed['fields']

  return {
    locale,
    content,
    saveBehavior,
    storeSeed: {
      sections: content.sections.map((section) => ({ id: section.id })),
      initialSelectedSectionId: content.selectedSectionId,
      fields: storeFields,
      initialSaveState: 'dirty',
      initiallyChangedFieldIds: fields.filter((field) => field.changed).map((field) => field.id),
    },
  }
}

export type { SettingsForm1PreviewFeedback, SettingsForm1PreviewSaveState }
