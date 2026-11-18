"use client"

import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { WorkspaceShell } from "@/components/workspace/study-home"
import {
  MaterialDialog,
  type MaterialInputKind,
} from "@/components/workspace/material-dialog"
import {
  CollectionView,
  type CollectionState,
  type MaterialListItem,
} from "@/components/workspace/collection-view"
import {
  StudyWorkspace,
  type WorkspacePreviewState,
} from "@/components/workspace/study-workspace"
import { LandingPreview } from "@/components/preview/landing-preview"
import { OnboardingPreview } from "@/components/preview/onboarding-preview"
import {
  BillingPreview,
  type BillingState,
} from "@/components/preview/billing-preview"
import {
  ProcessingView,
  type ProcessingState,
} from "@/components/workspace/processing-view"

const fixtureMaterials: MaterialListItem[] = [
  {
    id: "greenhouse",
    title: "Greenhouse study notes",
    detail: "PDF · 2 pages",
    space: "Biology",
    href: "/preview/workspace",
  },
  {
    id: "lecture",
    title: "Understanding ecosystems",
    detail: "Video · 4 minutes",
    space: "Biology",
    href: "/preview/workspace",
  },
  {
    id: "notes",
    title: "This week’s review",
    detail: "Pasted text",
    space: "My study space",
    href: "/preview/workspace",
  },
]
const collectionScreens = ["space", "library", "history", "search"] as const

export function UiPreview({ screen }: { screen: string }) {
  const [state, setState] = useState<CollectionState>("ready")
  const [kind, setKind] = useState<MaterialInputKind | null>(null)
  const materials = fixtureMaterials
  const [notice, setNotice] = useState("")
  const [billingState, setBillingState] = useState<BillingState>("free")
  const [workspaceState, setWorkspaceState] =
    useState<WorkspacePreviewState>("ready")
  const [processingState, setProcessingState] =
    useState<ProcessingState>("processing")
  const collection = collectionScreens.find((value) => value === screen)
  const study = [
    "workspace",
    "summary",
    "notes",
    "flashcards",
    "quiz",
  ].includes(screen)
  if (screen === "landing" || screen === "onboarding")
    return (
      <>
        <aside
          aria-label="Development preview controls"
          className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-6 py-2 text-xs"
        >
          <a href="/preview" className="underline underline-offset-4">
            Screen index
          </a>
          <span>
            Development preview ·{" "}
            {screen === "onboarding"
              ? "proposed Abstruck onboarding; nothing is saved"
              : "reference-informed layout with Abstruck copy"}
          </span>
        </aside>
        {screen === "landing" ? <LandingPreview /> : <OnboardingPreview />}
      </>
    )
  return (
    <WorkspaceShell
      title="Interface preview"
      preview
      onAddMaterial={() => setKind("upload")}
    >
      <div
        className={
          study ? "flex h-[calc(100svh-3.5rem)] min-h-0 flex-col" : undefined
        }
      >
        <aside
          className="flex flex-wrap items-center gap-3 border-y bg-muted/40 px-6 py-2 text-xs"
          aria-label="Development preview controls"
        >
          <a
            href="/preview"
            className="font-medium underline underline-offset-4"
          >
            Screen index
          </a>
          <span className="flex-1">
            Development preview · synthetic content · nothing is sent or saved
            to an account
          </span>
          {collection && (
            <>
              <label htmlFor="preview-state">State</label>
              <NativeSelect
                id="preview-state"
                value={state}
                onChange={(event) =>
                  setState(event.target.value as CollectionState)
                }
              >
                <NativeSelectOption value="ready">Populated</NativeSelectOption>
                <NativeSelectOption value="empty">Empty</NativeSelectOption>
                <NativeSelectOption value="loading">Loading</NativeSelectOption>
                <NativeSelectOption value="error">Error</NativeSelectOption>
              </NativeSelect>
            </>
          )}
          {study && (
            <>
              <label htmlFor="workspace-state">State</label>
              <NativeSelect
                id="workspace-state"
                value={workspaceState}
                onChange={(event) =>
                  setWorkspaceState(event.target.value as WorkspacePreviewState)
                }
              >
                {(
                  [
                    "ready",
                    "loading",
                    "offline",
                    "quota",
                    "answer-error",
                    "source-unavailable",
                  ] as const
                ).map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {value}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </>
          )}
          {screen === "billing" && (
            <>
              <label htmlFor="billing-state">State</label>
              <NativeSelect
                id="billing-state"
                value={billingState}
                onChange={(event) =>
                  setBillingState(event.target.value as BillingState)
                }
              >
                {(
                  [
                    "free",
                    "paid",
                    "quota",
                    "pending",
                    "delayed",
                    "confirmed",
                    "renewed",
                    "expired",
                    "failed",
                    "refunded",
                  ] as const
                ).map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {value}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </>
          )}
          {screen === "processing" && (
            <>
              <label htmlFor="processing-state">State</label>
              <NativeSelect
                id="processing-state"
                value={processingState}
                onChange={(event) =>
                  setProcessingState(event.target.value as ProcessingState)
                }
              >
                {(
                  [
                    "uploading",
                    "queued",
                    "processing",
                    "partial",
                    "failed",
                    "interrupted",
                    "quota",
                    "ready",
                  ] as const
                ).map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {value}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </>
          )}
        </aside>
        {notice && (
          <Alert className="mx-6 mt-4 w-auto">
            <AlertTitle>Preview interaction</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {screen === "billing" ? (
          <BillingPreview state={billingState} />
        ) : screen === "processing" ? (
          <ProcessingView
            state={processingState}
            onRetry={() => {
              setProcessingState(
                processingState === "interrupted" ? "uploading" : "queued"
              )
              setNotice(
                "Preview state changed. No file upload or background job was started."
              )
            }}
            onOpen={() => {
              window.location.href = "/preview/workspace"
            }}
            onReplace={() => {
              if (processingState === "quota") {
                window.location.href = "/preview/library"
              } else setKind("upload")
            }}
          />
        ) : study ? (
          <StudyWorkspace
            state={workspaceState}
            onRetry={() => setWorkspaceState("ready")}
            initialTool={
              screen === "workspace"
                ? "learn"
                : (screen as "summary" | "notes" | "flashcards" | "quiz")
            }
          />
        ) : collection ? (
          <CollectionView
            kind={collection}
            state={state}
            items={materials}
            onAdd={() => setKind("upload")}
            onRetry={() => setState("ready")}
            onCreateFolder={(name) =>
              setNotice(
                `Folder name “${name}” was accepted locally. Folder persistence will be connected to your account later.`
              )
            }
            onRename={(name) =>
              setNotice(
                `Space name “${name}” was accepted locally. This preview does not save changes.`
              )
            }
          />
        ) : (
          <main
            id="main-content"
            className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10"
          >
            <div>
              <h1 className="text-3xl">Abstruck interface review</h1>
              <p className="mt-3 text-muted-foreground">
                Explore the interface in small connected slices while the real
                study pipeline is being built.
              </p>
            </div>
            <section className="grid gap-3 sm:grid-cols-2">
              <h2 className="col-span-full text-lg">
                Discovery and first steps
              </h2>
              {["landing", "onboarding", "billing"].map((value) => (
                <Button
                  key={value}
                  variant="outline"
                  render={<a href={`/preview/${value}`} />}
                  nativeButton={false}
                  className="h-16 justify-start rounded-2xl px-5 capitalize"
                >
                  {value}
                </Button>
              ))}
            </section>
            <section className="grid gap-3 sm:grid-cols-2">
              <h2 className="col-span-full text-lg">Organisation</h2>
              {collectionScreens.map((value) => (
                <Button
                  key={value}
                  variant="outline"
                  render={<a href={`/preview/${value}`} />}
                  nativeButton={false}
                  className="h-16 justify-start rounded-2xl px-5 capitalize"
                >
                  {value}
                </Button>
              ))}
            </section>
            <section className="grid gap-3 sm:grid-cols-2">
              <h2 className="col-span-full text-lg">Study workspace</h2>
              {["workspace", "summary", "notes", "flashcards", "quiz"].map(
                (value) => (
                  <Button
                    key={value}
                    variant="outline"
                    render={<a href={`/preview/${value}`} />}
                    nativeButton={false}
                    className="h-16 justify-start rounded-2xl px-5 capitalize"
                  >
                    {value}
                  </Button>
                )
              )}
            </section>
            <section className="flex flex-wrap gap-3">
              <h2 className="w-full text-lg">Add material dialogs</h2>
              {(["upload", "link", "paste"] as const).map((value) => (
                <Button
                  key={value}
                  variant="outline"
                  onClick={() => setKind(value)}
                  className="capitalize"
                >
                  {value}
                </Button>
              ))}
              <Button
                variant="outline"
                render={<a href="/preview/processing" />}
                nativeButton={false}
              >
                Processing and recovery
              </Button>
            </section>
          </main>
        )}
        <MaterialDialog
          kind={kind}
          onClose={() => setKind(null)}
          onSubmit={async () => ({
            error:
              "Preview only: your input was validated, but no file was uploaded and no material was created.",
          })}
        />
      </div>
    </WorkspaceShell>
  )
}
