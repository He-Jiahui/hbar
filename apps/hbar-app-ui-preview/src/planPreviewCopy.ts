import type { LumenAgentPlanContent } from '@lumen/app-ui/catalog'

export function createPlanPreviewCopy(localized: boolean) {
  return localized
    ? {
        notice: 'Nur lokale Planvorschau: keine Dateien, Tests, Befehle oder Dienste wurden ausgeführt.',
        pause: 'Vorschau pausieren',
        resume: 'Vorschau fortsetzen',
        paused: 'Vorschau pausiert',
        pausedOn: (title: string) => `Vorschau pausiert bei: ${title}.`,
        start: (count: number) => `${count} Schritte in der Vorschau starten`,
        stop: 'Vorschau stoppen',
        runningReview: 'Vorschau läuft. Keine Werkzeuge gestartet; zum Bearbeiten stoppen.',
        added: (title: string) => `${title} am Ende der lokalen Planvorschau hinzugefügt.`,
        moved: (title: string, position: number, total: number) =>
          `${title} in der Vorschau auf Position ${position} von ${total} verschoben.`,
        retry: 'Vorschau erneut versuchen',
        retryRequested: 'Wiederholung angefordert (Vorschau)',
        run: 'Planvorschau starten',
        save: 'Vorschau speichern',
        running: (step: number, total: number) => `Vorschau: Schritt ${step} von ${total}; keine Werkzeuge gestartet.`,
      }
    : {
        notice: 'Local plan preview only — no files, tests, commands or services have been run.',
        pause: 'Pause preview',
        resume: 'Resume preview',
        paused: 'Preview paused',
        pausedOn: (title: string) => `Preview paused on ${title}.`,
        start: (count: number) => `Preview ${count} steps`,
        stop: 'Stop preview',
        runningReview: 'Preview running. No tools started; stop to keep editing.',
        added: (title: string) => `${title} added to the end of the local plan preview.`,
        moved: (title: string, position: number, total: number) =>
          `${title} moved to preview position ${position} of ${total}.`,
        retry: 'Preview retry',
        retryRequested: 'Retry requested (preview)',
        run: 'Run preview',
        save: 'Save preview',
        running: (step: number, total: number) => `Preview step ${step} of ${total}; no tools started.`,
      }
}

/** Translate preview feedback without replacing the supplied plan, timings or estimates. */
export function projectPlanPreviewCopy(content: LumenAgentPlanContent, localized: boolean): LumenAgentPlanContent {
  const copy = createPlanPreviewCopy(localized)
  return {
    ...content,
    checklist: content.checklist && {
      ...content.checklist,
      labels: {
        ...content.checklist.labels,
        stop: copy.pause,
        resume: copy.resume,
        paused: copy.paused,
        pausedOn: copy.pausedOn,
      },
    },
    editable: content.editable && {
      ...content.editable,
      labels: {
        ...content.editable.labels,
        start: copy.start,
        stop: copy.stop,
        runningReview: copy.runningReview,
        added: copy.added,
        moved: copy.moved,
      },
    },
    tree: content.tree && {
      ...content.tree,
      labels: { ...content.tree.labels, retry: copy.retry, running: copy.retryRequested },
    },
    summary: content.summary && {
      ...content.summary,
      labels: { ...content.summary.labels, run: copy.run },
      ...(content.summary.interaction
        ? {
            interaction: {
              ...content.summary.interaction,
              labels: {
                ...content.summary.interaction.labels,
                save: copy.save,
                stop: copy.stop,
                running: copy.running,
              },
            },
          }
        : {}),
    },
  }
}
