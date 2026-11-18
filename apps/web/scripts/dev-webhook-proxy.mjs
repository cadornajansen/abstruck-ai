import { createServer } from "node:http"
import { Buffer } from "node:buffer"

// A temporary tunnel can reach only provider callbacks, never the rest of the app.
const paths = new Set(["/api/webhooks/paymongo", "/api/webhooks/assemblyai"])
const forwardedHeaders = [
  "content-type",
  "paymongo-signature",
  "x-assemblyai-webhook-secret",
]

createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response
      .writeHead(200, { "Content-Type": "text/plain" })
      .end("Abstruck development callbacks")
    return
  }
  if (
    request.method !== "POST" ||
    !paths.has(request.url) ||
    request.headers["content-encoding"]
  ) {
    response.writeHead(404).end()
    return
  }
  try {
    const chunks = []
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      if (size > 131072) {
        response.writeHead(413).end()
        return
      }
      chunks.push(chunk)
    }
    const headers = {}
    for (const name of forwardedHeaders) {
      if (typeof request.headers[name] === "string")
        headers[name] = request.headers[name]
    }
    const upstream = await fetch(`http://127.0.0.1:3000${request.url}`, {
      method: "POST",
      headers,
      body: Buffer.concat(chunks),
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    })
    response
      .writeHead(upstream.status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      })
      .end(await upstream.text())
  } catch {
    if (!response.headersSent) response.writeHead(502)
    response.end()
  }
}).listen(8788, "127.0.0.1", () =>
  console.log("Development callbacks listening on 127.0.0.1:8788")
)
