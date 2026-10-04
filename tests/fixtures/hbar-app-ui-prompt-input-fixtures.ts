import type { HbarAppUiPromptInputContent } from '../../packages/hbar-app-ui/src/index'

const grown = { kind: 'content-grown', expectedMaximum: 12 } as const
const scroll = { kind: 'pane-scroll', expectedMaximum: 60 } as const

export const HBAR_APP_UI_PROMPT_INPUT_FIXTURES: HbarAppUiPromptInputContent = {
  composerLabels: {
    input: 'Prompt',
    placeholder: 'Describe what you need',
    send: 'Send prompt',
    submitTitle: 'Send prompt',
    stop: 'Stop generation',
    uploading: 'Uploading attachments',
    addAttachment: 'Add attachment',
    removeAttachment: (attachment) => `Remove ${attachment.name}`,
  },
  tools: {
    labels: {
      title: 'Prompt box',
      detail: (tokenCount) => `${tokenCount} tokens estimated`,
      model: 'Model selector',
      tokenUsage: (used, limit) => `${used} / ${limit}`,
      tools: 'Prompt tools',
      toolLimit: 'Tool limit reached',
      placeholder: 'Ask with tools enabled',
    },
    models: [
      { id: 'fast', label: 'Fast' },
      { id: 'balanced', label: 'Balanced' },
      { id: 'reasoning', label: 'Reasoning' },
    ],
    tools: [
      { id: 'search', label: 'Search' },
      { id: 'browser', label: 'Browser' },
      { id: 'files', label: 'Files' },
    ],
    initialModelId: 'balanced',
    initialToolIds: ['search'],
    maximumSelectedTools: 2,
    tokenCount: 420,
    tokenLimit: 8000,
  },
  hero: {
    labels: {
      title: 'Start with a prompt',
      detail: 'Turn a short request into a focused workspace action.',
      suggestions: 'Suggested prompts',
      recent: 'Recent prompts',
      placeholder: 'Describe what you need',
      emptyRecent: 'No recent prompts',
    },
    suggestions: [
      { id: 'release', label: 'Plan a release' },
      { id: 'activity', label: 'Summarise activity' },
      { id: 'risks', label: 'Find risky changes' },
      { id: 'reply', label: 'Draft a reply' },
    ],
    recent: [
      { id: 'yesterday', label: "Review yesterday's run" },
      { id: 'handoff', label: 'Prepare a handoff note' },
    ],
    maximumVisibleSuggestions: 4,
    listStrategy: grown,
  },
  template: {
    labels: {
      title: 'Prompt template',
      detail: 'Variables are validated inline',
      save: 'Save template',
      name: 'Template name',
      prompt: 'Prompt',
      variables: 'Variables',
      valid: 'Valid',
      invalid: 'Needs value',
    },
    initialName: 'Release summary',
    initialPrompt: 'Summarise {{workspace}} for {{audience}} by {{deadline}}.',
    variables: [
      { id: 'workspace', label: 'workspace', token: '{{workspace}}' },
      { id: 'audience', label: 'audience', token: '{{audience}}' },
      { id: 'deadline', label: 'deadline', token: '{{deadline}}' },
    ],
    listStrategy: grown,
  },
  upload: {
    labels: {
      title: 'Drop files into your prompt',
      detail: 'Each attachment reports its upload state',
      addFile: 'Add file',
      drop: 'Drag files here',
      release: 'Release to upload',
      hint: 'Or choose a file from this device',
      uploaded: 'Uploaded',
      uploading: 'Uploading',
      progress: (name) => `${name} upload progress`,
      placeholder: 'Add context for the files',
      empty: 'No files attached',
    },
    uploads: [{ id: 'requirements', name: 'requirements.pdf', size: '2.1 MB', progress: 38 }],
    listStrategy: scroll,
  },
  scope: {
    labels: {
      title: 'Scoped prompt bar',
      detail: 'Mention a source to narrow context',
      mention: 'Mention',
      scope: 'Context scope',
      mentions: 'Available sources',
      clear: 'Clear context',
      placeholder: 'Ask with scoped context',
      sourceLimit: 'Source limit reached',
      emptyMentions: 'No sources available',
    },
    scopes: [
      { id: 'workspace', label: 'Workspace' },
      { id: 'file', label: 'Current file' },
      { id: 'run', label: 'Selected run' },
    ],
    mentions: [
      { id: 'activity-log', label: 'activity.log', kind: 'Log' },
      { id: 'readme', label: 'README.md', kind: 'Document' },
      { id: 'run-2026-09', label: 'run-2026-09', kind: 'Run' },
    ],
    initialScopeId: 'workspace',
    initialSourceIds: ['run-2026-09'],
    maximumSources: 2,
    listStrategy: scroll,
  },
  modes: {
    labels: {
      title: 'Prompt input',
      detail: 'Switch modes without losing your draft',
      modes: 'Prompt mode',
      placeholder: (modeLabel) => `Describe a task in ${modeLabel} mode`,
    },
    modes: [
      { id: 'ask', label: 'Ask' },
      { id: 'agent', label: 'Agent' },
      { id: 'edit', label: 'Edit' },
    ],
    initialModeId: 'ask',
    keyboardHints: [
      { id: 'send', label: 'Enter · send' },
      { id: 'newline', label: 'Shift + Enter · newline' },
      { id: 'commands', label: '/ · commands' },
    ],
  },
}

export function createHbarAppUiPromptInputLocalizedFixtures(): HbarAppUiPromptInputContent {
  return {
    ...HBAR_APP_UI_PROMPT_INPUT_FIXTURES,
    hero: {
      ...HBAR_APP_UI_PROMPT_INPUT_FIXTURES.hero!,
      labels: {
        title: '从提示开始',
        detail: '把简短请求转成明确的工作区操作。',
        suggestions: '建议提示',
        recent: '最近提示',
        placeholder: '描述你的需求',
        emptyRecent: '暂无最近提示',
      },
    },
  }
}
