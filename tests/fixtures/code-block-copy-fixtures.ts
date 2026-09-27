/** Synthetic authored history only; none of these code strings are executed. */
const longLines = Array.from({ length: 25 }, (_, index) =>
  index === 24 ? 'const line25 = "fence-tail-needle";' : `const line${index + 1} = "owned fixture ${index + 1}";`,
)

export const codeBlockCopyFixtures = {
  messageIds: {
    ordinary: 'code-copy-ordinary-a',
    multipleTextBlocks: 'code-copy-multiple-text-a',
    historicalPlan: 'code-copy-historical-plan-a',
    otherSession: 'code-copy-ordinary-b',
  },
  longCode: longLines.join('\n'),
  shortCode: '  console.log("second fence — 中文 😀");\n\tconsole.log("not the first fence");',
  multiBlockCode: 'const duplicate = "same code, different text segment";',
  historicalPlanCode: 'const plan = "read-only historical proposal";',
  otherSessionCode: 'const sessionB = "not session A";',
  tailNeedle: 'fence-tail-needle',
  thinking: 'Hidden thinking fixture — never copied as ordinary authored code.',
} as const

export const codeBlockCopyMessages = {
  ordinary: [
    'Ordinary authored code fixture.',
    '',
    '```typescript',
    codeBlockCopyFixtures.longCode,
    '```',
    '',
    'Between fences. Inline `inline-only-negative` is not a fenced block.',
    '',
    '```typescript',
    codeBlockCopyFixtures.shortCode,
    '```',
    '',
    'Authored paragraph after both fences.',
  ].join('\n'),
  multipleTextBlocks: [
    ['First text segment.', '', '```javascript', codeBlockCopyFixtures.multiBlockCode, '```'].join('\n'),
    ['Second text segment.', '', '```javascript', codeBlockCopyFixtures.multiBlockCode, '```'].join('\n'),
  ],
  historicalPlan: [
    'Historical proposal fixture. There is no executable Run behind this message.',
    '<proposed_plan>',
    '# A historical plan',
    '',
    '```typescript',
    codeBlockCopyFixtures.historicalPlanCode,
    '```',
    '</proposed_plan>',
    'Historical proposal ends here.',
  ].join('\n'),
  otherSession: ['Independent session B.', '', '```typescript', codeBlockCopyFixtures.otherSessionCode, '```'].join(
    '\n',
  ),
} as const
