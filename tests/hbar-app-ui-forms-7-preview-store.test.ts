import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createForms7PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms7PreviewFixtures'
import { createForms7PreviewStore, FORMS7_ATTACHMENT_LIMIT } from '../apps/hbar-app-ui-preview/src/forms7PreviewStore'
import { LumenForms7Reference } from '../packages/lumen-app-ui/src/forms-7-reference'

describe('Forms 7 preview store', () => {
  test('projects the cached initial form and bounded host-owned attachment list', () => {
    const fixture = createForms7PreviewFixture()
    const store = createForms7PreviewStore(fixture.storeSeed)
    const content = fixture.contentFor(store.getState())

    expect(content.copy.pageTitle).toBe('Community arts fund application')
    expect(content.draft).toMatchObject({
      projectTitle: '',
      organization: '',
      contactEmail: '',
      focusAreaId: '',
      tagInput: '',
      tags: [],
      fundingTierId: '',
      summary: '',
      consentChecked: false,
    })
    expect(content.focusAreas.map((area) => area.label)).toEqual([
      'Visual arts',
      'Performing arts',
      'Music and sound',
      'Literary arts',
      'Community media',
    ])
    expect(content.fundingTiers.map((tier) => [tier.label, tier.description, tier.amountLabel])).toEqual([
      ['Seed grant', 'Early-stage work and prototypes', '$2,500'],
      ['Project grant', 'A full season or production run', '$10,000'],
      ['Residency grant', 'A funded studio placement', '$25,000'],
    ])
    expect(content.attachments.map((attachment) => [attachment.fileName, attachment.sizeLabel])).toEqual([
      ['project-budget-2026.pdf', '180 KB'],
      ['community-letters-of-support.pdf', '940 KB'],
    ])
    expect(content.progress).toMatchObject({
      percent: 0,
      completedRequiredFields: 0,
      totalRequiredFields: 8,
      percentLabel: '0%',
      completionLabel: '0 of 8 required fields complete',
      summaryCharactersRemaining: 400,
      summaryCharactersRemainingLabel: '400 left',
    })
    expect(content.submitDisabled).toBe(true)
    expect(content.attachmentList).toEqual({ kind: 'content-grown', maximumCount: FORMS7_ATTACHMENT_LIMIT })
  })

  test('projects the recorded summary sample, remaining-character count, and progress', () => {
    const fixture = createForms7PreviewFixture()
    const store = createForms7PreviewStore(fixture.storeSeed)

    expect(store.getState().setSummary('audit sample')).toBe(true)
    const content = fixture.contentFor(store.getState())
    expect('audit sample'.length).toBe(12)
    expect(content.draft.summary).toBe('audit sample')
    expect(content.progress).toMatchObject({
      percent: 13,
      completedRequiredFields: 1,
      percentLabel: '13%',
      summaryCharactersRemaining: 388,
      summaryCharactersRemainingLabel: '388 left',
    })
    expect(content.submitDisabled).toBe(true)
  })

  test('projects the recorded consent change without enabling submit or fabricating a result', () => {
    const fixture = createForms7PreviewFixture()
    const store = createForms7PreviewStore(fixture.storeSeed)

    expect(store.getState().setConsent(true)).toBe(true)
    const content = fixture.contentFor(store.getState())
    expect(content.draft.consentChecked).toBe(true)
    expect(content.progress).toMatchObject({
      percent: 13,
      completedRequiredFields: 1,
      percentLabel: '13%',
    })
    expect(content.submitDisabled).toBe(true)
  })

  test('renders the source control families and footer reading order without an implicit form role', () => {
    const fixture = createForms7PreviewFixture()
    const store = createForms7PreviewStore(fixture.storeSeed)
    const html = renderToStaticMarkup(
      createElement(LumenForms7Reference, {
        instanceId: 'forms-7-test',
        content: fixture.contentFor(store.getState()),
        onTextFieldChange: () => undefined,
        onFocusAreaChange: () => undefined,
        onTagInputChange: () => undefined,
        onTagCommitRequest: () => undefined,
        onTagRemovalRequest: () => undefined,
        onFundingTierChange: () => undefined,
        onSummaryChange: () => undefined,
        onFilesSelected: () => undefined,
        onAttachmentRemovalRequest: () => undefined,
        onConsentChange: () => undefined,
        onSaveDraft: () => undefined,
        onSubmitApplication: () => undefined,
      }),
    )

    const savePosition = html.indexOf(fixture.copy.saveDraftLabel)
    const progressPosition = html.indexOf(fixture.copy.formatRequiredCompletion(0, 8))
    const submitPosition = html.indexOf(fixture.copy.submitApplicationLabel)
    const titlePosition = html.indexOf(fixture.copy.pageTitle)
    const descriptionPosition = html.indexOf(fixture.copy.pageDescription)
    const percentPosition = html.indexOf(fixture.copy.formatPercent(0))

    expect(titlePosition).toBeGreaterThanOrEqual(0)
    expect(descriptionPosition).toBeGreaterThan(titlePosition)
    expect(percentPosition).toBeGreaterThan(descriptionPosition)
    expect(savePosition).toBeGreaterThanOrEqual(0)
    expect(progressPosition).toBeGreaterThan(savePosition)
    expect(submitPosition).toBeGreaterThan(progressPosition)
    expect(html).toContain('role="combobox"')
    expect(html).toContain('type="radio"')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('type="file"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-label="Remove project-budget-2026.pdf"')
    expect(html).not.toContain('role="form"')
    expect(html).not.toContain('role="progressbar"')
  })

  test('keeps focus selection in the host draft and rejects an unknown option', () => {
    const fixture = createForms7PreviewFixture()
    const store = createForms7PreviewStore(fixture.storeSeed)

    expect(store.getState().selectFocusArea('music-sound')).toBe(true)
    expect(fixture.contentFor(store.getState()).draft.focusAreaId).toBe('music-sound')
    expect(store.getState().selectFocusArea('unknown-area')).toBe(false)
  })

  test('leaves unverified tag, file, save, and submit outcomes with the host', () => {
    const fixture = createForms7PreviewFixture()
    const store = createForms7PreviewStore(fixture.storeSeed)
    const initial = store.getState()
    const initialContent = fixture.contentFor(initial)

    expect(initial.setTagInput('community media')).toBe(true)
    expect(store.getState().requestTagCommit()).toEqual({ kind: 'commit-discipline-tag', value: 'community media' })
    expect(store.getState().draft.tags).toEqual([])
    expect(store.getState().requestTagRemoval('missing-tag')).toBeNull()

    const selectedFiles = [{ fileName: 'new-sample.pdf', byteSize: 120_000, mediaType: 'application/pdf' }] as const
    expect(store.getState().requestFileSelection(selectedFiles)).toEqual({
      kind: 'select-supporting-files',
      files: selectedFiles,
    })
    expect(store.getState().requestAttachmentRemoval('project-budget-2026')).toEqual({
      kind: 'remove-supporting-file',
      attachmentId: 'project-budget-2026',
    })
    expect(store.getState().requestAttachmentRemoval('missing-file')).toBeNull()
    expect(store.getState().requestSaveDraft()).toEqual({ kind: 'save-application-draft' })
    expect(store.getState().requestSubmit()).toBeNull()

    expect(fixture.contentFor(store.getState()).attachments).toEqual(initialContent.attachments)
    expect(fixture.contentFor(store.getState()).submitDisabled).toBe(true)
    expect(store.getState().attachments).toEqual(initial.attachments)
  })

  test('supports the documented attachment boundary without turning the list into a fake scroll pane', () => {
    const fixture = createForms7PreviewFixture()
    const makeAttachments = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `host-file-${index + 1}`,
        fileName: `host-file-${index + 1}.pdf`,
        sizeLabel: `${index + 1} KB`,
      }))

    for (const count of [0, 1, FORMS7_ATTACHMENT_LIMIT]) {
      const store = createForms7PreviewStore({ ...fixture.storeSeed, attachments: makeAttachments(count) })
      const content = fixture.contentFor(store.getState())
      expect(content.attachments).toHaveLength(count)
      expect(content.attachmentList).toEqual({ kind: 'content-grown', maximumCount: FORMS7_ATTACHMENT_LIMIT })
    }

    expect(() =>
      createForms7PreviewStore({
        ...fixture.storeSeed,
        attachments: makeAttachments(FORMS7_ATTACHMENT_LIMIT + 1),
      }),
    ).toThrow('Supporting documents cannot exceed 5 host records.')
  })

  test('keeps localization in the fixture, including a long translated heading and dynamic counts', () => {
    const fixture = createForms7PreviewFixture('de')
    const store = createForms7PreviewStore(fixture.storeSeed)
    const initial = fixture.contentFor(store.getState())

    expect(initial.copy.pageTitle).toContain('gemeinnütziger Kunst- und Kulturprojekte')
    expect(initial.copy.pageTitle.length).toBeGreaterThan(70)
    expect(initial.copy.formatCharactersRemaining(400)).toBe('400 Zeichen übrig')
    expect(initial.copy.formatRequiredCompletion(0, 8)).toBe('0 von 8 Pflichtfeldern ausgefüllt')
    expect(initial.focusAreas[0]?.label).toBe('Bildende Kunst')
    expect(initial.fundingTiers[1]?.label).toBe('Projektförderung')
  })
})
