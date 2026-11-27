# Public search recovery

## Baseline on November 27, 2026

Search Console for `sc-domain:abstruck.space` reported 19 indexed URLs and 9 excluded URLs as of November 23. The submitted `https://www.abstruck.space/sitemap.xml` showed “Couldn’t fetch.” Production returned 404 for that sitemap and for `robots.txt`. Public marketing pages returned `noindex`.

Google’s 404 examples were `/blog/active-recall-study-method` and `/blog/source-aware-workspaces-and-document-study`. Its other examples included `/signup`, `/blog/information-vs-knowledge`, and the `.md` version of the Echelon article. The legacy checkout supplied all of these articles. The owner approved the 13 study and founder posts. The Stripe guide and the internal Markdown test are retired URLs.

## Public URL and content policy

- `https://www.abstruck.space` is canonical. The sitemap lists eight public pages and 13 published articles. The workspace and preview deployments carry noindex. The changelog and roadmap are available to users and stay outside the sitemap.
- The catalog in `apps/web/lib/blog-catalog.ts` holds public slugs, bylines and editorial dates. HTML, article Markdown, the sitemap, and `llms.txt` use that catalog. Source bodies are in `apps/web/content/blog`. The old checkout is the migration source. It is unnecessary at runtime.
- Markdown URLs serve a canonical HTTP link to the HTML version. The public robots file allows search crawlers and specifies the training opt-out for GPTBot, Google-Extended, ClaudeBot, and CCBot.
- Public structured data describes Abstruck and its website on the homepage. Articles expose the visible authors, dates, images and breadcrumb paths.

## Release verification

Run `node apps/web/scripts/check-public-indexing.mjs` against production. Pass a localhost origin as the first argument to use a production-mode local build with explicit Host headers. The check walks the sitemap, verifies the Googlebot HTML and canonical links, follows the 13 Markdown alternates, and checks legacy redirects, images, robots and workspace exclusion.

In [Search Console](https://search.google.com/search-console/index?resource_id=sc-domain%3Aabstruck.space), submit the restored sitemap and run live inspection for the homepage and both recovered study URLs. Record sitemap fetch status, Google-selected canonicals, indexed article count, impressions and clicks after about one and four weeks. Index and impression data can lag behind the HTTP changes. Use [Google’s recrawl guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl) for individual URL requests.
