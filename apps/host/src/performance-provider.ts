import { arch, cpus, freemem, loadavg, platform, totalmem } from 'node:os'
import { readFile } from 'node:fs/promises'
import { available, unavailable, type PerformanceProvider, type ProviderReadings } from '@hbar/metrics'

interface RuntimeCounts {
  readonly activeRuns: number
  readonly queuedRuns: number | null
  readonly managedChildProcesses: number | null
}

function systemCpuTimes() {
  let idle = 0
  let total = 0
  for (const cpu of cpus()) {
    idle += cpu.times.idle
    total += Object.values(cpu.times).reduce((sum, value) => sum + value, 0)
  }
  return { idle, total }
}

async function linuxNumber(path: string, pattern: RegExp): Promise<number | null> {
  if (process.platform !== 'linux') return null
  const text = await readFile(path, 'utf8').catch(() => '')
  const match = pattern.exec(text)
  return match ? Number(match[1]) : null
}

async function linuxNetworkBytes(): Promise<{ receive: number; transmit: number } | null> {
  if (process.platform !== 'linux') return null
  const text = await readFile('/proc/net/dev', 'utf8').catch(() => '')
  let receive = 0
  let transmit = 0
  let found = false
  for (const line of text.split('\n').slice(2)) {
    const [, values] = line.split(':')
    if (!values) continue
    const columns = values.trim().split(/\s+/).map(Number)
    if (columns.length < 9 || columns.some((value) => !Number.isFinite(value))) continue
    receive += columns[0]!
    transmit += columns[8]!
    found = true
  }
  return found ? { receive, transmit } : null
}

export function createHostPerformanceProvider(runtime: () => Promise<RuntimeCounts>): PerformanceProvider {
  const startedAt = Date.now() - process.uptime() * 1_000
  const logicalProcessors = Math.max(1, cpus().length)
  let priorSystem = systemCpuTimes()
  let priorHost = process.cpuUsage()
  let priorDisk: { read: number; write: number } | null = null
  let priorNetwork: { receive: number; transmit: number } | null = null
  return {
    process: {
      pid: process.pid,
      platform: platform(),
      arch: arch(),
      startedAt: Math.max(0, Math.floor(startedAt)),
      uptimeMs: process.uptime() * 1_000,
      logicalProcessors,
    },
    async sample(elapsedMs): Promise<ProviderReadings> {
      const [counts, threads, readBytes, writeBytes, network] = await Promise.all([
        runtime(),
        linuxNumber('/proc/self/status', /^Threads:\s+(\d+)$/m),
        linuxNumber('/proc/self/io', /^read_bytes:\s+(\d+)$/m),
        linuxNumber('/proc/self/io', /^write_bytes:\s+(\d+)$/m),
        linuxNetworkBytes(),
      ])
      const memory = process.memoryUsage()
      const currentSystem = systemCpuTimes()
      const systemTotal = currentSystem.total - priorSystem.total
      const systemIdle = currentSystem.idle - priorSystem.idle
      priorSystem = currentSystem
      const currentHost = process.cpuUsage()
      const hostMicros = currentHost.user + currentHost.system - priorHost.user - priorHost.system
      priorHost = currentHost
      const disk = readBytes === null || writeBytes === null ? null : { read: readBytes, write: writeBytes }
      const diskReadRate = disk && priorDisk ? Math.max(0, disk.read - priorDisk.read) / (elapsedMs / 1_000) : null
      const diskWriteRate = disk && priorDisk ? Math.max(0, disk.write - priorDisk.write) / (elapsedMs / 1_000) : null
      priorDisk = disk
      const networkReceiveRate =
        network && priorNetwork ? Math.max(0, network.receive - priorNetwork.receive) / (elapsedMs / 1_000) : null
      const networkTransmitRate =
        network && priorNetwork ? Math.max(0, network.transmit - priorNetwork.transmit) / (elapsedMs / 1_000) : null
      priorNetwork = network
      const unsupported = process.platform === 'linux' ? 'COUNTER_WARMING_UP' : 'PLATFORM_UNSUPPORTED'
      const systemLoad = loadavg()[0] ?? 0
      return {
        systemCpuPercent:
          systemTotal > 0
            ? available(Math.max(0, Math.min(100, (1 - systemIdle / systemTotal) * 100)), 'percent', 'os.cpus')
            : unavailable('percent', 'COUNTER_WARMING_UP', 'os.cpus'),
        hostCpuPercent: available(
          Math.max(0, Math.min(100, (hostMicros / (elapsedMs * 1_000 * logicalProcessors)) * 100)),
          'percent',
          'process.cpuUsage',
        ),
        systemLoad1:
          process.platform === 'win32'
            ? unavailable('load', 'PLATFORM_UNSUPPORTED', 'os.loadavg')
            : available(systemLoad, 'load', 'os.loadavg'),
        systemMemoryUsedBytes: available(totalmem() - freemem(), 'bytes', 'os.memory'),
        systemMemoryTotalBytes: available(totalmem(), 'bytes', 'os.memory'),
        hostRssBytes: available(memory.rss, 'bytes', 'process.memoryUsage'),
        hostHeapUsedBytes: available(memory.heapUsed, 'bytes', 'process.memoryUsage'),
        hostThreadCount:
          threads === null
            ? unavailable('count', 'PLATFORM_UNSUPPORTED', 'procfs')
            : available(threads, 'count', 'procfs'),
        hostDiskReadBytesPerSecond:
          diskReadRate === null
            ? unavailable('bytes_per_second', unsupported, 'procfs')
            : available(diskReadRate, 'bytes_per_second', 'procfs'),
        hostDiskWriteBytesPerSecond:
          diskWriteRate === null
            ? unavailable('bytes_per_second', unsupported, 'procfs')
            : available(diskWriteRate, 'bytes_per_second', 'procfs'),
        systemNetworkReceiveBytesPerSecond:
          networkReceiveRate === null
            ? unavailable('bytes_per_second', unsupported, 'procfs')
            : available(networkReceiveRate, 'bytes_per_second', 'procfs'),
        systemNetworkTransmitBytesPerSecond:
          networkTransmitRate === null
            ? unavailable('bytes_per_second', unsupported, 'procfs')
            : available(networkTransmitRate, 'bytes_per_second', 'procfs'),
        activeRuns: available(counts.activeRuns, 'count', 'kernel'),
        queuedRuns:
          counts.queuedRuns === null
            ? unavailable('count', 'RUNTIME_RECOVERING', 'storage')
            : available(counts.queuedRuns, 'count', 'storage'),
        managedChildProcesses:
          counts.managedChildProcesses === null
            ? unavailable('count', 'PROCESS_REGISTRY_UNAVAILABLE', 'host')
            : available(counts.managedChildProcesses, 'count', 'host'),
      }
    },
  }
}
