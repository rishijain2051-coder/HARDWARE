import { notFound } from "next/navigation"
import Link from "next/link"
import { format } from "date-fns"
import { ArrowLeft } from "lucide-react"
import { getMisById } from "../actions"
import { Badge } from "@/components/ui/badge"
import { DeleteMisButton } from "./delete-button"
import { hasPermission } from "@/lib/permissions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export default async function MisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const mis = await getMisById(id)
  if (!mis) notFound()

  const session = await auth.api.getSession({ headers: await headers() })
  const canEdit = session?.user ? await hasPermission(session.user.id, "INVENTORY", "EDIT") : false

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/inventory/mis"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {mis.misNumber}
          </h2>
          <p className="text-sm text-muted-foreground">
            {format(new Date(mis.date), "dd MMM yyyy, hh:mm a")} · Created by{" "}
            {mis.createdBy?.name || "—"}
          </p>
        </div>
        
        {mis.isDeleted ? (
          <Badge variant="destructive" className="ml-auto">
            DELETED
          </Badge>
        ) : (
          <div className="ml-auto">
            <DeleteMisButton id={mis.id} canEdit={canEdit} />
          </div>
        )}
      </div>

      {/* Header Details */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-lg border bg-card p-6">
        <div>
          <p className="text-xs text-muted-foreground">Recipient Type</p>
          <Badge variant="outline">{mis.recipientType}</Badge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Staff</p>
          <p className="font-medium">{mis.staff?.name || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Items</p>
          <p className="font-medium">{mis.items.length}</p>
        </div>
        {mis.purpose && (
          <div className="col-span-3">
            <p className="text-xs text-muted-foreground">Purpose</p>
            <p className="font-medium">{mis.purpose}</p>
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">#</th>
              <th className="px-4 py-3 text-left font-medium">SKU</th>
              <th className="px-4 py-3 text-left font-medium">Description</th>
              <th className="px-4 py-3 text-right font-medium">Qty Issued</th>
              <th className="px-4 py-3 text-left font-medium">Bin</th>
            </tr>
          </thead>
          <tbody>
            {mis.items.map((item: any, idx: number) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                <td className="px-4 py-3 font-mono text-xs">{item.product?.sku}</td>
                <td className="px-4 py-3">{item.product?.description}</td>
                <td className="px-4 py-3 text-right">{item.quantity}</td>
                <td className="px-4 py-3">{item.bin?.name || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
