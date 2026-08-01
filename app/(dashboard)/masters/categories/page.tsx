import { CategoriesClient } from "./client"
import { getCategories } from "./actions"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function CategoriesPage() {
  const gate = await guardPage("CATEGORY_MASTER", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const categories = await getCategories()

  return (
    <div className="flex flex-col gap-6">
      <CategoriesClient data={categories} />
    </div>
  )
}
