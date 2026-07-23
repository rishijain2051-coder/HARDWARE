import { notFound } from "next/navigation"
import Link from "next/link"
import { format } from "date-fns"
import { ArrowLeft } from "lucide-react"
import { getGrnById } from "../actions"
import { Badge } from "@/components/ui/badge"
import { DeleteGrnButton } from "./delete-button"
import { hasPermission } from "@/lib/permissions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export default async function GrnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const grn = await getGrnById(id)
  if (!grn) notFound()

  const session = await auth.api.getSession({ headers: await headers() })
  const canEdit = session?.user ? await hasPermission(session.user.id, "INVENTORY", "EDIT") : false

  const totalValue = grn.items.reduce(
    (sum: number, item: any) => sum + item.quantity * item.rate,
    0
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link
          href="/inventory/grn"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {grn.grnNumber}
          </h2>
          <p className="text-sm text-muted-foreground">
            {format(new Date(grn.date), "dd MMM yyyy, hh:mm a")} · Created by{" "}
            {grn.createdBy?.name || "—"}
          </p>
        </div>
        
        {grn.isDeleted ? (
          <Badge variant="destructive" className="ml-auto">
            DELETED
          </Badge>
        ) : (
          <div className="ml-auto">
            <DeleteGrnButton id={grn.id} canEdit={canEdit} />
          </div>
        )}
      </div>

      {/* Header Details */}
      <div className="grid grid-cols-4 gap-4 rounded-lg border bg-card p-6">
        <div>
          <p className="text-xs text-muted-foreground">Supplier</p>
          <p className="font-medium">{grn.supplier?.name || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Invoice #</p>
          <p className="font-medium">{grn.invoiceNumber || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Invoice Date</p>
          <p className="font-medium">
            {grn.invoiceDate
              ? format(new Date(grn.invoiceDate), "dd MMM yyyy")
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Items</p>
          <p className="font-medium">{grn.items.length}</p>
        </div>
        {grn.remarks && (
          <div className="col-span-4">
            <p className="text-xs text-muted-foreground">Remarks</p>
            <p className="font-medium">{grn.remarks}</p>
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">#</th>
              <th className="px-4 py-3 text-left font-medium">SKU</th>
              <th className="px-4 py-3 text-left font-medium">Description</th>
              <th className="px-4 py-3 text-right font-medium">Qty</th>
              <th className="px-4 py-3 text-right font-medium">Base Qty</th>
              <th className="px-4 py-3 text-right font-medium">Rate</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 text-left font-medium">Bin</th>
            </tr>
          </thead>
          <tbody>
            {grn.items.map((item, idx) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {item.product?.sku}
                </td>
                <td className="px-4 py-3">{item.product?.description}</td>
                <td className="px-4 py-3 text-right">{item.quantity}</td>
                <td className="px-4 py-3 text-right">{item.baseQuantity}</td>
                <td className="px-4 py-3 text-right">₹{item.rate.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-medium">
                  ₹{(item.quantity * item.rate).toFixed(2)}
                </td>
                <td className="px-4 py-3">{item.bin?.name || "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30">
              <td colSpan={6} className="px-4 py-3 text-right font-semibold">
                Total
              </td>
              <td className="px-4 py-3 text-right font-bold">
                ₹{totalValue.toFixed(2)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
