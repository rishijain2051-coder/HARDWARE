"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, Pencil, Trash2, Package } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { deleteProduct } from "./actions"
import { usePermissions } from "@/components/permission-provider"

export function ProductsClient({
  data,
  categories,
}: {
  data: any[]
  categories: any[]
}) {
  const perms = usePermissions()
  const canCreate = perms.can("PRODUCT_MASTER", "CREATE")
  const canEdit = perms.can("PRODUCT_MASTER", "EDIT")
  const canDelete = perms.can("PRODUCT_MASTER", "DELETE")

  const handleDelete = async (id: string) => {
    if (!canDelete) return
    const hardDelete = confirm("Do you want to PERMANENTLY delete this product from the database?\n\nClick OK to permanently delete.\nClick Cancel to just deactivate it.")
    
    if (!hardDelete) {
      if (!confirm("Are you sure you want to deactivate this product?")) return;
    }

    const res = await deleteProduct(id, hardDelete)
    if (res?.error) {
      alert(res.error)
    }
  }

  const columns = [
    {
      accessorKey: "sku",
      header: ({ column }: any) => (
        <DataTableColumnHeader column={column} title="SKU" />
      ),
      cell: ({ row }: any) => (
        <span className="font-mono text-xs font-medium">
          {row.getValue("sku")}
        </span>
      ),
    },
    {
      accessorKey: "description",
      header: ({ column }: any) => (
        <DataTableColumnHeader column={column} title="Description" />
      ),
      cell: ({ row }: any) => (
        <div className="font-medium">{row.getValue("description")}</div>
      ),
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }: any) => {
        const cat = row.original.category?.name
        return cat ? <Badge variant="outline">{cat}</Badge> : "—"
      },
    },
    {
      accessorKey: "unit",
      header: "Unit",
      cell: ({ row }: any) => row.original.unit?.name || "—",
    },
    {
      accessorKey: "defaultBin",
      header: "Bin",
      cell: ({ row }: any) => row.original.defaultBin?.name || "—",
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }: any) => (
        <Badge variant={row.getValue("isActive") ? "secondary" : "destructive"}>
          {row.getValue("isActive") ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    // The row-actions column disappears entirely for a read-only role.
    ...(canEdit || canDelete ? [{
      id: "actions",
      cell: ({ row }: any) => (
        <div className="flex items-center justify-end space-x-2">
          {canEdit && (
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/masters/products/${row.original.id}/edit`}>
                <Pencil className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              onClick={() => handleDelete(row.original.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    }] : []),
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Products</h2>
          <p className="text-sm text-muted-foreground">
            Manage your hardware inventory items
          </p>
        </div>
        {canCreate && (
          <Button asChild className="w-full sm:w-auto">
            <Link href="/masters/products/create">
              <Plus className="mr-2 h-4 w-4" />
              New Product
            </Link>
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchKey="description"
        searchPlaceholder="Search products by description..."
      />
    </div>
  )
}
