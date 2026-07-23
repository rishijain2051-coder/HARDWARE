"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { hardDeleteGrn } from "../actions"
import { useRouter } from "next/navigation"

export function DeleteGrnButton({ id, canEdit }: { id: string; canEdit: boolean }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  if (!canEdit) return null

  const handleDelete = async () => {
    const isHardDelete = confirm(
      "Are you sure you want to PERMANENTLY delete this GRN from the database? This action will also delete associated Store Logs and recalculate the ledger. It cannot be undone."
    )

    if (isHardDelete) {
      setLoading(true)
      const res = await hardDeleteGrn(id)
      setLoading(false)
      
      if (res.error) {
        alert(res.error)
      } else {
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
