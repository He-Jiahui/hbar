export type AuditGeometryAxis = 'x' | 'y'

export type AuditGeometryRect = Readonly<{
  width: number
  height: number
}>

export type AuditContentClip = Readonly<{
  region: Readonly<{
    path: string
    tag: string
    role: string | null
    kind: 'semantic-region' | 'scroll-owner'
  }>
  owner: Readonly<{
    path: string
    tag: string
    overflowX: string
    overflowY: string
    client: AuditGeometryRect
    scroll: AuditGeometryRect
  }>
  axes: readonly AuditGeometryAxis[]
  amount: Readonly<{
    top: number
    right: number
    bottom: number
    left: number
  }>
  unreachable: boolean
}>

export type AuditScrollOwner = Readonly<{
  path: string
  tag: string
  axes: readonly AuditGeometryAxis[]
  client: AuditGeometryRect
  scroll: AuditGeometryRect
  maxScroll: Readonly<{ x: number; y: number }>
}>

export type AuditContentGeometry = Readonly<{
  viewport: AuditGeometryRect
  extent: AuditGeometryRect
  clippedRegions: readonly AuditContentClip[]
  scrollOwners: readonly AuditScrollOwner[]
}>

/**
 * Read content geometry without sampling text, values, or source code.
 *
 * This function is deliberately self-contained so Playwright can serialize it
 * into either the reference iframe or the local preview page.
 */
export function readAuditContentGeometry(element: Element): AuditContentGeometry {
  const document = element.ownerDocument
  const view = document.defaultView
  const documentElement = document.documentElement
  const documentScroller = document.scrollingElement
  const root = element as HTMLElement
  const rootRect = element.getBoundingClientRect()
  const axisNames: readonly AuditGeometryAxis[] = ['x', 'y']
  const clipTags = new Set([
    'header',
    'main',
    'footer',
    'nav',
    'aside',
    'article',
    'section',
    'form',
    'fieldset',
    'dialog',
  ])
  const clipRoles = new Set([
    'banner',
    'main',
    'contentinfo',
    'navigation',
    'complementary',
    'dialog',
    'region',
    'form',
  ])
  const round = (value: number) => Math.round(value * 100) / 100
  const rendered = (candidate: Element): boolean => {
    const rect = candidate.getBoundingClientRect()
    const style = view?.getComputedStyle(candidate)
    return Boolean(
      rect.width > 0 &&
      rect.height > 0 &&
      style?.display !== 'none' &&
      style?.visibility !== 'hidden' &&
      style?.visibility !== 'collapse',
    )
  }
  const pathOf = (candidate: Element): string => {
    if (candidate === element) return '$root'
    const parts: string[] = []
    let current: Element | null = candidate
    while (current) {
      const tag = current.tagName.toLowerCase()
      const parent: Element | null = current.parentElement
      if (!parent) {
        parts.unshift(tag)
        break
      }
      const currentTag = current.tagName
      let siblingIndex = 0
      for (let index = 0; index < parent.children.length; index += 1) {
        const sibling = parent.children.item(index)
        if (sibling?.tagName !== currentTag) continue
        siblingIndex += 1
        if (sibling === current) break
      }
      parts.unshift(`${tag}:nth-of-type(${siblingIndex})`)
      if (current === element) break
      current = parent
    }
    return parts.join(' > ')
  }
  const clientRectOf = (candidate: Element) => {
    const rect = candidate.getBoundingClientRect()
    const box = candidate as HTMLElement
    const left = rect.left + box.clientLeft
    const top = rect.top + box.clientTop
    return {
      left,
      top,
      right: left + box.clientWidth,
      bottom: top + box.clientHeight,
      width: box.clientWidth,
      height: box.clientHeight,
    }
  }
  const overflowOf = (candidate: Element, axis: AuditGeometryAxis): string => {
    const style = view?.getComputedStyle(candidate)
    return axis === 'x' ? (style?.overflowX ?? 'visible') : (style?.overflowY ?? 'visible')
  }
  const scrollSizeOf = (candidate: Element, axis: AuditGeometryAxis): number => {
    const box = candidate as HTMLElement
    return axis === 'x' ? box.scrollWidth : box.scrollHeight
  }
  const clientSizeOf = (candidate: Element, axis: AuditGeometryAxis): number => {
    const box = candidate as HTMLElement
    return axis === 'x' ? box.clientWidth : box.clientHeight
  }
  const canScroll = (candidate: Element, axis: AuditGeometryAxis): boolean => {
    const overflow = overflowOf(candidate, axis)
    return (
      (overflow === 'auto' || overflow === 'scroll') &&
      scrollSizeOf(candidate, axis) > clientSizeOf(candidate, axis) + 1
    )
  }
  const clipAmount = (
    target: Readonly<{ left: number; top: number; right: number; bottom: number }>,
    clip: Readonly<{ left: number; top: number; right: number; bottom: number }>,
    axis: AuditGeometryAxis,
  ) => ({
    top: axis === 'y' ? round(Math.max(0, clip.top - target.top)) : 0,
    right: axis === 'x' ? round(Math.max(0, target.right - clip.right)) : 0,
    bottom: axis === 'y' ? round(Math.max(0, target.bottom - clip.bottom)) : 0,
    left: axis === 'x' ? round(Math.max(0, clip.left - target.left)) : 0,
  })
  const outside = (amount: ReturnType<typeof clipAmount>) =>
    amount.top > 0 || amount.right > 0 || amount.bottom > 0 || amount.left > 0

  const descendants = [element, ...element.querySelectorAll('*')]
  const scrollCandidates = new Set<Element>(descendants)
  let outerCandidate: Element | null = element.parentElement
  while (outerCandidate) {
    scrollCandidates.add(outerCandidate)
    if (outerCandidate === documentElement) break
    outerCandidate = outerCandidate.parentElement
  }
  let extentWidth = Math.max(rootRect.width, root.clientWidth)
  let extentHeight = Math.max(rootRect.height, root.clientHeight)
  for (const candidate of descendants) {
    if (!rendered(candidate)) continue
    const rect = candidate.getBoundingClientRect()
    extentWidth = Math.max(extentWidth, rect.right - rootRect.left)
    extentHeight = Math.max(extentHeight, rect.bottom - rootRect.top)
  }

  const scrollOwnerElements: Element[] = []
  const scrollOwners: AuditScrollOwner[] = []
  for (const candidate of scrollCandidates) {
    if (candidate === documentElement || candidate === document.body) continue
    if (!rendered(candidate)) continue
    const axes = axisNames.filter((axis) => canScroll(candidate, axis))
    if (axes.length === 0) continue
    const box = candidate as HTMLElement
    scrollOwnerElements.push(candidate)
    scrollOwners.push({
      path: pathOf(candidate),
      tag: candidate.tagName.toLowerCase(),
      axes,
      client: { width: box.clientWidth, height: box.clientHeight },
      scroll: { width: box.scrollWidth, height: box.scrollHeight },
      maxScroll: {
        x: Math.max(0, box.scrollWidth - box.clientWidth),
        y: Math.max(0, box.scrollHeight - box.clientHeight),
      },
    })
  }

  const clippingAncestors = (candidate: Element): Element[] => {
    const ancestors: Element[] = []
    let current = candidate.parentElement
    while (current) {
      ancestors.push(current)
      if (current === documentElement) break
      current = current.parentElement
    }
    if (!ancestors.includes(documentElement)) ancestors.push(documentElement)
    return ancestors
  }
  const clips: AuditContentClip[] = []
  const addClip = (
    region: Element,
    kind: AuditContentClip['region']['kind'],
    owner: Element | null,
    axis: AuditGeometryAxis,
    amount: ReturnType<typeof clipAmount>,
  ) => {
    const ownerKey = owner ? pathOf(owner) : '$viewport'
    const regionPath = pathOf(region)
    const existing = clips.find(
      (clip) => clip.region.path === regionPath && clip.region.kind === kind && clip.owner.path === ownerKey,
    )
    const overflowX = owner ? overflowOf(owner, 'x') : 'clip'
    const overflowY = owner ? overflowOf(owner, 'y') : 'clip'
    const ownerBox = owner as HTMLElement | null
    const client = ownerBox
      ? { width: ownerBox.clientWidth, height: ownerBox.clientHeight }
      : { width: documentElement.clientWidth, height: documentElement.clientHeight }
    const scroll = ownerBox
      ? { width: ownerBox.scrollWidth, height: ownerBox.scrollHeight }
      : {
          width: documentScroller?.scrollWidth ?? documentElement.scrollWidth,
          height: documentScroller?.scrollHeight ?? documentElement.scrollHeight,
        }
    if (existing) {
      const nextAxes = existing.axes.includes(axis) ? existing.axes : [...existing.axes, axis]
      const index = clips.indexOf(existing)
      clips[index] = {
        ...existing,
        axes: nextAxes,
        amount: {
          top: Math.max(existing.amount.top, amount.top),
          right: Math.max(existing.amount.right, amount.right),
          bottom: Math.max(existing.amount.bottom, amount.bottom),
          left: Math.max(existing.amount.left, amount.left),
        },
      }
      return
    }
    clips.push({
      region: {
        path: regionPath,
        tag: region.tagName.toLowerCase(),
        role: region.getAttribute('role'),
        kind,
      },
      owner: {
        path: ownerKey,
        tag: owner?.tagName.toLowerCase() ?? 'viewport',
        overflowX,
        overflowY,
        client,
        scroll,
      },
      axes: [axis],
      amount,
      unreachable: true,
    })
  }
  const viewportRect = {
    left: 0,
    top: 0,
    right: view?.innerWidth ?? documentElement.clientWidth,
    bottom: view?.innerHeight ?? documentElement.clientHeight,
  }
  const documentCanScroll = (axis: AuditGeometryAxis) => {
    if (!documentScroller) return false
    const rootOverflow = overflowOf(documentElement, axis)
    const viewportOverflow =
      rootOverflow === 'visible' && document.body ? overflowOf(document.body, axis) : rootOverflow
    if (viewportOverflow === 'hidden' || viewportOverflow === 'clip') return false
    return axis === 'x'
      ? documentScroller.scrollWidth > documentScroller.clientWidth + 1
      : documentScroller.scrollHeight > documentScroller.clientHeight + 1
  }
  const outsideClip = (
    region: Element,
    targetRect: DOMRect,
    kind: AuditContentClip['region']['kind'],
    axis: AuditGeometryAxis,
  ) => {
    const target = {
      left: targetRect.left,
      top: targetRect.top,
      right: targetRect.right,
      bottom: targetRect.bottom,
    }
    for (const ancestor of clippingAncestors(region)) {
      const overflow = overflowOf(ancestor, axis)
      if (overflow === 'visible') continue
      const clipRect = clientRectOf(ancestor)
      const amount = clipAmount(target, clipRect, axis)
      if (!outside(amount)) continue
      if (canScroll(ancestor, axis)) {
        // This owner can reveal its descendant. Check its own box against any
        // higher clipping ancestor in the separate scroll-owner pass.
        return
      }
      addClip(region, kind, ancestor, axis, amount)
      return
    }

    const amount = clipAmount(target, viewportRect, axis)
    if (outside(amount) && !documentCanScroll(axis)) addClip(region, kind, null, axis, amount)
  }

  const semanticRegions = descendants.filter((candidate) => {
    if (candidate === element || !rendered(candidate)) return false
    const tag = candidate.tagName.toLowerCase()
    const role = candidate.getAttribute('role')
    return clipTags.has(tag) || (role !== null && clipRoles.has(role))
  })
  for (const region of semanticRegions) {
    const rect = region.getBoundingClientRect()
    // Only a nearer scroll owner can absorb a descendant's overflow. A higher
    // scroll range cannot reveal content already cut by an intervening hidden box.
    for (const axis of axisNames) outsideClip(region, rect, 'semantic-region', axis)
  }

  // A scroll pane absorbs its descendants' normal scroll overflow, but the
  // pane itself can still be cut by a higher non-scrollable clipping owner.
  for (const owner of scrollOwnerElements) {
    const rect = owner.getBoundingClientRect()
    for (const axis of axisNames) outsideClip(owner, rect, 'scroll-owner', axis)
  }

  if (documentScroller && axisNames.some(documentCanScroll)) {
    const axes = axisNames.filter(documentCanScroll)
    scrollOwners.push({
      path: '$viewport',
      tag: 'viewport',
      axes,
      client: { width: documentScroller.clientWidth, height: documentScroller.clientHeight },
      scroll: { width: documentScroller.scrollWidth, height: documentScroller.scrollHeight },
      maxScroll: {
        x: Math.max(0, documentScroller.scrollWidth - documentScroller.clientWidth),
        y: Math.max(0, documentScroller.scrollHeight - documentScroller.clientHeight),
      },
    })
  }

  return {
    viewport: {
      width: view?.innerWidth ?? documentElement.clientWidth,
      height: view?.innerHeight ?? documentElement.clientHeight,
    },
    extent: { width: Math.ceil(extentWidth), height: Math.ceil(extentHeight) },
    clippedRegions: clips,
    scrollOwners,
  }
}
