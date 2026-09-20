export const HBAR_APP_UI_SIZES = ['s', 'm', 'l'] as const

export type HbarAppUiSize = (typeof HBAR_APP_UI_SIZES)[number]

export interface HbarAppUiAppearance {
  readonly controlSize: HbarAppUiSize
  readonly textSize: HbarAppUiSize
  readonly cornerSize: HbarAppUiSize
}

export const HBAR_APP_UI_APPEARANCE_KEYS = Object.freeze({
  controlSize: 'appearance.controlSize',
  textSize: 'appearance.textSize',
  cornerSize: 'appearance.cornerSize',
} as const)

export const DEFAULT_HBAR_APP_UI_APPEARANCE: HbarAppUiAppearance = Object.freeze({
  controlSize: 'm',
  textSize: 'm',
  cornerSize: 'm',
})

export interface HbarAppUiAppearanceRoot {
  readonly dataset: {
    hbarAppUiControlSize?: string
    hbarAppUiTextSize?: string
    hbarAppUiCornerSize?: string
  }
}

export function readHbarAppUiSize(value: unknown): HbarAppUiSize | null {
  return value === 's' || value === 'm' || value === 'l' ? value : null
}

export function resolveHbarAppUiAppearance(values: Readonly<Record<string, unknown>>): HbarAppUiAppearance {
  return {
    controlSize:
      readHbarAppUiSize(values[HBAR_APP_UI_APPEARANCE_KEYS.controlSize]) ?? DEFAULT_HBAR_APP_UI_APPEARANCE.controlSize,
    textSize:
      readHbarAppUiSize(values[HBAR_APP_UI_APPEARANCE_KEYS.textSize]) ?? DEFAULT_HBAR_APP_UI_APPEARANCE.textSize,
    cornerSize:
      readHbarAppUiSize(values[HBAR_APP_UI_APPEARANCE_KEYS.cornerSize]) ?? DEFAULT_HBAR_APP_UI_APPEARANCE.cornerSize,
  }
}

export function applyHbarAppUiAppearance(root: HbarAppUiAppearanceRoot, appearance: HbarAppUiAppearance): void {
  root.dataset.hbarAppUiControlSize = appearance.controlSize
  root.dataset.hbarAppUiTextSize = appearance.textSize
  root.dataset.hbarAppUiCornerSize = appearance.cornerSize
}
