'use client'

import * as React from 'react'

export type LumenFrameElement =
  | 'div'
  | 'a'
  | 'span'
  | 'pre'
  | 'iframe'
  | 'section'
  | 'article'
  | 'aside'
  | 'main'
  | 'header'
  | 'footer'
  | 'nav'
  | 'form'
  | 'fieldset'
  | 'label'
  | 'dialog'
  | 'i'
  | 'hr'

export type LumenFrameProps<Element extends LumenFrameElement = 'div'> = {
  as?: Element | undefined
} & Omit<React.ComponentPropsWithRef<Element>, 'as'>

/**
 * Semantic, flow-layout composition boundary for product-owned regions.
 *
 * Lumen owns the rendered element while the host supplies only layout classes,
 * content, state and actions. The component deliberately adds no implicit
 * dimensions so regions continue to participate in natural flex/document flow.
 */
export function LumenFrame<Element extends LumenFrameElement = 'div'>({ as, ...other }: LumenFrameProps<Element>) {
  const Component = (as ?? 'div') as React.ElementType
  return <Component {...other} />
}

export type LumenCollectionElement = 'ul' | 'ol' | 'dl' | 'table' | 'thead' | 'tbody' | 'tfoot'

export type LumenCollectionProps<Element extends LumenCollectionElement = 'ul'> = {
  as?: Element | undefined
} & Omit<React.ComponentPropsWithRef<Element>, 'as'>

/** Semantic collection container used by Lumen lists, descriptions and tables. */
export function LumenCollection<Element extends LumenCollectionElement = 'ul'>({
  as,
  ...other
}: LumenCollectionProps<Element>) {
  const Component = (as ?? 'ul') as React.ElementType
  return <Component {...other} />
}

export type LumenCollectionItemElement = 'li' | 'div' | 'dt' | 'dd' | 'tr' | 'th' | 'td'

export type LumenCollectionItemProps<Element extends LumenCollectionItemElement = 'li'> = {
  as?: Element | undefined
} & Omit<React.ComponentPropsWithRef<Element>, 'as'>

/** Semantic record within a Lumen collection. */
export function LumenCollectionItem<Element extends LumenCollectionItemElement = 'li'>({
  as,
  ...other
}: LumenCollectionItemProps<Element>) {
  const Component = (as ?? 'li') as React.ElementType
  return <Component {...other} />
}

export type LumenOptionProps = React.OptionHTMLAttributes<HTMLOptionElement>

/** Host-provided option content rendered through the Lumen form boundary. */
export function LumenOption(props: LumenOptionProps) {
  return <option {...props} />
}
