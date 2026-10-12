'use client'

import * as React from 'react'

/** Native media semantics with host-owned source/alt and explicit browser loading behavior. */
export interface LumenImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  src: string
  alt: string
}

export const LumenImage = React.forwardRef<HTMLImageElement, LumenImageProps>(function LumenImage(
  { loading = 'lazy', decoding = 'async', ...props },
  ref,
) {
  return <img {...props} ref={ref} loading={loading} decoding={decoding} />
})
