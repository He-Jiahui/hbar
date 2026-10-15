import {
  desktopTrayActionsSchema,
  desktopPairingResponseSchema,
  type DesktopTrayActions,
  type DesktopPairingRequest,
  type DesktopPairingResponse,
} from '@hbar/contracts/desktop'

interface TrayCopy extends DesktopTrayActions {
  operatorAccess: string
  observerAccess: string
  addressesLabel: string
  addressesUnavailable: string
  pairingCode: string
  expires: string
  singleUse: string
}

const copies: Readonly<Record<'zh-CN' | 'en-US', TrayCopy>> = {
  'zh-CN': {
    copyAddress: '复制网页地址',
    pairOperator: '配对可操作设备',
    pairObserver: '配对只读设备',
    dialogTitle: 'hbar 网页访问',
    acknowledge: '关闭',
    addressCopied: '网页地址已复制。',
    copyFailed: '无法复制网页地址，请使用“打开网页”访问。',
    pairingFailed: '未能确认配对码是否已生成。请检查后台连接后重新选择配对；新配对码会替换旧码。',
    operatorAccess: '权限：可操作所有工作区',
    observerAccess: '权限：只读访问所有工作区',
    addressesLabel: '网页地址：',
    addressesUnavailable: '当前网页地址暂不可用。',
    pairingCode: '配对码：',
    expires: '有效期至：',
    singleUse: '配对成功后此码失效。新建配对码会替换旧码。',
  },
  'en-US': {
    copyAddress: 'Copy web address',
    pairOperator: 'Pair an operator device',
    pairObserver: 'Pair a read-only device',
    dialogTitle: 'hbar web access',
    acknowledge: 'Close',
    addressCopied: 'Web address copied.',
    copyFailed: 'Unable to copy the web address. Use Open web to access the backend.',
    pairingFailed:
      'Unable to confirm whether a pairing code was created. Check the backend connection and select pairing again; a new code replaces the previous code.',
    operatorAccess: 'Access: operate all workspaces',
    observerAccess: 'Access: read all workspaces',
    addressesLabel: 'Web addresses:',
    addressesUnavailable: 'The current web address is unavailable.',
    pairingCode: 'Pairing code:',
    expires: 'Expires:',
    singleUse: 'The code expires after a successful pairing. A new code replaces the previous code.',
  },
}

function locale(language: string): 'en-US' | 'zh-CN' {
  return language.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
}

export function projectDesktopTrayActions(language: string): DesktopTrayActions {
  const {
    copyAddress,
    pairOperator,
    pairObserver,
    dialogTitle,
    acknowledge,
    addressCopied,
    copyFailed,
    pairingFailed,
  } = copies[locale(language)]
  return desktopTrayActionsSchema.parse({
    copyAddress,
    pairOperator,
    pairObserver,
    dialogTitle,
    acknowledge,
    addressCopied,
    copyFailed,
    pairingFailed,
  })
}

/** The native adapter renders a Host-owned, bounded message; pairing authority stays in system commands. */
export function projectDesktopPairing(
  pairing: { code: string; expiresAt: number },
  role: DesktopPairingRequest['role'],
  addresses: readonly string[],
  language: string,
): DesktopPairingResponse {
  const selected = locale(language)
  const copy = copies[selected]
  const urls = [...new Set(addresses)].slice(0, 16)
  const expires = new Intl.DateTimeFormat(selected, {
    dateStyle: 'short',
    timeStyle: 'long',
  }).format(pairing.expiresAt)
  return desktopPairingResponseSchema.parse({
    ...pairing,
    title: copy.dialogTitle,
    acknowledge: copy.acknowledge,
    message: [
      role === 'operator' ? copy.operatorAccess : copy.observerAccess,
      urls.length ? `${copy.addressesLabel}\n${urls.join('\n')}` : copy.addressesUnavailable,
      `${copy.pairingCode} ${pairing.code}`,
      `${copy.expires} ${expires}`,
      copy.singleUse,
    ].join('\n\n'),
  })
}
