"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { hardDeleteGrn } from "../actions"
import { useRouter } from "next/navigation"
import { usePermissions } from "@/components/permission-provider"
import { invalidateLookups } from "@/components/lookup-cache"
import { TXN_LABELS } from "@/lib/labels"

export function DeleteGrnButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const perms = usePermissions()

  if (!perms.can("INWARD_RECORD", "DELETE")) return null

  const handleDelete = async () => {
    const isHardDelete = confirm(
      `Are you sure you want to PERMANENTLY delete this ${TXN_LABELS.inward} entry from the database? This action will also delete associated Store Logs and recalculate the ledger. It cannot be undone.`
    )

    if (isHardDelete) {
      setLoading(true)
      const res = await hardDeleteGrn(id)
      setLoading(false)
      
      if (res.error) {
        alert(res.error)
      } else {
        // Reversing the entry moved stock back; the cached figures are stale.
        invalidateLookups("products")
        router.push("/inventory/grn")
      }
    }
  }

  return (
    <Button
      variant="destructive"
      onClick={handleDelete}
      disabled={loading}
      className="ml-auto"
    >
      <Trash2 className="mr-2 h-4 w-4" />
      {loading ? "Deleting..." : "Permanently Delete"}
    </Button>
  )
}
