import type { EChartsOption } from 'echarts'

export interface EchartsReadingTheme {
  readonly foreground: string
  readonly muted: string
  readonly edge: string
  readonly info: string
  readonly fontFamily: string
  readonly fontSize: number
  readonly animation: boolean
  readonly duration: number
}

type XAxis = Exclude<NonNullable<EChartsOption['xAxis']>, readonly unknown[]>
type YAxis = Exclude<NonNullable<EChartsOption['yAxis']>, readonly unknown[]>

function isAxisArray<Axis>(axis: Axis | readonly Axis[]): axis is readonly Axis[] {
  return Array.isArray(axis)
}

/** Renderer defaults come from the owning Lumen surface; host options retain their data. */
export function readingEchartsOption(option: EChartsOption, theme: EchartsReadingTheme): EChartsOption {
  const axisTheme = {
    axisLine: { lineStyle: { color: theme.edge } },
    axisLabel: { color: theme.muted, fontFamily: theme.fontFamily, fontSize: theme.fontSize },
    splitLine: { lineStyle: { color: theme.edge } },
  }
  function themedAxis<Axis extends XAxis | YAxis>(axis: Axis): Axis {
    return { ...axisTheme, ...axis, axisLabel: { ...axisTheme.axisLabel, ...axis.axisLabel } }
  }
  const xAxis =
    option.xAxis === undefined
      ? undefined
      : isAxisArray<XAxis>(option.xAxis)
        ? option.xAxis.map((axis) => themedAxis(axis))
        : themedAxis(option.xAxis)
  const yAxis =
    option.yAxis === undefined
      ? undefined
      : isAxisArray<YAxis>(option.yAxis)
        ? option.yAxis.map((axis) => themedAxis(axis))
        : themedAxis(option.yAxis)
  return {
    grid: { left: 48, right: 12, top: 12, bottom: 32, containLabel: false },
    color: [theme.info],
    backgroundColor: 'transparent',
    ...option,
    textStyle: { color: theme.foreground, fontFamily: theme.fontFamily, fontSize: theme.fontSize, ...option.textStyle },
    animation: theme.animation && option.animation !== false,
    animationDuration: theme.duration,
    animationDurationUpdate: theme.duration,
    ...(xAxis === undefined ? {} : { xAxis }),
    ...(yAxis === undefined ? {} : { yAxis }),
  }
}
