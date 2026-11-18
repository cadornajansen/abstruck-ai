export function youtubeSource(input: string): { videoId: string; url: string } | null {
  let url: URL
  try { url = new URL(input) } catch { return null }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.searchParams.has("list")) return null
  let id: string | null = null
  if (["youtu.be", "www.youtu.be"].includes(url.hostname)) id = url.pathname.replace(/\/$/, "").slice(1)
  else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
    if (url.pathname === "/watch" && url.searchParams.getAll("v").length === 1) id = url.searchParams.get("v")
    else id = url.pathname.match(/^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id)
    ? { videoId: id, url: `https://www.youtube.com/watch?v=${id}` } : null
}
