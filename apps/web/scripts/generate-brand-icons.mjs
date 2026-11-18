import { createHash } from "node:crypto"
import { Buffer } from "node:buffer"
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const webRequire = createRequire(resolve(root, "apps/web/package.json"))
// Use the renderer already supplied by Next; no separate branding dependency.
const sharp = createRequire(webRequire.resolve("next/package.json"))("sharp")
const sourcePath = resolve(root, "docs/assets/abstruck-logo.svg")
const source = await readFile(sourcePath)
const revision = createHash("sha256").update(source).digest("hex").slice(0, 12)
const app = resolve(root, "apps/web/app")
const publicIcons = resolve(root, "apps/web/public/icons")
await mkdir(publicIcons, { recursive: true })
await copyFile(sourcePath, resolve(root, "apps/web/public/abstruck-logo.svg"))

async function iconTile(size, markSize) {
  const mark = await sharp(source)
    .resize(markSize, markSize, { fit: "contain" })
    .png()
    .toBuffer()
  return sharp({
    create: { width: size, height: size, channels: 4, background: "#ffffff" },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

const faviconSizes = [16, 32, 48]
const faviconImages = []
for (const size of faviconSizes) {
  faviconImages.push(await iconTile(size, size - size / 8))
}
// ICO directory entries point to PNG frames, supported by modern browsers/OSes.
const directory = Buffer.alloc(6 + faviconSizes.length * 16)
directory.writeUInt16LE(1, 2)
directory.writeUInt16LE(faviconSizes.length, 4)
let offset = directory.length
faviconImages.forEach((png, index) => {
  const entry = 6 + index * 16
  directory[entry] = faviconSizes[index]
  directory[entry + 1] = faviconSizes[index]
  directory.writeUInt16LE(1, entry + 4)
  directory.writeUInt16LE(32, entry + 6)
  directory.writeUInt32LE(png.length, entry + 8)
  directory.writeUInt32LE(offset, entry + 12)
  offset += png.length
})
await writeFile(
  resolve(app, "favicon.ico"),
  Buffer.concat([directory, ...faviconImages])
)
await writeFile(resolve(app, "icon.png"), faviconImages[1])
await writeFile(resolve(app, "apple-icon.png"), await iconTile(180, 144))
await writeFile(resolve(publicIcons, "icon-192.png"), await iconTile(192, 162))
await writeFile(resolve(publicIcons, "icon-512.png"), await iconTile(512, 432))
// 56% square width keeps even the mark's corners inside the 80% safe circle.
await writeFile(
  resolve(publicIcons, "icon-maskable-512.png"),
  await iconTile(512, 286)
)

const brandPath = resolve(root, "apps/web/components/workspace/brand.tsx")
const previous = await readFile(brandPath, "utf8")
const next = previous.replace(
  /src="\/abstruck-logo\.svg(?:\?v=[a-f0-9]+)?"/,
  `src="/abstruck-logo.svg?v=${revision}"`
)
if (next === previous && !previous.includes(`?v=${revision}`)) {
  throw new Error("Brand source reference was not found; update it explicitly.")
}
if (next !== previous) await writeFile(brandPath, next)
console.log(`Generated canonical Abstruck icons (${revision}).`)
