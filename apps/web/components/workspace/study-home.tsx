"use client"

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type Ref,
} from "react"
import { motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import {
  ArrowUp,
  Clock,
  Book,
  Folder,
  Link as LinkIcon,
  Menu,
  NavArrowDown,
  PasteClipboard,
  Plus,
  Search,
  Settings,
  Upload,
  User,
  Xmark,
} from "iconoir-react"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { cn } from "@workspace/ui/lib/utils"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu"
import type { CreateSpaceAction } from "@/components/workspace/create-space-dialog"
import { useCreateSpace } from "@/hooks/use-create-space"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  AccountDialog,
  type AccountDialogProps,
} from "@/components/workspace/account-dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@workspace/ui/components/sidebar"

import { Brand } from "@/components/workspace/brand"
import { SearchDialog } from "@/components/workspace/search-dialog"
import { BillingPlanBadge } from "@/components/workspace/billing-usage"
import { SidebarSpaces } from "./sidebar-spaces"
import type { SpaceFolder } from "@/lib/organisation-types"
import { MaterialIcon } from "@/components/workspace/material-icon"
import Image from "next/image"
import { SpaceIcon } from "./space-icon"
import { spaceCoverUrl, type SpaceAppearance } from "@/lib/space-appearance"
import {
  MaterialDialog,
  type MaterialInputKind,
  type MaterialDialogProps,
} from "@/components/workspace/material-dialog"

const PREVIEW_DESCRIPTION =
  "This workspace preview is ready to explore. Adding materials, spaces and account features will be available once setup is complete."

export interface StudySpace extends SpaceAppearance {
  id: string
  title: string
  description: string | null
  createdAt?: string
  folders?: SpaceFolder[]
  isPinned?: boolean
  sortOrder?: number | null
}

export interface RecentMaterial {
  id: string
  title: string
  spaceId: string | null
  folderId?: string | null
  sourceType?: string
}

export type StartChatAction = (
  question: string,
  requestId: string
) => Promise<{ error?: string }>

type WorkspaceAccountProps = {
  spaces?: StudySpace[]
  recentMaterials?: RecentMaterial[]
  activeMaterialId?: string
  activeSpaceId?: string | null
  activeFolderId?: string | null
  userName?: string
  onCreateSpace?: () => void
  creatingSpace?: boolean
  createSpaceError?: string
  signOutAction?: () => Promise<void>
  account?: Omit<AccountDialogProps, "open" | "onOpenChange">
}

function WorkspaceNavigation({
  onNavigate,
  preview = false,
  spaces = [],
  recentMaterials = [],
  activeMaterialId,
  activeSpaceId,
  activeFolderId,
  userName,
  onCreateSpace,
  creatingSpace = false,
  createSpaceError,
  signOutAction,
  onSettings,
  onSearch,
  onCollapse,
  collapseButtonRef,
}: WorkspaceAccountProps & {
  onNavigate?: () => void
  preview?: boolean
  onSettings?: () => void
  onSearch?: () => void
  onCollapse?: () => void
  collapseButtonRef?: Ref<HTMLButtonElement>
}) {
  return (
    <>
      <SidebarHeader className="h-14 flex-row items-center justify-between px-4">
        <Brand />
        {onCollapse && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Collapse navigation"
            ref={collapseButtonRef}
            onClick={onCollapse}
          >
            <Menu aria-hidden="true" />
          </Button>
        )}
      </SidebarHeader>
      <SidebarGroup className="pt-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                onNavigate?.()
                onSearch?.()
              }}
              aria-keyshortcuts="Control+k Meta+k"
              className="h-9 rounded-xl"
            >
              <Search aria-hidden="true" />
              <span>Search</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={
                <a
                  href={preview ? "/preview/history" : "/history"}
                  onClick={onNavigate}
                />
              }
              aria-describedby="workspace-preview"
              className="h-9 rounded-xl"
            >
              <Clock aria-hidden="true" />
              <span>History</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sm font-normal">
            Recents
          </SidebarGroupLabel>
          {recentMaterials.length ? (
            <SidebarMenu>
              {recentMaterials.slice(0, 3).map((material) => (
                <SidebarMenuItem key={material.id}>
                  <SidebarMenuButton
                    isActive={material.id === activeMaterialId}
                    render={
                      <a
                        href={`/materials/${material.id}`}
                        onClick={onNavigate}
                      />
                    }
                  >
                    <MaterialIcon type={material.sourceType} />
                    <span>{material.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          ) : (
            <p className="px-2 py-1 text-sm leading-5 text-muted-foreground">
              Your recent materials will appear here.
            </p>
          )}
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sm font-normal">
            Spaces
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  disabled={creatingSpace || (!preview && !onCreateSpace)}
                  onClick={() => {
                    onCreateSpace?.()
                    onNavigate?.()
                  }}
                  render={
                    preview ? (
                      <a href="/preview/space" onClick={onNavigate} />
                    ) : undefined
                  }
                  aria-describedby="workspace-preview"
                  className="h-9 rounded-xl"
                >
                  {creatingSpace ? <Spinner /> : <Plus aria-hidden="true" />}
                  <span>{creatingSpace ? "Creating space…" : "New Space"}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {createSpaceError && (
                <SidebarMenuItem>
                  <p
                    role="alert"
                    className="px-2 py-1 text-sm text-destructive"
                  >
                    {createSpaceError}
                  </p>
                </SidebarMenuItem>
              )}
              <SidebarSpaces
                spaces={spaces}
                recentMaterials={recentMaterials}
                activeSpaceId={activeSpaceId}
                activeFolderId={activeFolderId}
                activeMaterialId={activeMaterialId}
                onNavigate={onNavigate}
                preview={preview}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sm font-normal">
            Help &amp; Tools
          </SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                disabled={preview}
                render={
                  preview ? undefined : (
                    <a href="/support" onClick={onNavigate} />
                  )
                }
                className="h-9 rounded-xl"
              >
                <Book aria-hidden="true" />
                <span>Help &amp; Support</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-0 pb-3">
        <BillingPlanBadge
          enabled={!!signOutAction}
          className="mx-5 h-6 w-auto rounded-b-none border-plan-border bg-plan text-plan-foreground"
        />
        {signOutAction ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  className="h-12 w-full justify-start gap-3 rounded-2xl px-3"
                />
              }
            >
              <User aria-hidden="true" />
              <span className="truncate">{userName || "Your workspace"}</span>
              <NavArrowDown aria-hidden="true" className="ml-auto" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" className="min-w-52">
              <DropdownMenuItem onClick={onSettings}>
                <Settings aria-hidden="true" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void signOutAction()}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="outline"
            disabled
            aria-describedby="workspace-preview"
            className="h-12 justify-start gap-3 rounded-2xl px-3"
          >
            <User aria-hidden="true" data-icon="inline-start" />
            <span>{userName || "Your workspace"}</span>
            <NavArrowDown
              aria-hidden="true"
              data-icon="inline-end"
              className="ml-auto"
            />
          </Button>
        )}
      </SidebarFooter>
    </>
  )
}

function UpgradeButton({ preview = false }: { preview?: boolean }) {
  return (
    <Button
      variant="outline"
      render={<Link href={preview ? "/preview/billing" : "/billing"} />}
      nativeButton={false}
      className="h-10 rounded-full border-plan-border bg-plan px-3 text-plan-foreground"
    >
      Upgrade
    </Button>
  )
}

export function MaterialComposer({
  onChoose,
  onStartChat,
}: {
  onChoose: (kind: MaterialInputKind) => void
  onStartChat?: StartChatAction
}) {
  const [draft, setDraft] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const inFlight = useRef(false)
  const intent = useRef<{ question: string; requestId: string } | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const question = draft.trim()
    if (!question || !onStartChat || inFlight.current) return
    if (intent.current?.question !== question)
      intent.current = { question, requestId: crypto.randomUUID() }
    inFlight.current = true
    setPending(true)
    setError("")
    try {
      const result = await onStartChat(question, intent.current.requestId)
      if (result.error) setError(result.error)
      else setDraft((current) => (current.trim() === question ? "" : current))
    } catch {
      setError(
        "Your chat could not be opened. Your question is still here; try again."
      )
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <InputGroup
        id="add-material"
        className="min-h-30 scroll-mt-20 rounded-[1.75rem] px-3 pt-1 pb-2.5 shadow-composer has-disabled:bg-background has-disabled:opacity-100 sm:min-h-24"
      >
        <InputGroupTextarea
          aria-label="Upload your learning materials or ask anything"
          placeholder="Upload your learning materials or ask anything"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          maxLength={2000}
          aria-invalid={Boolean(error)}
          rows={2}
          className="max-h-36 min-h-15 px-1 pt-2.5 pb-1 text-base leading-6 sm:min-h-10 md:text-base"
        />
        <InputGroupAddon align="block-end" className="gap-2 p-0">
          {[
            { label: "Upload", icon: Upload, kind: "upload" as const },
            { label: "Link", icon: LinkIcon, kind: "link" as const },
            { label: "Paste", icon: PasteClipboard, kind: "paste" as const },
          ].map(({ label, icon: Icon, kind }) => (
            <InputGroupButton
              key={label}
              variant="outline"
              size="sm"
              onClick={() => onChoose(kind)}
              aria-label={label}
              aria-describedby="workspace-preview"
              className="size-8.5 rounded-full p-0 sm:w-auto sm:px-2.5"
            >
              <Icon aria-hidden="true" data-icon="inline-start" />
              <span className="hidden sm:inline">{label}</span>
            </InputGroupButton>
          ))}
          <InputGroupButton
            size="icon-sm"
            type="submit"
            disabled={!onStartChat || !draft.trim() || pending}
            aria-label={pending ? "Opening chat" : "Start chat"}
            className="ml-auto size-8.5 rounded-full bg-foreground text-background"
          >
            {pending ? <Spinner /> : <ArrowUp aria-hidden="true" />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}

const SPACE_SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
] as const

const RECENT_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "library", label: "My Library" },
] as const

type SpaceSort = (typeof SPACE_SORT_OPTIONS)[number]["value"]
type RecentFilter = (typeof RECENT_FILTER_OPTIONS)[number]["value"]

function HomeContent({
  onChoose,
  spaces = [],
  recentMaterials = [],
  userName,
  onCreateSpace,
  creatingSpace,
  onStartChat,
}: WorkspaceAccountProps & {
  onChoose: (kind: MaterialInputKind) => void
  onStartChat?: StartChatAction
}) {
  const [spaceSort, setSpaceSort] = useState<SpaceSort>("newest")
  const [recentFilter, setRecentFilter] = useState<RecentFilter>("all")
  const sortedSpaces = [...spaces].sort((a, b) => {
    if (spaceSort === "name-asc" || spaceSort === "name-desc") {
      const order = a.title.localeCompare(b.title, "en", {
        sensitivity: "base",
        numeric: true,
      })
      return spaceSort === "name-asc" ? order : -order
    }
    const order = Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? "")
    return Number.isFinite(order)
      ? spaceSort === "newest"
        ? order
        : -order
      : 0
  })
  const filteredRecents = recentMaterials.filter(
    (material) => recentFilter === "all" || material.spaceId === null
  )

  return (
    <main id="main-content" tabIndex={-1} className="pb-12">
      <section aria-labelledby="home-heading" className="px-6 pt-6 lg:pt-20">
        <h1
          id="home-heading"
          className="text-center text-xl leading-7 sm:text-3xl sm:leading-9"
        >
          Time to learn{userName ? `, ${userName}` : ""}
        </h1>
        <div className="mx-auto mt-5 max-w-2xl">
          <MaterialComposer onChoose={onChoose} onStartChat={onStartChat} />
        </div>
      </section>
      <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-16 px-6 lg:mt-20 lg:px-20 xl:px-42">
        <section aria-labelledby="spaces-heading">
          <div className="flex h-7 items-center gap-4">
            <h2 id="spaces-heading" className="text-lg">
              Spaces
            </h2>
            <Select<SpaceSort>
              items={SPACE_SORT_OPTIONS}
              value={spaceSort}
              onValueChange={(value) => {
                if (value) setSpaceSort(value)
              }}
            >
              <SelectTrigger
                aria-label="Sort spaces"
                className="gap-1.5 border-0 px-0 text-muted-foreground hover:text-foreground"
              >
                <Clock aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                className="w-48 rounded-xl"
              >
                <SelectGroup>
                  {SPACE_SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 py-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            <Button
              variant="outline"
              disabled={!onCreateSpace || creatingSpace}
              onClick={onCreateSpace}
              aria-describedby="workspace-preview"
              className="h-30 w-full flex-col gap-3 rounded-3xl border-2 border-dashed shadow-composer"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-muted">
                {creatingSpace ? <Spinner /> : <Plus aria-hidden="true" />}
              </span>
              New Space
            </Button>
            {sortedSpaces.map((space) => (
              <a
                key={space.id}
                href={`/spaces/${encodeURIComponent(space.id)}`}
                className="flex min-h-30 flex-col overflow-hidden rounded-3xl border shadow-composer transition-colors hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                <div className="h-14 overflow-hidden bg-muted/60">
                  {space.hasCover && (
                    <Image
                      src={spaceCoverUrl(space)}
                      alt=""
                      width={512}
                      height={160}
                      unoptimized
                      className="size-full object-cover"
                    />
                  )}
                </div>
                <div className="flex flex-col gap-1 px-4 pb-4">
                  <SpaceIcon
                    space={space}
                    className="-mt-3 mb-1 size-6 text-muted-foreground"
                  />
                  <span className="truncate text-sm font-medium">
                    {space.title}
                  </span>
                  <span className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {space.description || "Open space"}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>
        <section aria-labelledby="recents-heading">
          <div className="flex h-7 items-center gap-4">
            <h2 id="recents-heading" className="text-lg">
              Recents
            </h2>
            <Select<RecentFilter>
              items={RECENT_FILTER_OPTIONS}
              value={recentFilter}
              onValueChange={(value) => {
                if (value) setRecentFilter(value)
              }}
            >
              <SelectTrigger
                aria-label="Filter recent materials"
                className="gap-1 border-0 px-0 text-muted-foreground hover:text-foreground"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                className="w-40 rounded-xl"
              >
                <SelectGroup>
                  {RECENT_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Link
              href={
                recentFilter === "library"
                  ? "/library?filter=unfiled"
                  : "/history"
              }
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "ml-auto px-0"
              )}
            >
              View all
            </Link>
          </div>
          {filteredRecents.length ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredRecents.slice(0, 8).map((material) => (
                <a
                  key={material.id}
                  href={`/materials/${material.id}`}
                  className="flex min-h-28 flex-col gap-3 rounded-3xl border p-5 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <MaterialIcon
                    type={material.sourceType}
                    className="size-6 text-muted-foreground"
                  />
                  <span className="truncate text-sm font-medium">
                    {material.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Continue studying
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <Empty className="mt-4 min-h-40 rounded-3xl border">
              <EmptyHeader>
                <EmptyTitle>
                  {recentFilter === "library"
                    ? "No materials in My Library"
                    : "No materials yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {recentFilter === "library"
                    ? "Materials saved outside spaces will appear here."
                    : "Your materials and saved study sessions will appear here."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>
        {!onCreateSpace && (
          <p
            id="workspace-preview"
            className="max-w-2xl text-sm leading-6 text-muted-foreground"
          >
            {PREVIEW_DESCRIPTION}
          </p>
        )}
      </div>
    </main>
  )
}

export function WorkspaceShell({
  children,
  title,
  actions,
  preview = false,
  spaces,
  recentMaterials,
  activeMaterialId,
  activeSpaceId,
  activeFolderId,
  userName,
  onCreateSpace,
  creatingSpace,
  createSpaceError,
  signOutAction,
  account,
  fixedContent = false,
  defaultSearchOpen = false,
  sidePanel,
  sidePanelOpen = false,
  sidePanelExpanded = false,
}: WorkspaceAccountProps & {
  children: ReactNode
  title?: ReactNode
  actions?: ReactNode
  preview?: boolean
  onAddMaterial?: () => void
  fixedContent?: boolean
  defaultSearchOpen?: boolean
  sidePanel?: ReactNode
  sidePanelOpen?: boolean
  sidePanelExpanded?: boolean
}) {
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [desktopNavigationOpen, setDesktopNavigationOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(defaultSearchOpen)
  const reduceMotion = useReducedMotion()
  const expandNavigationButton = useRef<HTMLButtonElement | null>(null)
  const collapseNavigationButton = useRef<HTMLButtonElement | null>(null)
  const navigationTransition = {
    duration: reduceMotion ? 0 : 0.2,
    ease: [0.22, 1, 0.36, 1] as const,
  }
  useEffect(() => {
    try {
      setDesktopNavigationOpen(
        localStorage.getItem("abstruck:desktop-navigation") !== "closed"
      )
    } catch {
      /* Navigation works without optional browser preferences. */
    }
  }, [])
  function toggleDesktopNavigation() {
    const nextOpen = !desktopNavigationOpen
    changeDesktopNavigation(nextOpen)
    requestAnimationFrame(() => {
      const button = nextOpen
        ? collapseNavigationButton
        : expandNavigationButton
      button.current?.focus()
    })
  }
  function changeDesktopNavigation(open: boolean) {
    setDesktopNavigationOpen(open)
    try {
      localStorage.setItem(
        "abstruck:desktop-navigation",
        open ? "open" : "closed"
      )
    } catch {
      /* Optional preference. */
    }
  }
  useEffect(() => {
    function openSearch(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", openSearch)
    return () => window.removeEventListener("keydown", openSearch)
  }, [])

  return (
    <SidebarProvider
      open={desktopNavigationOpen}
      onOpenChange={changeDesktopNavigation}
      className={fixedContent ? "h-svh overflow-hidden" : undefined}
    >
      <a
        href={sidePanelOpen ? "#workspace-study-content" : "#main-content"}
        className="sr-only rounded-md bg-background p-3 focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
      >
        Skip to content
      </a>
      <motion.div
        initial={false}
        animate={{ x: desktopNavigationOpen ? "0%" : "-100%" }}
        transition={navigationTransition}
        inert={!desktopNavigationOpen}
        aria-hidden={!desktopNavigationOpen}
        className="fixed inset-y-0 left-0 hidden h-svh w-64 lg:flex"
        data-sidebar-slide
      >
        <Sidebar
          collapsible="none"
          className="h-full border-r border-sidebar-border"
        >
          <nav
            aria-label="Main navigation"
            className="flex h-full min-h-0 flex-col"
          >
            <WorkspaceNavigation
              preview={preview}
              spaces={spaces}
              recentMaterials={recentMaterials}
              activeMaterialId={activeMaterialId}
              activeSpaceId={activeSpaceId}
              activeFolderId={activeFolderId}
              userName={userName}
              onCreateSpace={onCreateSpace}
              creatingSpace={creatingSpace}
              createSpaceError={createSpaceError}
              signOutAction={signOutAction}
              onSettings={() => setSettingsOpen(true)}
              onSearch={() => setSearchOpen(true)}
              onCollapse={toggleDesktopNavigation}
              collapseButtonRef={collapseNavigationButton}
            />
          </nav>
        </Sidebar>
      </motion.div>
      <motion.div
        initial={false}
        animate={{
          "--workspace-sidebar-offset": desktopNavigationOpen
            ? "16rem"
            : "0rem",
          "--workspace-study-width": sidePanelOpen
            ? sidePanelExpanded
              ? "100%"
              : "44%"
            : "0%",
        }}
        transition={navigationTransition}
        className={cn(
          "min-w-0 flex-1 lg:ml-(--workspace-sidebar-offset)",
          fixedContent && !sidePanel && "flex h-svh flex-col overflow-hidden",
          sidePanel &&
            "grid h-svh grid-cols-1 grid-rows-[3.5rem_minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_var(--workspace-study-width)]"
        )}
      >
        <header
          inert={sidePanelExpanded}
          aria-hidden={sidePanelExpanded || undefined}
          className={cn(
            "flex h-14 shrink-0 items-center gap-3 px-2 lg:justify-end lg:px-4",
            sidePanel && "col-start-1 row-start-1 min-w-0",
            sidePanelExpanded && "invisible overflow-hidden"
          )}
        >
          {!desktopNavigationOpen && (
            <div
              className={cn(
                "hidden shrink-0 items-center gap-3 lg:flex",
                !title && "mr-auto"
              )}
            >
              <Button
                variant="ghost"
                size="icon"
                aria-label="Expand navigation"
                ref={expandNavigationButton}
                onClick={toggleDesktopNavigation}
              >
                <Menu aria-hidden="true" />
              </Button>
              <Brand compact />
            </div>
          )}
          <div
            className={cn(
              "flex shrink-0 items-center gap-3 lg:hidden",
              !title && "flex-1"
            )}
          >
            <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    aria-label="Open navigation menu"
                  />
                }
              >
                <Menu aria-hidden="true" />
              </SheetTrigger>
              <SheetContent
                side="left"
                showCloseButton={false}
                className="w-64! gap-0 bg-sidebar p-0"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Abstruck navigation</SheetTitle>
                  <SheetDescription>
                    Home, spaces and your study library.
                  </SheetDescription>
                </SheetHeader>
                <SheetClose
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Close navigation menu"
                      className="absolute top-3 right-2"
                    />
                  }
                >
                  <Xmark aria-hidden="true" />
                </SheetClose>
                <nav
                  aria-label="Mobile navigation"
                  className="flex h-full min-h-0 flex-col"
                >
                  <WorkspaceNavigation
                    onNavigate={() => setNavigationOpen(false)}
                    preview={preview}
                    spaces={spaces}
                    recentMaterials={recentMaterials}
                    activeMaterialId={activeMaterialId}
                    activeSpaceId={activeSpaceId}
                    activeFolderId={activeFolderId}
                    userName={userName}
                    onCreateSpace={onCreateSpace}
                    creatingSpace={creatingSpace}
                    createSpaceError={createSpaceError}
                    signOutAction={signOutAction}
                    onSettings={() => {
                      setNavigationOpen(false)
                      setSettingsOpen(true)
                    }}
                    onSearch={() => setSearchOpen(true)}
                  />
                </nav>
              </SheetContent>
            </Sheet>
            <Brand compact />
          </div>
          {title && (
            <div className="min-w-0 flex-1 truncate text-sm">{title}</div>
          )}
          <div className={fixedContent ? "hidden sm:block" : undefined}>
            <UpgradeButton preview={preview} />
          </div>
          {actions}
        </header>
        {fixedContent || sidePanel ? (
          <div
            inert={sidePanelExpanded}
            aria-hidden={sidePanelExpanded || undefined}
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
              sidePanel && "col-start-1 row-start-2",
              sidePanelOpen && "max-lg:hidden",
              sidePanelExpanded && "invisible"
            )}
          >
            {children}
          </div>
        ) : (
          children
        )}
        {sidePanel && (
          <div
            id="workspace-study-content"
            tabIndex={-1}
            role={sidePanelExpanded ? "main" : undefined}
            inert={!sidePanelOpen}
            aria-hidden={!sidePanelOpen}
            className={cn(
              "col-start-1 row-start-2 min-h-0 min-w-0 overflow-hidden lg:col-start-2 lg:row-span-2 lg:row-start-1",
              sidePanelOpen &&
                !sidePanelExpanded &&
                "lg:border-l lg:border-border",
              sidePanelExpanded && "row-span-2 row-start-1",
              !sidePanelOpen && "max-lg:hidden"
            )}
          >
            {sidePanel}
          </div>
        )}
      </motion.div>
      {signOutAction && (
        <AccountDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          profile={{ name: userName || "Your workspace" }}
          preview={preview}
          {...account}
        />
      )}
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </SidebarProvider>
  )
}

export function StudyHome({
  spaces = [],
  recentMaterials = [],
  userName,
  createSpaceAction,
  signOutAction,
  onSubmitMaterial,
  onStartChat,
}: {
  spaces?: StudySpace[]
  recentMaterials?: RecentMaterial[]
  userName?: string
  createSpaceAction?: CreateSpaceAction
  signOutAction?: () => Promise<void>
  onSubmitMaterial?: MaterialDialogProps["onSubmit"]
  onStartChat?: StartChatAction
}) {
  const [kind, setKind] = useState<MaterialInputKind | null>(null)
  const newSpace = useCreateSpace(createSpaceAction)
  const onCreateSpace = createSpaceAction
    ? () => void newSpace.createSpace()
    : undefined
  return (
    <WorkspaceShell
      spaces={spaces}
      recentMaterials={recentMaterials}
      userName={userName}
      onCreateSpace={onCreateSpace}
      creatingSpace={newSpace.pending}
      createSpaceError={newSpace.error}
      signOutAction={signOutAction}
      onAddMaterial={() => setKind("upload")}
    >
      <HomeContent
        onChoose={setKind}
        spaces={spaces}
        recentMaterials={recentMaterials}
        userName={userName}
        onCreateSpace={onCreateSpace}
        creatingSpace={newSpace.pending}
        onStartChat={onStartChat}
      />
      <MaterialDialog
        kind={kind}
        onClose={() => setKind(null)}
        onSubmit={onSubmitMaterial}
      />
    </WorkspaceShell>
  )
}
