import type { HbarSessionWorkspaceLabels } from '@hbar/app-react'

export function composerAttachmentCopy(
  choose: (chinese: string, english: string) => string,
): HbarSessionWorkspaceLabels['attachments'] {
  return {
    label: choose('附件处理', 'Attachment transfers'),
    drop: choose('拖放文件或图片到这里', 'Drop files or images here'),
    status: (status) => {
      switch (status) {
        case 'preparing':
          return choose('正在准备…', 'Preparing…')
        case 'uploading':
          return choose('正在上传…', 'Uploading…')
        case 'failed':
          return choose('未能添加', 'Could not add')
        case 'unknown':
          return choose('上传结果待核对', 'Upload result unconfirmed')
        case 'reconciling':
          return choose('正在核对…', 'Checking…')
        case 'ready':
          return choose('文件已上传', 'File uploaded')
      }
    },
    remove: (name) => choose(`移除附件 ${name}`, `Remove attachment ${name}`),
    reconcile: (name) => choose(`核对上传 ${name}`, `Check upload ${name}`),
    check: choose('核对上传', 'Check upload'),
    accept: choose('加入当前草稿', 'Add to current draft'),
    acceptNamed: (name) => choose(`将 ${name} 加入当前草稿`, `Add ${name} to the current draft`),
    error: (code) => {
      switch (code) {
        case 'PREPARATION_FAILED':
          return choose(
            '未能读取所选文件，请移除后重新选择。',
            'Could not read the selected file. Remove it and choose it again.',
          )
        case 'ATTACHMENT_LIMIT':
          return choose(
            '最多添加 12 个附件，请先移除不需要的文件。',
            'Choose up to 12 attachments. Remove unneeded files first.',
          )
        case 'FILE_LIMIT':
          return choose(
            '请选择大于 0 字节且不超过 10 MB 的文件。',
            'Choose a file larger than 0 bytes and no larger than 10 MB.',
          )
        case 'INVALID_INPUT':
          return choose('文件信息不符合要求，请重新选择。', 'This file has unsupported details. Choose it again.')
        case 'UNSUPPORTED_TYPE':
          return choose(
            '不支持此文件类型，请移除后选择其他文件。',
            'This file type is unsupported. Remove it and choose another file.',
          )
        case 'SOURCE_NOT_FOUND':
        case 'SOURCE_CHANGED':
          return choose(
            '所选文件已失效或发生变化，请移除后重新选择。',
            'The selected file expired or changed. Remove it and choose it again.',
          )
        case 'DRAFT_CHANGED':
          return choose(
            '草稿已经进入下一轮。确认后可加入当前草稿，或移除此附件。',
            'The draft has moved on. Add this file to the current draft or remove it.',
          )
        case 'CONTENT_MISMATCH':
          return choose(
            '文件校验不一致，尚未加入草稿。请核对上传结果。',
            'The file did not match its upload details. Check the result before adding it.',
          )
        case 'NOT_FOUND':
          return choose(
            '暂未查到文件，上传仍可能在处理中。请稍后再次核对。',
            'The file is not visible yet; upload may still be in progress. Check again shortly.',
          )
        case 'BUSY':
          return choose(
            '请先核对待处理的上传，或等待当前操作结束。',
            'Check pending uploads or wait for the current operation to finish.',
          )
        case 'VERSION_CONFLICT':
          return choose('草稿已变化，请重新选择文件。', 'The draft changed. Choose the files again.')
        case 'CAPABILITY_UNAVAILABLE':
          return choose('此客户端暂不支持这项附件操作。', 'This attachment action is unavailable in this client.')
        case 'UNAUTHORIZED':
        case 'FORBIDDEN':
          return choose(
            '没有上传权限，请重新连接后移除此项并再选择文件。',
            'Upload was not permitted. Reconnect, remove this item and choose the file again.',
          )
        default:
          return choose(
            '尚不能确认是否收到文件。请核对上传结果，不要重复上传。',
            'Receipt of the file is unconfirmed. Check its result without uploading it again.',
          )
      }
    },
  }
}
