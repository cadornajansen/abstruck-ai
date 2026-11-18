"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Book,
  Check,
  NavArrowLeft,
  NavArrowRight,
  Page,
  QuestionMark,
} from "iconoir-react"
import { Brand } from "@/components/workspace/brand"
import {
  MaterialDialog,
  type MaterialInputKind,
} from "@/components/workspace/material-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
  FieldError,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { Progress } from "@workspace/ui/components/progress"
import { cn } from "@workspace/ui/lib/utils"

const intents = [
  {
    id: "understand",
    title: "Understand my materials",
    detail: "Work through ideas and ask questions.",
    icon: Book,
  },
  {
    id: "exam",
    title: "Prepare for an exam",
    detail: "Practise, test yourself and review.",
    icon: QuestionMark,
  },
  {
    id: "organise",
    title: "Organise my studies",
    detail: "Keep materials and notes together.",
    icon: Page,
  },
] as const

export function OnboardingScreen({
  action,
  preview = false,
}: {
  action?: (
    formData: FormData
  ) => Promise<{ id?: string; skipped?: boolean; error?: string }>
  preview?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [step, setStep] = useState(1)
  const [intent, setIntent] = useState<string[]>([])
  const [name, setName] = useState("")
  const [school, setSchool] = useState("")
  const [course, setCourse] = useState("")
  const [space, setSpace] = useState("")
  const [error, setError] = useState("")
  const [finished, setFinished] = useState(false)
  const [skippedSpace, setSkippedSpace] = useState(false)
  const [material, setMaterial] = useState<MaterialInputKind | null>(null)

  function next(skipSpace = false): void {
    if (pending) return
    if (step === 1 && intent.length === 0) {
      setError("Choose what you’d like to work on first.")
      return
    }
    if (step === 3 && !skipSpace && !space.trim()) {
      setError("Give your first space a name.")
      return
    }
    setError("")
    if (step < 3) {
      setStep((value) => value + 1)
      return
    }
    if (preview) {
      setSkippedSpace(skipSpace)
      setFinished(true)
      return
    }
    if (!action) {
      setError("Setup is unavailable. Please try again shortly.")
      return
    }
    const formData = new FormData()
    Object.entries({
      intent: intent[0] ?? "",
      name,
      school,
      course,
      title: skipSpace ? "" : space,
      skipSpace: String(skipSpace),
    }).forEach(([key, value]) => formData.set(key, value))
    startTransition(async () => {
      try {
        const result = await action(formData)
        if (result.error || (!result.id && !result.skipped)) {
          startTransition(() =>
            setError(
              result.error ?? "Your setup could not be saved. Please try again."
            )
          )
          return
        }
        router.push(result.id ? `/spaces/${result.id}?welcome=1` : "/")
        router.refresh()
      } catch {
        startTransition(() =>
          setError(
            "Your setup could not be saved. Your details are still here; please try again."
          )
        )
      }
    })
  }

  return (
    <div
      className={cn(
        "bg-background",
        preview ? "min-h-[calc(100svh-2.5rem)]" : "min-h-svh"
      )}
    >
      <header className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
        <Brand href={preview ? "/preview/landing" : "/"} />
        <span className="text-sm text-muted-foreground">
          Welcome to Abstruck
        </span>
      </header>
      <main className="mx-auto max-w-xl px-6 py-9 sm:py-16">
        {finished ? (
          <section className="text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-plan text-plan-foreground">
              <Check className="size-7" />
            </span>
            <h1 className="mt-6 text-3xl font-medium tracking-tight">
              Bring your first material
            </h1>
            <p className="mt-4 leading-7 text-muted-foreground">
              {skippedSpace
                ? "Your workspace is ready to preview. Add a source to start understanding, practising and reviewing."
                : `Your “${space.trim()}” space is ready to preview. Add a source to start understanding, practising and reviewing.`}
            </p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Preview only: no profile or space has been saved to an account.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {(["upload", "link", "paste"] as const).map((kind) => (
                <Button
                  key={kind}
                  variant={kind === "upload" ? "default" : "outline"}
                  className="h-11 rounded-full px-6 capitalize"
                  onClick={() => setMaterial(kind)}
                >
                  {kind === "upload"
                    ? "Upload a file"
                    : kind === "link"
                      ? "YouTube link"
                      : "Paste text"}
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              className="mt-5"
              render={<a href="/preview/workspace" />}
              nativeButton={false}
            >
              Explore the sample workspace
              <NavArrowRight data-icon="inline-end" />
            </Button>
            <Button
              variant="link"
              className="mt-3 block w-full"
              onClick={() => setFinished(false)}
            >
              Back to setup
            </Button>
          </section>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              next()
            }}
          >
            <div className="mb-9 flex items-center gap-4">
              <Progress
                value={(step / 3) * 100}
                aria-label={`Setup step ${step} of 3`}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">{step} of 3</span>
            </div>
            <h1 className="text-3xl font-medium tracking-tight">
              {step === 1
                ? "What brings you here?"
                : step === 2
                  ? "Make this space yours"
                  : "Create your first space"}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {step === 1
                ? "Choose a starting point. You can use every study tool whenever you need it."
                : step === 2
                  ? "A few details can help personalise your workspace. Everything here is optional."
                  : "A space keeps the materials for a course, subject or exam together."}
            </p>
            {step === 1 ? (
              <ToggleGroup
                aria-label="Study intent"
                value={intent}
                onValueChange={(values) => {
                  setIntent(values as string[])
                  setError("")
                }}
                variant="outline"
                className="mt-7 w-full flex-col items-stretch gap-3"
              >
                {intents.map(({ id, title, detail, icon: Icon }) => (
                  <ToggleGroupItem
                    key={id}
                    value={id}
                    className="h-auto min-h-20 justify-start gap-4 rounded-2xl border p-4 text-left"
                  >
                    <Icon className="size-5 shrink-0" />
                    <span>
                      <span className="block font-medium">{title}</span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {detail}
                      </span>
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            ) : step === 2 ? (
              <FieldGroup className="mt-7">
                <Field>
                  <FieldLabel htmlFor="onboarding-name">
                    Preferred name
                  </FieldLabel>
                  <Input
                    id="onboarding-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="What should we call you?"
                    autoComplete="given-name"
                    maxLength={100}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="onboarding-school">School</FieldLabel>
                  <Input
                    id="onboarding-school"
                    value={school}
                    onChange={(event) => setSchool(event.target.value)}
                    placeholder="Optional"
                    maxLength={160}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="onboarding-course">
                    Course or year level
                  </FieldLabel>
                  <Input
                    id="onboarding-course"
                    value={course}
                    onChange={(event) => setCourse(event.target.value)}
                    placeholder="Optional"
                    maxLength={160}
                  />
                  <FieldDescription>
                    You can update these details later.
                  </FieldDescription>
                </Field>
              </FieldGroup>
            ) : (
              <Field className="mt-7" data-invalid={!!error}>
                <FieldLabel htmlFor="onboarding-space">Space name</FieldLabel>
                <Input
                  id="onboarding-space"
                  value={space}
                  onChange={(event) => {
                    setSpace(event.target.value)
                    setError("")
                  }}
                  placeholder="e.g. Biology, Finals review"
                  maxLength={120}
                  disabled={pending}
                  aria-invalid={!!error}
                  className="h-12 rounded-xl"
                />
                <FieldDescription>
                  Start with one subject. You can create more spaces later.
                </FieldDescription>
              </Field>
            )}
            {error && (
              <FieldError role="alert" className="mt-3">
                {error}
              </FieldError>
            )}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {step > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setError("")
                    setStep((value) => value - 1)
                  }}
                >
                  <NavArrowLeft data-icon="inline-start" />
                  Back
                </Button>
              )}
              {step === 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setName("")
                    setSchool("")
                    setCourse("")
                    setStep(3)
                  }}
                >
                  Skip for now
                </Button>
              )}
              {step === 3 && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => next(true)}
                >
                  Skip for now
                </Button>
              )}
              <Button
                type="submit"
                disabled={pending}
                className="ml-auto h-11 rounded-full px-7"
              >
                {pending
                  ? "Saving setup…"
                  : step === 3
                    ? preview
                      ? "Preview my space"
                      : "Create my space"
                    : "Continue"}
                <NavArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </form>
        )}
      </main>
      {preview && (
        <MaterialDialog kind={material} onClose={() => setMaterial(null)} />
      )}
    </div>
  )
}
