import { availableParallelism, cpus, freemem, platform, release, tmpdir, totalmem } from 'node:os'
import { join } from 'node:path'
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { NativeWorkspaceQuery } from '@hbar/local-tools/native-query'

interface Observation {
  cpuMs?: number
  maxRssBytes?: number
  bytesRead?: number
}

interface Sample extends Required<Pick<Observation, 'cpuMs'>> {
  wallMs: number
  maxRssBytes: number
  bytesRead: number
}

const samples = Math.max(3, Number(process.env.HBAR_WORKSPACE_QUERY_BENCH_SAMPLES ?? 10))
const largeFileCount = Math.max(10_000, Number(process.env.HBAR_WORKSPACE_QUERY_BENCH_FILES ?? 10_000))
const root = await mkdtemp(join(tmpdir(), 'hbar-workspace-query-bench-'))
const artifact = join(process.cwd(), 'artifacts/workspace-query-benchmark.json')

const percentile = (values: number[], fraction: number) => {
  const ordered = [...values].sort((left, right) => left - right)
  return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)] ?? 0
}

const summary = (values: Sample[]) => ({
  samples: values.length,
  wallMs: {
    p50: percentile(
      values.map((value) => value.wallMs),
      0.5,
    ),
    p95: percentile(
      values.map((value) => value.wallMs),
      0.95,
    ),
    max: Math.max(...values.map((value) => value.wallMs)),
  },
  cpuMs: {
    p50: percentile(
      values.map((value) => value.cpuMs),
      0.5,
    ),
    p95: percentile(
      values.map((value) => value.cpuMs),
      0.95,
    ),
    max: Math.max(...values.map((value) => value.cpuMs)),
  },
  maxRssBytes: Math.max(...values.map((value) => value.maxRssBytes)),
  bytesRead: {
    p50: percentile(
      values.map((value) => value.bytesRead),
      0.5,
    ),
    max: Math.max(...values.map((value) => value.bytesRead)),
  },
})

async function measure(operation: () => Promise<Observation>): Promise<Sample> {
  const cpuStart = process.cpuUsage()
  const wallStart = performance.now()
  const observation = await operation()
  const wallMs = performance.now() - wallStart
  const cpu = process.cpuUsage(cpuStart)
  return {
    wallMs,
    cpuMs: observation.cpuMs ?? (cpu.user + cpu.system) / 1_000,
    maxRssBytes: observation.maxRssBytes ?? process.memoryUsage.rss(),
    bytesRead: observation.bytesRead ?? 0,
  }
}

async function collect(operation: () => Promise<Observation>): Promise<Sample[]> {
  await operation()
  await operation()
  const result: Sample[] = []
  for (let index = 0; index < samples; index += 1) result.push(await measure(operation))
  return result
}

async function runChild(argv: string[]): Promise<Observation> {
  const child = Bun.spawn(argv, { stdout: 'ignore', stderr: 'pipe', stdin: 'ignore', windowsHide: true })
  const code = await child.exited
  if (code !== 0) throw new Error(`Benchmark process failed (${code}): ${await new Response(child.stderr).text()}`)
  const usage = child.resourceUsage()
  return {
    ...(usage ? { cpuMs: Number(usage.cpuTime.total) / 1_000, maxRssBytes: usage.maxRSS } : {}),
  }
}

async function createCorpus(directory: string, count: number): Promise<void> {
  await mkdir(directory, { recursive: true })
  for (let start = 0; start < count; start += 100) {
    await Promise.all(
      Array.from({ length: Math.min(100, count - start) }, (_, offset) => {
        const index = start + offset
        const content = index % 100 === 0 ? `file ${index} contains needle\n` : `file ${index} ordinary text\n`
        return writeFile(join(directory, `${index.toString().padStart(5, '0')}.txt`), content, 'utf8')
      }),
    )
  }
}

function nativeOperation(query: NativeWorkspaceQuery, directory: string) {
  return async (): Promise<Observation> => {
    const result = await query.search(
      {
        workspace: directory,
        path: '.',
        include: ['**/*.txt'],
        exclude: [],
        includeHidden: false,
        blocked: [],
        limit: 1_000,
        pattern: 'needle',
        literal: true,
        caseMode: 'sensitive',
        beforeContext: 0,
        afterContext: 0,
      },
      crypto.randomUUID(),
    )
    return { bytesRead: result.cache.bytesRead }
  }
}

async function corpusBenchmark(directory: string) {
  const direct = () =>
    runChild(['rg', '--no-heading', '--color', 'never', '--glob', '*.txt', '--', 'needle', directory])
  const powershellDirectory = directory.replaceAll("'", "''")
  const powershell = () =>
    runChild([
      'powershell.exe',
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `& rg --no-heading --color never --glob '*.txt' -- needle '${powershellDirectory}'`,
    ])
  const noCache = new NativeWorkspaceQuery(0)
  const cached = new NativeWorkspaceQuery(64 * 1024 * 1024)
  const noCacheOperation = nativeOperation(noCache, directory)
  const cachedOperation = nativeOperation(cached, directory)
  const powershellRg = summary(await collect(powershell))
  const directRg = summary(await collect(direct))
  const embeddedNoCache = summary(await collect(noCacheOperation))
  const cold = await measure(cachedOperation)
  const warm = await collect(cachedOperation)
  const target = join(directory, '00000.txt')
  const before = await stat(target)
  await writeFile(target, 'file 0 contains NEEDLE\n', 'utf8')
  await utimes(target, before.atime, before.mtime)
  const modified = await measure(cachedOperation)
  return {
    powershellRg,
    directRg,
    embeddedNoCache,
    embeddedCold: cold,
    embeddedWarm: summary(warm),
    embeddedAfterSameSizeEdit: modified,
  }
}

try {
  const small = join(root, 'small')
  const large = join(root, 'large')
  await createCorpus(small, 100)
  await createCorpus(large, largeFileCount)
  const output = {
    generatedAt: new Date().toISOString(),
    runtime: { bun: Bun.version, platform: platform(), release: release() },
    machine: {
      cpu: cpus()[0]?.model ?? 'unknown',
      logicalCpus: cpus().length,
      availableParallelism: availableParallelism(),
      totalMemoryBytes: totalmem(),
      freeMemoryBytes: freemem(),
    },
    configuration: {
      samples,
      smallFileCount: 100,
      largeFileCount,
      nativeCacheBytes: 64 * 1024 * 1024,
      childCpuScope: 'top-level spawned process',
    },
    small: await corpusBenchmark(small),
    large: await corpusBenchmark(large),
  }
  await mkdir(join(process.cwd(), 'artifacts'), { recursive: true })
  await writeFile(artifact, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ artifact, small: output.small, large: output.large }, null, 2))
} finally {
  await rm(root, { recursive: true, force: true })
}
