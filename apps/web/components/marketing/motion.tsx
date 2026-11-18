"use client"

import type { ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"

export function Reveal({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 1, y: 0 }}
      whileInView={{ opacity: 1, y: reduced ? 0 : [6, 0] }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{ duration: reduced ? 0 : 0.2 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
