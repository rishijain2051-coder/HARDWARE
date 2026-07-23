"use client"

import Link from "next/link"
import { format } from "date-fns"
import { Plus, Eye } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"

export function MisListClient({ data, canEdit }: { data: any[]; canEdit?: boolean }) {
  const columns = [
    {
      accessorKey: "misNumber",
      header: ({ column }: any) => (
        <DataTableColumnHeader column={column} title="MIS #" />
      ),
      cell: ({ row }: any) => (
        <span className="font-mono text-xs font-medium">
          {row.getValue("misNumber")}
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
      accessorKey: "recipientType",
      header: "Recipient",
      cell: ({ row }: any) => (
        <Badge variant="outline">{row.getValue("recipientType")}</Badge>
      ),
    },
    {
      id: "staff",
      header: "Staff",
      accessorFn: (row: any) => row.staff?.name || "—",
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
            <Link href={`/inventory/mis/${row.original.id}`}>
              <Eye className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Material Issue Slips</h2>
          <p className="text-sm text-muted-foreground">
            Track outgoing materials issued to departments
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchKey="misNumber"
        searchPlaceholder="Search by MIS number..."
        toolbarActions={
          canEdit ? (
            <Button asChild>
              <Link href="/inventory/mis/create">
                <Plus className="mr-2 h-4 w-4" />
                New MIS
              </Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  )
}
