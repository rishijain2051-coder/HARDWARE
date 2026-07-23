import { CategoriesClient } from "./client"
import { getCategories } from "./actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export default async function CategoriesPage() {
  const categories = await getCategories()
  
  const session = await auth.api.getSession({ headers: await headers() })
  const canEdit = session?.user ? await hasPermission(session.user.id, "HARDWARE_MASTER", "EDIT") : false

  return (
    <div className="flex flex-col gap-6 p-6">
      <CategoriesClient data={categories} canEdit={canEdit} />
    </div>
  )
}
