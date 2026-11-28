import Image from "next/image"
export { LandingFeaturePreviews } from "./feature-showcase"

const demoPath = "/landing/demo"

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
      <picture>
        <source
          media="(max-width: 767px)"
          srcSet={`${demoPath}/cs229-workspace-mobile.webp`}
          type="image/webp"
        />
        <Image
          src={`${demoPath}/cs229-workspace.webp`}
          alt="CS229 lecture notes open to the LMS algorithm, with Abstruck’s Learn tab and a saved supervised learning recap alongside the PDF."
          width={1532}
          height={725}
          loading="eager"
          fetchPriority="high"
          unoptimized
          className="block h-auto w-full rounded-2xl border border-border/70 shadow-sm sm:rounded-3xl"
        />
      </picture>
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
