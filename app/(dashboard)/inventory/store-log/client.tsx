"use client"

import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { hardDeleteStoreLog } from "./actions"

export function StoreLogClient({ data, canEdit }: { data: any[]; canEdit: boolean }) {
  const handleDelete = async (id: string) => {
    const isHardDelete = confirm(
      "Are you sure you want to PERMANENTLY delete this Store Log entry? This will rewrite the running balance for this product. Proceed?"
    )
    if (isHardDelete) {
      const res = await hardDeleteStoreLog(id)
      if (res?.error) {
        alert(res.error)
      }
    }
  }

  const columns = [
    {
      accessorKey: "date",
      header: ({ column }: any) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      cell: ({ row }: any) =>
        format(new Date(row.getValue("date")), "dd MMM yyyy, HH:mm"),
    },
    {
      accessorKey: "transactionType",
      header: "Type",
      cell: ({ row }: any) => {
        const type = row.getValue("transactionType")
        const variant =
          type === "GRN"
            ? "default"
            : type === "MIS"
            ? "secondary"
            : "outline"
        return <Badge variant={variant as any}>{type}</Badge>
      },
    },
    {
      accessorKey: "referenceNumber",
      header: "Reference #",
      cell: ({ row }: any) => (
        <span className="font-mono text-xs">{row.getValue("referenceNumber")}</span>
      ),
    },
    {
      id: "product",
      header: "Product",
      accessorFn: (row: any) =>
        `${row.product?.sku || ""} - ${row.product?.description || ""}`,
    },
    {
      accessorKey: "quantity",
      header: ({ column }: any) => (
        <DataTableColumnHeader column={column} title="Qty" />
      ),
      cell: ({ row }: any) => {
        const qty = row.getValue("quantity") as number
        return (
          <span className={qty > 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
            {qty > 0 ? "+" : ""}
            {qty}
          </span>
        )
      },
    },
    {
      accessorKey: "balanceAfter",
      header: "Balance",
      cell: ({ row }: any) => (
        <span className="font-medium">{row.getValue("balanceAfter")}</span>
      ),
    },
    {
      id: "party",
      header: "Supplier / Staff",
      accessorFn: (row: any) =>
        row.supplier?.name || row.staff?.name || "—",
    },
    ...(canEdit ? [{
      id: "actions",
      cell: ({ row }: any) => (
        <div className="flex items-center justify-end space-x-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => handleDelete(row.original.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )
    }] : [])
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Store Log</h2>
        <p className="text-sm text-muted-foreground">
          Complete ledger of all stock movements
        </p>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchKey="referenceNumber"
        searchPlaceholder="Search by reference number..."
      />
    </div>
  )
}
