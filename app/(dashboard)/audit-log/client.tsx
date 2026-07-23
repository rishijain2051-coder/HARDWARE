"use client"

import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"

export function AuditLogClient({ data }: { data: any[] }) {
  const columns = [
    {
      accessorKey: "timestamp",
      header: ({ column }: any) => (
        <DataTableColumnHeader column={column} title="Timestamp" />
      ),
      cell: ({ row }: any) =>
        format(new Date(row.getValue("timestamp")), "dd MMM yyyy, HH:mm:ss"),
    },
    {
      id: "user",
      header: "User",
      accessorFn: (row: any) => row.user?.name || "System",
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }: any) => {
        const action = row.getValue("action")
        const variant =
          action === "CREATE" || action === "LOGIN" || action === "IMPORT"
            ? "default"
            : action === "UPDATE"
            ? "secondary"
            : "destructive"
        return <Badge variant={variant as any}>{action}</Badge>
      },
    },
    {
      accessorKey: "entity",
      header: "Entity",
    },
    {
      accessorKey: "entityId",
      header: "Entity ID",
      cell: ({ row }: any) => (
        <span className="font-mono text-xs">{row.getValue("entityId") || "—"}</span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Audit Log</h2>
        <p className="text-sm text-muted-foreground">
          Track user actions and system changes
        </p>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchKey="entity"
        searchPlaceholder="Search entity..."
      />
    </div>
  )
}
