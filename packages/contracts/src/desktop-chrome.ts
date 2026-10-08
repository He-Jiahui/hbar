import { z } from 'zod'

/** Small platform labels are bounded in UTF-16 units, including Windows tray tooltips. */
const desktopChromeText = z
  .string()
  .min(1)
  .max(127)
  .refine(
    (value) =>
      value.length <= 127 &&
      value.trim().length > 0 &&
      ![...value].some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127),
    'Desktop chrome labels must be nonblank single-line text without control characters',
  )
export const desktopCloseConfirmationCopySchema = z.strictObject({
  title: desktopChromeText,
  message: z
    .string()
    .min(1)
    .max(4000)
    .refine(
      (value) =>
        value.length <= 4000 &&
        value.trim().length > 0 &&
        ![...value].some((character) => {
          const code = character.charCodeAt(0)
          return (code <= 31 && code !== 10 && code !== 13) || code === 127
        }),
      'Close confirmation must be bounded plain text without unsupported controls',
    ),
})
export type DesktopCloseConfirmationCopy = z.infer<typeof desktopCloseConfirmationCopySchema>

export const desktopChromeCopySchema = z.strictObject({
  windowTitle: desktopChromeText,
  trayTooltip: desktopChromeText,
  trayOpen: desktopChromeText,
  trayExit: desktopChromeText,
  closeConfirmation: desktopCloseConfirmationCopySchema,
})
export type DesktopChromeCopy = z.infer<typeof desktopChromeCopySchema>
