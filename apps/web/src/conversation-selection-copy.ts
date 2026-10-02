import type { HbarSessionWorkspaceLabels } from '@hbar/app-react'

export function conversationSelectionCopy(
  choose: (chinese: string, english: string) => string,
): HbarSessionWorkspaceLabels['conversationSelection'] {
  return {
    addToChat: choose('添加到聊天', 'Add to chat'),
    addError: (code) => {
      switch (code) {
        case 'VERSION_CONFLICT':
        case 'STALE_TARGET':
          return choose(
            '消息或输入草稿已变化，请重新选择文字后添加。',
            'The message or draft changed. Select the text again before adding it.',
          )
        case 'BUSY':
          return choose(
            '输入区正忙或引用数量已达上限。请等待当前操作完成；若引用已满，先移除一项。',
            'The composer is busy or at its reference limit. Wait for the current action to finish. Remove a reference first if the limit is reached.',
          )
        case 'INVALID_INPUT':
        case 'INPUT_TOO_LARGE':
          return choose(
            '所选内容无效或过长，请缩短选区后重试。',
            'The selection is invalid or too long. Select a shorter passage and try again.',
          )
        case 'CAPABILITY_UNAVAILABLE':
          return choose(
            '当前无法引用此消息，请重新打开会话后重试。',
            'This message cannot be referenced right now. Reopen the conversation and try again.',
          )
        default:
          return choose(
            '无法添加消息引用。原草稿已保留，请重新选择后重试。',
            'Could not add the message reference. Your draft is preserved; select the text and try again.',
          )
      }
    },
  }
}
