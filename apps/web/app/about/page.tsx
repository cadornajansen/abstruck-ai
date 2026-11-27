import { PublicPage, PublicSection } from "@/components/public-page"
import { StartButton } from "@/components/marketing/landing"
import { marketingMetadata } from "@/components/marketing/metadata"

export const metadata = marketingMetadata(
  "About",
  "Abstruck is a study workspace built around your own course materials, with Philippine students as its initial audience.",
  "/about"
)
export default function AboutPage() {
  return (
    <PublicPage
      active="about"
      title="A little space for what you’re learning."
      description="Abstruck brings course materials, questions, practice and review into one study workspace. Our initial focus is students in the Philippines."
    >
      <div className="flex max-w-3xl flex-col gap-10">
        <PublicSection title="Start with the material in front of you">
          <p>
            A reading for tomorrow. Slides from class. A recording you want to
            understand. Abstruck is built around the materials students already
            use, with spaces and folders to keep them together.
          </p>
        </PublicSection>
        <PublicSection title="Keep understanding connected to practice">
          <p>
            Ask questions with source citations, keep your own notes, then work
            through flashcards, quizzes or practice exams. Saved study work
            gives you somewhere to return for review.
          </p>
        </PublicSection>
        <PublicSection title="Where we are today">
          <p>
            You can start with Free. Pro includes more room for course readings,
            recorded lectures and study questions, with a monthly allowance you
            can see in your workspace.
          </p>
        </PublicSection>
        <div>
          <StartButton />
        </div>
      </div>
    </PublicPage>
  )
}
