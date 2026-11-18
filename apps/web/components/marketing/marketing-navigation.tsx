"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Menu, NavArrowDown, ArrowRight } from "iconoir-react"
import { Brand } from "@/components/workspace/brand"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu"
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@workspace/ui/components/sheet"
import { cn } from "@workspace/ui/lib/utils"

export type MarketingAuthState = "guest" | "signed-in"

const featureLinks = [
  ["All features", "/features"],
  ["Bring your materials", "/features#materials"],
  ["Understand with sources", "/features#understand"],
  ["Practise and review", "/features#practise"],
  ["Visuals and listening", "/features#formats"],
] as const
const links = [
  ["Pricing", "/pricing"],
  ["About", "/about"],
  ["Blog", "/blog"],
] as const

export function AuthLinks({ authState }: { authState: MarketingAuthState }) {
  return authState === "signed-in" ? (
    <Button
      size="lg"
      className="h-10 rounded-full px-5"
      render={<Link href="/" prefetch={false} />}
      nativeButton={false}
    >
      Open workspace <ArrowRight data-icon="inline-end" />
    </Button>
  ) : (
    <>
      <Button
        variant="ghost"
        size="lg"
        className="h-10 rounded-full"
        render={<Link href="/sign-in" prefetch={false} />}
        nativeButton={false}
      >
        Sign in
      </Button>
      <Button
        size="lg"
        className="h-10 rounded-full px-5"
        render={<Link href="/sign-up" prefetch={false} />}
        nativeButton={false}
      >
        Start free
      </Button>
    </>
  )
}

export function MarketingNavigation({
  authState,
  homeHref,
}: {
  authState: MarketingAuthState
  homeHref: string
}) {
  const pathname = usePathname()
  const reduced = useReducedMotion()
  const [scrolled, setScrolled] = useState(false)
  const [featuresOpen, setFeaturesOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 16)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])
  const duration = reduced ? 0 : 0.18
  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.scrollBehavior
    const previousAttribute = root.getAttribute("data-scroll-behavior")
    root.style.scrollBehavior = reduced ? "auto" : "smooth"
    root.setAttribute("data-scroll-behavior", reduced ? "auto" : "smooth")
    return () => {
      root.style.scrollBehavior = previous
      if (previousAttribute === null)
        root.removeAttribute("data-scroll-behavior")
      else root.setAttribute("data-scroll-behavior", previousAttribute)
    }
  }, [reduced])
  return (
    <motion.header
      animate={{
        boxShadow: scrolled
          ? "0 4px 20px rgb(0 0 0 / 0.03)"
          : "0 0 0 rgb(0 0 0 / 0)",
      }}
      transition={{ duration }}
      className={cn(
        "sticky top-0 z-30 border-b bg-background/95 backdrop-blur-md",
        scrolled ? "border-border/70" : "border-transparent"
      )}
    >
      <div className="mx-auto flex h-19 max-w-6xl items-center justify-between gap-5 px-5 sm:px-8">
        <Brand href={homeHref} />
        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-2 md:flex"
        >
          <DropdownMenu open={featuresOpen} onOpenChange={setFeaturesOpen}>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  className="h-10 rounded-full aria-[current=page]:bg-muted"
                  aria-current={pathname === "/features" ? "page" : undefined}
                />
              }
            >
              Features <NavArrowDown data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-64 p-2 motion-reduce:animate-none"
              sideOffset={10}
              render={
                <motion.div
                  initial={false}
                  animate={{
                    opacity: featuresOpen ? 1 : 0,
                    y: featuresOpen ? 0 : -5,
                  }}
                  transition={{ duration }}
                />
              }
            >
              <DropdownMenuGroup>
                {featureLinks.map(([label, href]) => (
                  <DropdownMenuItem
                    key={href}
                    className="min-h-11 px-3"
                    render={<Link href={href} />}
                    onClick={() => setFeaturesOpen(false)}
                  >
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {links.map(([label, href]) => (
            <Button
              key={href}
              variant="ghost"
              className="h-10 rounded-full aria-[current=page]:bg-muted"
              render={
                <Link
                  href={href}
                  aria-current={pathname === href ? "page" : undefined}
                />
              }
              nativeButton={false}
            >
              {label}
            </Button>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <AuthLinks authState={authState} />
        </div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon-lg"
                className="size-11 md:hidden"
                aria-label="Open navigation"
              />
            }
          >
            <Menu />
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-[min(88vw,360px)] overflow-y-auto p-5 motion-reduce:transition-none"
            render={
              <motion.div
                initial={false}
                animate={{ opacity: mobileOpen ? 1 : 0 }}
                transition={{ duration }}
              />
            }
          >
            <SheetHeader className="px-0 pt-4">
              <SheetTitle>Explore Abstruck</SheetTitle>
              <SheetDescription>
                Your materials, practice and review.
              </SheetDescription>
            </SheetHeader>
            <nav aria-label="Mobile navigation" className="flex flex-col gap-1">
              {[
                ...featureLinks,
                ...links,
                ["Help & contact", "/contact"] as const,
              ].map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={pathname === href ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-3 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div
              className="mt-auto flex flex-wrap gap-2 pb-4"
              onClick={() => setMobileOpen(false)}
            >
              <AuthLinks authState={authState} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <AnimatePresence>
        {scrolled && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration }}
            className="h-px bg-border/30"
          />
        )}
      </AnimatePresence>
    </motion.header>
  )
}
