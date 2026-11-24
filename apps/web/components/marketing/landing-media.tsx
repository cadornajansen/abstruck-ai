import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "iconoir-react"
import { Card, CardHeader, CardTitle } from "@workspace/ui/components/card"

const demoPath = "/landing/demo"

const previews = [
  ["Materials", "/features#materials", "organized-materials.webp"],
  ["Cited answers", "/features#understand", "cited-answer.webp"],
  ["Flashcards", "/features#practise", "flashcards.webp"],
] as const

const universities = [
  ["up", "University of the Philippines"],
  ["ust", "University of Santo Tomas"],
  ["dlsu", "De La Salle University"],
  ["mapua", "Mapúa University"],
  ["plm", "Pamantasan ng Lungsod ng Maynila"],
  ["ateneo", "Ateneo de Manila University"],
  ["rtu", "Rizal Technological University"],
  ["cvsu", "Cavite State University"],
  ["bulsu", "Bulacan State University"],
] as const

export function LandingDemoScreenshot() {
  return (
    <section
      aria-label="Abstruck product demo"
      className="mx-auto max-w-6xl px-5 sm:px-8"
    >
      <Image
        src={`${demoPath}/cs229-workspace.webp`}
        alt="CS229 lecture notes open to the LMS algorithm, with Abstruck’s Learn tab and a saved supervised learning recap alongside the PDF."
        width={1532}
        height={725}
        unoptimized
        className="block h-auto w-full rounded-2xl border border-border/70 shadow-sm sm:rounded-3xl"
      />
    </section>
  )
}

export function UniversityCommunity() {
  return (
    <section
      aria-labelledby="university-community-heading"
      className="mx-auto max-w-5xl px-5 py-16 text-center sm:px-8 sm:py-20"
    >
      <h2
        id="university-community-heading"
        className="text-base font-normal text-muted-foreground sm:text-lg"
      >
        Used by students from
      </h2>
      <ul className="mx-auto mt-7 grid max-w-sm grid-cols-3 items-center justify-items-center gap-6 sm:max-w-none sm:grid-cols-9 sm:gap-3">
        {universities.map(([slug, name]) => (
          <li key={slug}>
            <Image
              src={`/landing/universities/${slug}.webp`}
              alt={name}
              width={160}
              height={160}
              unoptimized
              className="size-11 object-contain sm:size-12 lg:size-14"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function LandingFeaturePreviews() {
  return (
    <section
      id="study-tools"
      aria-label="Study tools"
      className="mx-auto grid max-w-6xl scroll-mt-28 gap-4 px-5 sm:px-8 md:grid-cols-3"
    >
      {previews.map(([label, href, image]) => (
        <Link
          key={href}
          href={href}
          className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Card className="h-full gap-0 rounded-2xl py-0 ring-border/80">
            <div className="aspect-[16/10] overflow-hidden border-b border-border/60 bg-muted/35">
              <Image
                src={`${demoPath}/${image}`}
                alt=""
                width={960}
                height={600}
                unoptimized
                className="block h-full w-full object-cover"
              />
            </div>
            <CardHeader className="flex items-center justify-between py-3.5">
              <CardTitle>{label}</CardTitle>
              <ArrowRight
                aria-hidden="true"
                className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
              />
            </CardHeader>
          </Card>
        </Link>
      ))}
    </section>
  )
}
