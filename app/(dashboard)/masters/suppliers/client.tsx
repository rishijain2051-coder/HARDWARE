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
import { Textarea } from "@/components/ui/textarea"

import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { supplierSchema, SupplierFormValues } from "./schema"
import { saveSupplier, deleteSupplier } from "./actions"

export function SuppliersClient({ data, canEdit }: { data: any[]; canEdit?: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: "",
      contactPerson: "",
      phone: "",
      email: "",
      gst: "",
      address: "",
      isActive: true,
    },
  })

  const handleOpen = (supplier?: any) => {
    if (!canEdit) return
    setError(null)
    if (supplier) {
      setEditingId(supplier.id)
      form.reset({
        id: supplier.id,
        name: supplier.name,
        contactPerson: supplier.contactPerson || "",
        phone: supplier.phone || "",
        email: supplier.email || "",
        gst: supplier.gst || "",
        address: supplier.address || "",
        isActive: supplier.isActive,
      })
    } else {
      setEditingId(null)
      form.reset({
        name: "",
        contactPerson: "",
        phone: "",
        email: "",
        gst: "",
        address: "",
        isActive: true,
      })
    }
    setIsOpen(true)
  }

  const onSubmit = async (values: SupplierFormValues) => {
    setError(null)
    const result = await saveSupplier(values)
    if (result.success) {
      setIsOpen(false)
    } else {
      setError(result.error || "Something went wrong")
    }
  }

  const handleDelete = async (id: string) => {
    if (!canEdit) return
    if (confirm("Are you sure you want to deactivate this supplier?")) {
      const result = await deleteSupplier(id)
      if (!result.success && result.error) {
        alert(result.error)
      }
    }
  }

  const columns = [
    {
      accessorKey: "name",
      header: ({ column }: any) => (
        <DataTableColumnHeader column={column} title="Supplier Name" />
      ),
    },
    {
      accessorKey: "contactPerson",
      header: "Contact Person",
    },
    {
      accessorKey: "phone",
      header: "Phone",
    },
    {
      accessorKey: "email",
      header: "Email",
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
        <h2 className="text-2xl font-bold tracking-tight">Supplier Master</h2>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchKey="name"
        searchPlaceholder="Search suppliers..."
        toolbarActions={
          canEdit ? (
            <Button onClick={() => handleOpen()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Supplier
            </Button>
          ) : undefined
        }
      />

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Supplier" : "Add Supplier"}
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
                      <FormLabel>Supplier Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Corp" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="+1 234 567 8900" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="john@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gst"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GST / Tax ID</FormLabel>
                      <FormControl>
                        <Input placeholder="GSTIN123456789" {...field} />
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
                        <FormLabel>Active Supplier</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea placeholder="123 Industrial Park, City, Country" {...field} />
                    </FormControl>
                    <FormMessage />
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
