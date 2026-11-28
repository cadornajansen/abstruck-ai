import assert from "node:assert/strict"
import { get } from "node:http"
import { argv } from "node:process"
import { Buffer } from "node:buffer"

const marketing = "https://www.abstruck.com"
const workspace = "https://app.abstruck.com"
const localOrigin = argv[2]
const expectedBlogCount = 13
const requiredPublicPaths = [
  "/",
  "/about",
  "/blog",
  "/contact",
  "/features",
  "/pricing",
  "/privacy",
  "/terms",
]

function load(origin, path, userAgent = "Abstruck SEO smoke check") {
  const signal = AbortSignal.timeout(30_000)
  if (localOrigin) {
    // The low-level HTTP client allows the production Host header on localhost.
    return new Promise((resolve, reject) => {
      get(
        `${localOrigin}${path}`,
        {
          headers: { host: new URL(origin).host, "user-agent": userAgent },
          signal,
        },
        (response) => {
          const chunks = []
          response.on("data", (chunk) => chunks.push(chunk))
          response.on("error", reject)
          response.on("end", () => {
            resolve(
              new Response(chunks.length ? Buffer.concat(chunks) : null, {
                status: response.statusCode,
                headers: response.headers,
              })
            )
          })
        }
      ).on("error", reject)
    })
  }
  return fetch(`${origin}${path}`, {
    redirect: "manual",
    headers: { "user-agent": userAgent },
    signal,
  })
}

function metaTags(html, name) {
  return [
    ...html.matchAll(
      new RegExp(`<meta[^>]+name="${name}"[^>]+content="([^"]+)"`, "gi")
    ),
  ].map((match) => match[1])
}

function canonicalLinks(html) {
  return [
    ...html.matchAll(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/gi),
  ].map((match) => match[1])
}

function structuredTypes(html) {
  const graphs = [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
    ),
  ]
  return graphs.flatMap((match) =>
    JSON.parse(match[1])["@graph"].map((node) => node["@type"])
  )
}

async function assertRedirect(origin, path, target, status = 308) {
  const response = await load(origin, path)
  assert.equal(response.status, status, path)
  assert.equal(
    new URL(response.headers.get("location"), origin).href,
    target,
    path
  )
}

const sitemap = await load(marketing, "/sitemap.xml")
assert.equal(sitemap.status, 200)
assert.match(sitemap.headers.get("content-type"), /xml/)
const xml = await sitemap.text()
assert.match(xml, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/)
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
const uniqueUrls = new Set(urls)
assert.equal(urls.length, requiredPublicPaths.length + expectedBlogCount)
assert.equal(uniqueUrls.size, urls.length, "duplicate sitemap URLs")
for (const path of requiredPublicPaths)
  assert.ok(uniqueUrls.has(marketing + path), path)

const previewImages = new Set()
const articlePaths = []
for (const url of urls) {
  const { origin, pathname } = new URL(url)
  assert.equal(origin, marketing)
  const isArticle = pathname.startsWith("/blog/")
  assert.ok(isArticle || requiredPublicPaths.includes(pathname), pathname)
  if (isArticle) articlePaths.push(pathname)
  const response = await load(marketing, pathname, "Googlebot")
  assert.equal(response.status, 200, pathname)
  assert.doesNotMatch(
    response.headers.get("x-robots-tag") ?? "",
    /noindex/i,
    pathname
  )
  const html = await response.text()
  assert.deepEqual(canonicalLinks(html), [url], pathname)
  assert.ok(metaTags(html, "description")[0]?.trim(), pathname)
  assert.doesNotMatch(
    metaTags(html, "robots").join(" "),
    /noindex|nofollow/i,
    pathname
  )
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, pathname)
  const image = /<meta property="og:image" content="([^"]+)"/i.exec(html)?.[1]
  assert.ok(image?.startsWith(marketing + "/"), pathname)
  previewImages.add(image)
  if (pathname === "/") {
    assert.deepEqual(structuredTypes(html), ["Organization", "WebSite"])
    assert.match(html, /How do I turn my notes into flashcards/)
    assert.match(
      html,
      /Add your notes to a study space and generate flashcards/
    )
  }
  if (isArticle) {
    assert.deepEqual(
      structuredTypes(html),
      ["BlogPosting", "BreadcrumbList"],
      pathname
    )
    const markdown = await load(marketing, pathname + ".md")
    assert.equal(markdown.status, 200, pathname)
    assert.match(markdown.headers.get("content-type"), /^text\/markdown/)
    assert.equal(markdown.headers.get("link"), `<${url}>; rel="canonical"`)
    assert.match(markdown.headers.get("x-robots-tag"), /noindex/i)
    assert.match(await markdown.text(), /^# /)
  }
}
assert.equal(articlePaths.length, expectedBlogCount)
for (const image of previewImages) {
  const response = await load(marketing, new URL(image).pathname)
  assert.equal(response.status, 200, image)
  assert.match(response.headers.get("content-type"), /^image\//, image)
}

const robots = await load(marketing, "/robots.txt")
assert.equal(robots.status, 200)
const rules = await robots.text()
assert.match(rules, /User-agent: \*\r?\nAllow: \//)
assert.ok(rules.includes(`Sitemap: ${marketing}/sitemap.xml`))
assert.match(rules, /User-agent: GPTBot/)
assert.match(rules, /User-agent: Google-Extended/)
assert.doesNotMatch(rules, /Disallow: \/signup/)
const appRobots = await load(workspace, "/robots.txt")
assert.equal(appRobots.status, 200)
assert.doesNotMatch(await appRobots.text(), /Sitemap:/)

for (const userAgent of ["OAI-SearchBot", "PerplexityBot", "bingbot"]) {
  assert.equal((await load(marketing, "/", userAgent)).status, 200)
}
const llms = await load(marketing, "/llms.txt")
assert.equal(llms.status, 200)
const llmsText = await llms.text()
for (const path of articlePaths)
  assert.ok(llmsText.includes(`(${marketing}${path})`), path)
assert.doesNotMatch(
  llmsText,
  /stripe-alternatives|mdx-rendering-test|app\.abstruck\.com|abstruck\.space/i
)

await assertRedirect(marketing, "/landing", marketing + "/")
await assertRedirect(marketing, "/help", marketing + "/contact")
await assertRedirect(
  marketing,
  "/signup?next=%2Flibrary",
  workspace + "/sign-up?next=%2Flibrary"
)
await assertRedirect(workspace, "/features", marketing + "/features")
await assertRedirect(workspace, "/sitemap.xml", marketing + "/sitemap.xml")
if (!localOrigin) {
  const article = articlePaths[0] + "?from=archive"
  for (const origin of [
    "https://abstruck.com",
    "https://abstruck.space",
    "https://www.abstruck.space",
  ]) {
    await assertRedirect(origin, article, marketing + article)
  }
  const signIn = "/sign-in?next=%2Flibrary"
  await assertRedirect("https://app.abstruck.space", signIn, workspace + signIn)
}

for (const path of [
  "/blog/stripe-alternatives-for-saas",
  "/blog/mdx-rendering-test",
  "/blog/unknown-post",
  "/blog/unknown-post.md",
  "/partners",
  "/marketing-preview",
]) {
  assert.equal((await load(marketing, path)).status, 404, path)
}
for (const path of ["/changelog", "/roadmap"]) {
  const response = await load(marketing, path)
  assert.equal(response.status, 200, path)
  assert.match(
    metaTags(await response.text(), "robots").join(" "),
    /noindex/i,
    path
  )
}
for (const path of ["/sign-in", "/sign-up", "/verify-email", "/share"]) {
  const response = await load(workspace, path)
  assert.equal(response.status, 200, path)
  assert.match(
    `${response.headers.get("x-robots-tag") ?? ""} ${metaTags(await response.text(), "robots").join(" ")}`,
    /noindex/i,
    path
  )
}
await assertRedirect(workspace, "/", workspace + "/sign-in", 307)

console.log(
  `Verified ${urls.length} public sitemap URLs, ${articlePaths.length} Markdown aliases, redirects, metadata, images, crawlers and app noindex.`
)
