import type { ClientExportPort } from '@hbar/app-runtime'

export function createBrowserClientExport(): ClientExportPort {
  return {
    async save(file, signal) {
      signal.throwIfAborted()
      const url = URL.createObjectURL(new Blob([file.content], { type: file.mime }))
      try {
        const link = document.createElement('a')
        link.href = url
        link.download = file.name
        link.hidden = true
        document.body.append(link)
        link.click()
        link.remove()
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        signal.throwIfAborted()
      } finally {
        URL.revokeObjectURL(url)
      }
    },
  }
}
