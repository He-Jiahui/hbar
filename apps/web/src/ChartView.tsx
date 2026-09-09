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
const colors = ['#62b594', '#7399ed', '#d8ab66', '#d7778e']
export default function ChartView({ source }: { source: string }) {
  try {
    const spec = schema.parse(JSON.parse(source))
    const Chart = spec.type === 'bar' ? BarChart : spec.type === 'line' ? LineChart : AreaChart
    return (
      <div className="chart-view rb-render-surface">
        <GlassSurface className="render-surface-glass" width="100%" height="100%" aria-hidden="true" />
        <ResponsiveContainer width="100%" height={240}>
          <Chart data={spec.data} margin={{ top: 16, right: 16, bottom: 8, left: -14 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey={spec.xKey} tick={{ fontSize: 11, fill: '#989da8' }} />
            <YAxis tick={{ fontSize: 11, fill: '#989da8' }} />
            <Tooltip contentStyle={{ background: '#26282e', border: '1px solid #454852', color: '#ddd' }} />
            <Legend />
            {spec.series.map((series, index) =>
              spec.type === 'bar' ? (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  fill={series.color ?? colors[index % colors.length] ?? '#62b594'}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              ) : spec.type === 'line' ? (
                <Line
                  key={series.key}
                  dataKey={series.key}
                  stroke={series.color ?? colors[index % colors.length] ?? '#62b594'}
                  isAnimationActive={false}
                />
              ) : (
                <Area
                  key={series.key}
                  dataKey={series.key}
                  stroke={series.color ?? colors[index % colors.length] ?? '#62b594'}
                  fill={series.color ?? colors[index % colors.length] ?? '#62b594'}
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
