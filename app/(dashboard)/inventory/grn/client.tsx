"use client"

import Link from "next/link"
import { format } from "date-fns"
import { Plus, Eye } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { usePermissions } from "@/components/permission-provider"
import { useDatasetRows } from "@/components/dataset-cache"
import { TXN_LABELS } from "@/lib/labels"

export function GrnListClient() {
  const { rows: data, loading, error } = useDatasetRows("grnList")

  const perms = usePermissions()
  const canCreate = perms.can("INWARD_RECORD", "CREATE")

  const columns = [
    {
      accessorKey: "grnNumber",
      header: ({ column }: any) => (
        <DataTableColumnHeader column={column} title={`${TXN_LABELS.inward} #`} />
      ),
      cell: ({ row }: any) => (
        <span className="font-mono text-xs font-medium">
          {row.getValue("grnNumber")}
        </span>
      ),
    },
    {
      accessorKey: "date",
      header: ({ column }: any) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      cell: ({ row }: any) => format(new Date(row.getValue("date")), "dd MMM yyyy"),
    },
    {
      id: "supplier",
      header: "Supplier",
      accessorFn: (row: any) => row.supplier?.name || "—",
    },
    {
      accessorKey: "invoiceNumber",
      header: "Invoice #",
      cell: ({ row }: any) => row.getValue("invoiceNumber") || "—",
    },
    {
      id: "items",
      header: "Items",
      cell: ({ row }: any) => (
        <Badge variant="outline">{row.original._count?.items || 0}</Badge>
      ),
    },
    {
      id: "createdBy",
      header: "Created By",
      accessorFn: (row: any) => row.createdBy?.name || "—",
    },
    {
      id: "actions",
      cell: ({ row }: any) => (
        <div className="flex items-center justify-end space-x-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/inventory/grn/${row.original.id}`}>
              <Eye className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{TXN_LABELS.inward}</h2>
          <p className="text-sm text-muted-foreground">
            Track incoming hardware from suppliers
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        error={error}
        searchKey="grnNumber"
        searchPlaceholder={`${TXN_LABELS.inward} नंबर से खोजें...`}
        toolbarActions={
          canCreate ? (
            <Button asChild>
              <Link href="/inventory/grn/create">
                <Plus className="mr-2 h-4 w-4" />
                नया {TXN_LABELS.inward}
              </Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  )
}
