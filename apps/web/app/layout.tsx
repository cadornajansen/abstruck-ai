import type { Metadata } from "next"
import { Geist, Inter } from "next/font/google"

import "@workspace/ui/globals.css"
import "pdfjs-dist/web/pdf_viewer.css"
import "katex/dist/katex.min.css"
import { cn } from "@workspace/ui/lib/utils"
import { WebAnalytics } from "@/components/web-analytics"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
})

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Abstruck — Your study workspace",
  description:
    "Bring your materials, understand them, practise and return to review.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "font-sans antialiased [color-scheme:only_light]!",
        geist.variable,
        inter.variable
      )}
    >
      <body>
        {children}
        <WebAnalytics />
      </body>
    </html>
  )
}
