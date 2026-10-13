export const noopNodeProcessLifecycle = {
  reserveProcess(operationId: string) {
    let released = false
    const controller = new AbortController()
    return {
      operationId,
      controller,
      signal: controller.signal,
      release() {
        released = true
      },
      activate() {
        if (released) throw new Error('reservation was released')
        released = true
        return () => undefined
      },
    }
  },
  assertProcessAvailable() {},
}
