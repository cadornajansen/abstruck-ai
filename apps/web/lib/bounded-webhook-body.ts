export async function readWebhookBody(
  body: ReadableStream<Uint8Array> | null,
  error: (code: string, status: number) => Error
): Promise<Buffer> {
  if (!body) throw error("request_body_missing", 400)
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  const deadline = Date.now() + 10000
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const part = await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(error("request_timeout", 408)),
            Math.max(1, deadline - Date.now())
          )
        }),
      ]).finally(() => clearTimeout(timer))
      if (part.done) break
      size += part.value.byteLength
      if (size > 131072) throw error("request_body_too_large", 413)
      chunks.push(part.value)
    }
    return Buffer.concat(chunks)
  } finally {
    await reader.cancel().catch(() => {})
  }
}
