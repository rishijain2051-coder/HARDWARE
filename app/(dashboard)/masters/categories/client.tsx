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
import { categorySchema, CategoryFormValues } from "./schema"
import { saveCategory, deleteCategory } from "./actions"

export function CategoriesClient({ data, canEdit }: { data: any[]; canEdit?: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      isActive: true,
    },
  })

  const handleOpen = (category?: any) => {
    if (!canEdit) return
    setError(null)
    if (category) {
      setEditingId(category.id)
      form.reset({
        id: category.id,
        name: category.name,
        isActive: category.isActive,
      })
    } else {
      setEditingId(null)
      form.reset({
        name: "",
        isActive: true,
      })
    }
    setIsOpen(true)
  }

  const onSubmit = async (values: CategoryFormValues) => {
    setError(null)
    const result = await saveCategory(values)
    if (result.success) {
      setIsOpen(false)
    } else {
      setError(result.error || "Something went wrong")
    }
  }

  const handleDelete = async (id: string) => {
    if (!canEdit) return
    if (confirm("Are you sure you want to deactivate this category?")) {
      await deleteCategory(id)
    }
  }

  const columns = [
    {
      accessorKey: "name",
      header: ({ column }: any) => (
        <DataTableColumnHeader column={column} title="Category Name" />
      ),
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
    ...(canEdit ? [{
      id: "actions",
      cell: ({ row }: any) => (
        <div className="flex items-center justify-end space-x-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleOpen(row.original)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={() => handleDelete(row.original.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    }] : []),
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Category Master</h2>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchKey="name"
        searchPlaceholder="Search categories..."
        toolbarActions={
          canEdit ? (
            <Button onClick={() => handleOpen()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Category
            </Button>
          ) : undefined
        }
      />

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Category" : "Add Category"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {error && <div className="text-sm text-destructive">{error}</div>}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Hardware" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
