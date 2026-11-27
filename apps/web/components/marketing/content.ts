export interface MarketingArticle {
  slug: string
  title: string
  description: string
  publishedAt: string | null
  updatedAt?: string
  author?: string
  image?: string
  markdown: string
}
export const articleDraft: MarketingArticle = {
  slug: "from-material-to-review",
  title: "A source, a question, a review",
  description:
    "A short walkthrough of the study flow Abstruck is being built around.",
  publishedAt: null,
  markdown: `## Begin with one material

Choose a reading, a slide deck or a recording you are working through. Keep the original available so you can check the details.

## Ask one focused question

Name the concept you want to understand. In Abstruck’s development workspace, material-based answers include citations you can follow back to the source.

## Make a note and try recalling it

Write the idea in your own words. Use a flashcard or a practice question to see what you can explain, then return to the material for anything you missed.`,
}
export interface ChangelogEntry {
  date: string
  title: string
  detail: string
}
export const changelogEntries: ChangelogEntry[] = []
export const roadmapItems = [
  {
    title: "A reliable first study session",
    detail:
      "Validate material imports, source citations, saved work and return visits across the development workspace.",
    status: "In validation",
  },
  {
    title: "Clear usage and renewal",
    detail:
      "Validate plan allowances, payment recovery and the customer-initiated QR Ph renewal journey.",
    status: "In validation",
  },
  {
    title: "Public release readiness",
    detail:
      "Complete operational checks and review public policies before a public launch.",
    status: "Pending validation",
  },
] as const
