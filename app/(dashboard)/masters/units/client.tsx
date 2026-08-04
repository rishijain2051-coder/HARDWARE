"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus, Pencil, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"

import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { unitSchema, UnitFormValues } from "./schema"
import { saveUnit, deleteUnit } from "./actions"
import { usePermissions } from "@/components/permission-provider"
import { invalidateAfter, useDatasetRows } from "@/components/dataset-cache"

export function UnitsClient() {
  const { rows: data, loading, error: loadError } = useDatasetRows("unitRows")

  const perms = usePermissions()
  const canCreate = perms.can("UNIT_MASTER", "CREATE")
  const canEdit = perms.can("UNIT_MASTER", "EDIT")
  const canDelete = perms.can("UNIT_MASTER", "DELETE")

  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<UnitFormValues>({
    resolver: zodResolver(unitSchema),
    defaultValues: {
      name: "",
      abbreviation: "",
      isActive: true,
    },
  })

  const handleOpen = (unit?: any) => {
    if (unit ? !canEdit : !canCreate) return
    setError(null)
    if (unit) {
      setEditingId(unit.id)
      form.reset({
        id: unit.id,
        name: unit.name,
        abbreviation: unit.abbreviation,
        isActive: unit.isActive,
      })
    } else {
      setEditingId(null)
      form.reset({
        name: "",
        abbreviation: "",
        isActive: true,
      })
    }
    setIsOpen(true)
  }

  const onSubmit = async (values: UnitFormValues) => {
    setError(null)
    const result = await saveUnit(values)
    if (result.success) {
      invalidateAfter("units")
      setIsOpen(false)
    } else {
      setError(result.error || "Something went wrong")
    }
  }

  const handleDelete = async (id: string) => {
    if (!canDelete) return
    if (confirm("Are you sure you want to deactivate this unit?")) {
      await deleteUnit(id)
      invalidateAfter("units")
    }
  }

  const columns = [
    {
      accessorKey: "name",
      header: ({ column }: any) => (
        <DataTableColumnHeader column={column} title="Unit Name" />
      ),
    },
    {
      accessorKey: "abbreviation",
      header: "Abbreviation",
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }: any) => {
        const isActive = row.getValue("isActive")
        return (
          <Badge variant={isActive ? "default" : "secondary"}>
            {isActive ? "Active" : "Inactive"}
          </Badge>
        )
      },
    },
    // The row-actions column disappears entirely for a read-only role.
    ...(canEdit || canDelete ? [{
      id: "actions",
      cell: ({ row }: any) => (
        <div className="flex items-center justify-end space-x-2">
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleOpen(row.original)}
            >
              <Pencil className="h-4 w-4" />
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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Units Master</h2>
      </div>

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        error={loadError}
        searchKey="name"
        searchPlaceholder="Search units..."
        toolbarActions={
          canCreate ? (
            <Button onClick={() => handleOpen()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Unit
            </Button>
          ) : undefined
        }
      />

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Unit" : "Add Unit"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {error && <div className="text-sm text-destructive">{error}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Kilogram" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="abbreviation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Abbreviation</FormLabel>
                      <FormControl>
                        <Input placeholder="kg" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Active</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
