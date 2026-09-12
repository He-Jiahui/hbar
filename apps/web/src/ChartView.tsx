import { z } from 'zod'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import GlassSurface from './react-bits/GlassSurface'
const schema = z.object({
  type: z.enum(['bar', 'line', 'area']),
  xKey: z.string().max(100),
  series: z
    .array(
      z.object({
        key: z.string().max(100),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
      }),
    )
    .min(1)
    .max(8),
  data: z.array(z.record(z.string(), z.union([z.string().max(200), z.number().finite()]))).max(1000),
})
const colors = ['var(--hbar-chart-1)', 'var(--hbar-chart-2)', 'var(--hbar-chart-3)', 'var(--hbar-chart-4)']
export default function ChartView({ source }: { source: string }) {
  try {
    const spec = schema.parse(JSON.parse(source))
    const Chart = spec.type === 'bar' ? BarChart : spec.type === 'line' ? LineChart : AreaChart
    return (
      <div className="chart-view rb-render-surface">
        <GlassSurface className="render-surface-glass" width="100%" height="100%" aria-hidden="true" />
        <ResponsiveContainer width="100%" height={240}>
          <Chart data={spec.data} margin={{ top: 16, right: 16, bottom: 8, left: -14 }}>
            <CartesianGrid stroke="var(--hbar-chart-grid)" vertical={false} />
            <XAxis dataKey={spec.xKey} tick={{ fontSize: 'var(--hbar-font-size-code)', fill: 'var(--hbar-t3)' }} />
            <YAxis tick={{ fontSize: 'var(--hbar-font-size-code)', fill: 'var(--hbar-t3)' }} />
            <Tooltip contentStyle={{ background: 'var(--hbar-s1)', border: '1px solid var(--hbar-bd2)', color: 'var(--hbar-t1)', fontFamily: 'var(--dsh-font-family)', fontSize: 'var(--hbar-font-size-code)' }} />
            <Legend />
            {spec.series.map((series, index) =>
              spec.type === 'bar' ? (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  fill={series.color ?? colors[index % colors.length] ?? 'var(--hbar-chart-1)'}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              ) : spec.type === 'line' ? (
                <Line
                  key={series.key}
                  dataKey={series.key}
                  stroke={series.color ?? colors[index % colors.length] ?? 'var(--hbar-chart-1)'}
                  isAnimationActive={false}
                />
              ) : (
                <Area
                  key={series.key}
                  dataKey={series.key}
                  stroke={series.color ?? colors[index % colors.length] ?? 'var(--hbar-chart-1)'}
                  fill={series.color ?? colors[index % colors.length] ?? 'var(--hbar-chart-1)'}
                  fillOpacity={0.15}
                  isAnimationActive={false}
                />
              ),
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
    )
  } catch {
    return <pre className="render-error">{source}</pre>
  }
}
