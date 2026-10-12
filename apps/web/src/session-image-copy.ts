import type { HbarSessionImageLabels } from '@hbar/app-react'
import type { ImageResourceErrorCode } from '@hbar/app-runtime'
import type { ShellLocale } from './shell-copy'

/** Host-owned copy shared by composer thumbnails and immutable message image occurrences. */
export function sessionImageCopy(locale: ShellLocale): HbarSessionImageLabels {
  const zh = locale === 'zh-CN'
  const errors: Record<ImageResourceErrorCode, string> = zh
    ? {
        INVALID_INPUT: '这张图片的引用无效。',
        UNSUPPORTED_IMAGE: '暂不支持预览这种图片格式。',
        TOO_LARGE: '图片尺寸或动画帧数超出预览范围。',
        BUSY: '正在读取其他图片，请稍后重试。',
        CANCELLED: '已停止读取图片。',
        TIMEOUT: '读取图片超时，请重试。',
        UNAUTHORIZED: '图片访问权限已失效，请重新连接。',
        NOT_FOUND: '宿主上已找不到这张图片。',
        READ_FAILED: '无法读取图片，请重试。',
        CONTENT_MISMATCH: '图片内容与原附件不一致。',
        DISCONNECTED: '连接后可查看图片。',
        INVALID_IMAGE: '图片数据不完整或已损坏。',
        DECODE_FAILED: '无法显示这张图片，请重试。',
        UNAVAILABLE: '当前环境无法生成图片预览。',
      }
    : {
        INVALID_INPUT: 'This image reference is invalid.',
        UNSUPPORTED_IMAGE: 'Preview is not supported for this image format.',
        TOO_LARGE: 'Image dimensions or animation frames exceed preview limits.',
        BUSY: 'Other images are loading. Try again shortly.',
        CANCELLED: 'Image loading was cancelled.',
        TIMEOUT: 'Image loading timed out. Try again.',
        UNAUTHORIZED: 'Image access has expired. Reconnect to continue.',
        NOT_FOUND: 'This image is no longer available on the Host.',
        READ_FAILED: 'The image could not be read. Try again.',
        CONTENT_MISMATCH: 'The image does not match the original attachment.',
        DISCONNECTED: 'Connect to view this image.',
        INVALID_IMAGE: 'This image is incomplete or damaged.',
        DECODE_FAILED: 'The image could not be displayed. Try again.',
        UNAVAILABLE: 'Image previews are unavailable in this environment.',
      }
  return {
    gallery: {
      title: zh ? '图片预览' : 'Image preview',
      close: zh ? '关闭图片预览' : 'Close image preview',
      previous: zh ? '上一张图片' : 'Previous image',
      next: zh ? '下一张图片' : 'Next image',
      position: (index, total) => `${index} / ${total}`,
      loading: zh ? '正在读取图片…' : 'Loading image…',
      retry: zh ? '重新读取' : 'Retry loading',
      unavailable: zh ? '无法打开这组图片。' : 'This image collection is unavailable.',
      select: (name) => (zh ? `查看图片：${name}` : `View image: ${name}`),
    },
    conversation: zh ? '对话' : 'Conversation',
    open: (name) => (zh ? `打开图片：${name}` : `Open image: ${name}`),
    loading: zh ? '正在读取预览…' : 'Loading preview…',
    retry: zh ? '重新读取' : 'Retry loading',
    error: (code) => errors[code],
    capacity: (count, limit) =>
      zh
        ? `这组共有 ${count} 张图片，超过一次预览 ${limit} 张的上限。`
        : `This collection has ${count} images, exceeding the ${limit}-image preview limit.`,
  }
}
