import type { LumenAgentApprovalContent } from '@lumen/app-ui/catalog'

export function createApprovalPreviewCopy(localized: boolean) {
  return localized
    ? {
        notice:
          'Lokale Vorschau: Keine Projekte geloescht, Richtlinien gespeichert, Berechtigungen erteilt oder kostenpflichtigen Auftraege gestartet.',
        exportNotice: 'Export-Anfrage nur in der Vorschau. Keine Datei wurde erstellt oder heruntergeladen.',
        approved: 'Vorschau genehmigt',
        skipped: 'Vorschau uebersprungen',
        inlineApproved: 'Vorschau genehmigt: 12 archivierte Projekte zur Loeschung ausgewaehlt',
        noDelete: 'Keine Projekte oder Build-Daten wurden geloescht.',
        diffApproved: 'Einmal in der Vorschau erlaubt. Keine Aufbewahrungsrichtlinie wurde geaendert.',
        alwaysAllowed:
          'Immer erlauben nur fuer diese Vorschau ausgewaehlt. Keine dauerhafte Richtlinie wurde gespeichert.',
        queueAdvanced: 'Lokale Entscheidung gespeichert. Die naechste Vorschau-Anfrage ist bereit.',
        permissionSummary: (selected: number, total: number) =>
          `${selected} von ${total} Bereichen in der Vorschau ausgewaehlt. Kein Dienstzugriff wurde erteilt.`,
        costApproved: 'Vorschau genehmigt. Kein Prognoseauftrag wurde gestartet und keine Modellnutzung berechnet.',
      }
    : {
        notice:
          'Local preview only. No projects were deleted, policies saved, permissions granted or paid jobs started.',
        exportNotice: 'Preview export request only. No file was created or downloaded.',
        approved: 'Preview approved',
        skipped: 'Preview skipped',
        inlineApproved: 'Preview approved: 12 archived projects selected for deletion',
        noDelete: 'No projects or build history were deleted.',
        diffApproved: 'Allowed once in the preview. No retention policy was changed.',
        alwaysAllowed: 'Always allow selected for this preview only. No persistent policy was saved.',
        queueAdvanced: 'Local decision recorded. The next preview request is ready.',
        permissionSummary: (selected: number, total: number) =>
          `${selected} of ${total} scopes selected in the preview. No service access was granted.`,
        costApproved: 'Preview approved. No forecast job was started and no model usage charged.',
      }
}

/** Keep reference-shaped transitions, while describing only the local preview facts. */
export function projectApprovalPreviewCopy(
  content: LumenAgentApprovalContent,
  localized: boolean,
): LumenAgentApprovalContent {
  const copy = createApprovalPreviewCopy(localized)
  return {
    ...content,
    inline: content.inline
      ? {
          ...content.inline,
          outcomes: {
            approved: { summary: copy.inlineApproved, followUp: copy.noDelete, announcement: copy.notice },
            rejected: { summary: copy.skipped, announcement: copy.notice },
          },
        }
      : undefined,
    diff: content.diff
      ? {
          ...content.diff,
          outcomes: {
            approved: { status: copy.approved, summary: copy.diffApproved, announcement: copy.notice },
            rejected: { status: copy.skipped, summary: copy.skipped, announcement: copy.notice },
            'always-allow': { status: copy.approved, summary: copy.alwaysAllowed, announcement: copy.notice },
          },
        }
      : undefined,
    queue: content.queue
      ? {
          ...content.queue,
          outcomes: {
            approved: {
              ...content.queue.outcomes.approved,
              stateLabel: copy.approved,
              announcement: copy.queueAdvanced,
            },
            rejected: {
              ...content.queue.outcomes.rejected,
              stateLabel: copy.skipped,
              announcement: copy.queueAdvanced,
            },
          },
        }
      : undefined,
    permission: content.permission
      ? {
          ...content.permission,
          outcomes: {
            approved: { status: copy.approved, summary: copy.permissionSummary, announcement: () => copy.notice },
            rejected: { status: copy.skipped, summary: () => copy.skipped, announcement: () => copy.notice },
          },
        }
      : undefined,
    cost: content.cost
      ? {
          ...content.cost,
          outcomes: {
            approved: { status: copy.approved, summary: copy.costApproved, announcement: copy.notice },
            rejected: { status: copy.skipped, summary: copy.skipped, announcement: copy.notice },
          },
        }
      : undefined,
  }
}
