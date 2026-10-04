export interface DesktopConnection {
  url: string
  token: string
  instanceId: string
  pid: number
  supervisorPid?: number
}

/** Keep the live Host PID separate from the process launched by the desktop. */
export function desktopConnection(
  url: string,
  token: string,
  instanceId: string,
  supervised: boolean,
): DesktopConnection {
  return {
    url,
    token,
    pid: process.pid,
    instanceId,
    ...(supervised ? { supervisorPid: process.ppid } : {}),
  }
}
