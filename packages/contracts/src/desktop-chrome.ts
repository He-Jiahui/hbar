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
export const desktopChromeCopySchema = z.strictObject({
  windowTitle: desktopChromeText,
  trayTooltip: desktopChromeText,
  trayOpen: desktopChromeText,
  trayExit: desktopChromeText,
})
export type DesktopChromeCopy = z.infer<typeof desktopChromeCopySchema>
