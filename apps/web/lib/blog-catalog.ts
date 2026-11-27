export interface BlogArticle {
  slug: string
  title: string
  seoTitle?: string
  description: string
  author: "Abstruck Editorial" | "Jansen"
  publishedAt: string
  updatedAt?: string
  image?: string
}

export const publishedArticles: readonly BlogArticle[] = [
  {
    slug: "echelon-philippines-2026-building-abstruck",
    title: "Before Echelon Philippines 2026: What I Think Abstruck Is Becoming",
    seoTitle:
      "Before Echelon Philippines 2026: Building Abstruck as a Student Founder",
    description:
      "The night before Echelon Philippines 2026, Abstruck founder Jansen reflects on building EdTech from the Philippines, what Abstruck is becoming, and the questions he is bringing with him.",
    author: "Jansen",
    publishedAt: "2026-08-24",
    image: "/blog/echelon-philippines-2026-building-abstruck.jpg",
  },
  {
    slug: "active-recall-study-method",
    title: "Active Recall Study Method: How to Actually Use It",
    description:
      "Learn how to use active recall with lecture notes, flashcards, practice questions, and spaced review—without turning studying into an endless card-making task.",
    author: "Abstruck Editorial",
    publishedAt: "2026-08-23",
  },
  {
    slug: "best-ai-study-tools-for-college-students",
    title: "Best AI Study Tools for College Students in 2026",
    description:
      "A practical guide to the best AI study tools for college students in 2026, organized by use case: source-grounded research, lectures, flashcards, practice, and free study workflows.",
    author: "Abstruck Editorial",
    publishedAt: "2026-08-23",
    updatedAt: "2026-11-27",
  },
  {
    slug: "how-to-transcribe-a-lecture-to-text",
    title: "How to Transcribe a Lecture to Text and Turn It Into Study Notes",
    description:
      "A practical student workflow for transcribing a lecture recording, checking the transcript, using timestamps, and turning the useful parts into study notes and review material.",
    author: "Abstruck Editorial",
    publishedAt: "2026-08-23",
    updatedAt: "2026-11-27",
  },
  {
    slug: "notebooklm-alternatives-for-students",
    title: "NotebookLM Alternatives for Students: The Best Options in 2026",
    description:
      "Compare NotebookLM alternatives for students by source grounding, lecture support, notes, flashcards, study workflow, free-tier usefulness, and pricing.",
    author: "Abstruck Editorial",
    publishedAt: "2026-08-23",
    updatedAt: "2026-11-27",
  },
  {
    slug: "turn-notes-into-flashcards-with-ai",
    title: "How to Turn Notes Into Flashcards With AI",
    description:
      "Learn how to turn class notes into useful AI flashcards: choose concepts, write better questions, edit weak cards, and review them with active recall.",
    author: "Abstruck Editorial",
    publishedAt: "2026-08-23",
  },
  {
    slug: "what-is-an-ai-study-tool-for-students",
    title: "What Is an AI Study Tool for Students? A Practical Guide",
    seoTitle: "What Is an AI Study Tool for Students? A Practical Guide (2026)",
    description:
      "Learn what an AI study tool for students does, how it turns lectures and PDFs into summaries, flashcards, notes, and study help, and what to look for.",
    author: "Abstruck Editorial",
    publishedAt: "2026-08-23",
    image: "/blog/what-is-an-ai-study-tool-for-students.jpg",
  },
  {
    slug: "source-aware-workspaces-and-document-study",
    title: "Study Videos, PDFs, and PowerPoints in One Workspace",
    description:
      "Study videos, PDFs, and PowerPoint slides in one workspace. Check answers against document pages and recording timestamps.",
    author: "Abstruck Editorial",
    publishedAt: "2026-08-22",
    updatedAt: "2026-11-27",
  },
  {
    slug: "is-the-philippines-behind-in-edtech",
    title: "Is the Philippines behind in Edtech?",
    seoTitle:
      "Is the Philippines behind in EdTech? What Technology Means for Learning",
    description:
      "The Philippines is more connected, more digital, and more AI-ready than ever. But getting technology into education is not the same as getting better education.",
    author: "Jansen",
    publishedAt: "2026-08-21",
    updatedAt: "2026-11-27",
    image: "/blog/is-the-philippines-behind-in-edtech.jpg",
  },
  {
    slug: "built-in-the-philippines-built-to-compete-anywhere",
    title: "Built in the Philippines. Built to Compete Anywhere.",
    seoTitle: "Philippine EdTech Startup Abstruck: Built to Compete Anywhere",
    description:
      "Why Abstruck is building a Filipino EdTech platform from the Philippines with global ambitions — and why starting here was never a limitation.",
    author: "Jansen",
    publishedAt: "2026-08-18",
    image: "/blog/built-in-the-philippines-built-to-compete-anywhere.jpg",
  },
  {
    slug: "what-ai-study-tools-get-wrong",
    title: "What AI Study Tools Get Wrong About Learning",
    description:
      "Most AI tools optimize for generating more material instead of building durable understanding. Here is why information generation alone fails learners.",
    author: "Abstruck Editorial",
    publishedAt: "2026-08-18",
    image: "/blog/what-ai-study-tools-get-wrong.jpg",
  },
  {
    slug: "information-vs-knowledge",
    title: "Information Is Everywhere. Knowledge Shouldn't Be.",
    description:
      "Raw information has never been cheaper, but usable knowledge remains scarce. Understanding the difference changes how we study and build software.",
    author: "Abstruck Editorial",
    publishedAt: "2026-08-17",
    image: "/blog/information-vs-knowledge.jpg",
  },
  {
    slug: "what-an-ai-learning-workspace-should-do",
    title: "What an AI-Native Learning Workspace Should Actually Do",
    description:
      "A learning workspace shouldn't just be a transcription wrapper or chatbot. Here are the core pillars of an AI-native learning environment.",
    author: "Abstruck Editorial",
    publishedAt: "2026-08-16",
    image: "/blog/what-an-ai-learning-workspace-should-do.jpg",
  },
]

export function findPublishedArticle(slug: string): BlogArticle | undefined {
  return publishedArticles.find((article) => article.slug === slug)
}
