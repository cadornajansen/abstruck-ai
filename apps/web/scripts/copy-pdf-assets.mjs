import { cp, mkdir } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const packageRoot = path.dirname(require.resolve("pdfjs-dist/package.json"))
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const destination = path.join(webRoot, "public", "pdfjs")

await mkdir(destination, { recursive: true })
await cp(
  path.join(packageRoot, "build", "pdf.worker.min.mjs"),
  path.join(destination, "pdf.worker.min.mjs")
)
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(
    path.join(packageRoot, directory),
    path.join(destination, directory),
    { recursive: true }
  )
}
console.log("PDF.js worker, fonts and character maps are ready.")
