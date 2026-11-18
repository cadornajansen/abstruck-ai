"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export async function completeOnboarding(
  formData: FormData
): Promise<{ id?: string; skipped?: boolean; error?: string }> {
  await requireUser("/onboarding")
  const intent = String(formData.get("intent") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const school = String(formData.get("school") ?? "").trim()
  const course = String(formData.get("course") ?? "").trim()
  const title = String(formData.get("title") ?? "").trim()
  const skipSpace = formData.get("skipSpace") === "true"
  if (!["understand", "exam", "organise"].includes(intent))
    return { error: "Choose a study goal." }
  if (!skipSpace && (!title || title.length > 120))
    return { error: "Enter a space name between 1 and 120 characters." }
  if (name.length > 100 || school.length > 160 || course.length > 160)
    return { error: "Shorten your profile details and try again." }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("complete_onboarding", {
    p_intent: intent,
    p_name: name,
    p_school: school,
    p_course: course,
    p_title: skipSpace ? "" : title,
  })
  if (error)
    return {
      error:
        "Your setup could not be saved. Your details are still here; please try again.",
    }
  revalidatePath("/")
  return data ? { id: data } : { skipped: true }
}
