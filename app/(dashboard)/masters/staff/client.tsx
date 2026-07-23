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
import { staffSchema, StaffFormValues } from "./schema"
import { saveStaff, deleteStaff } from "./actions"

export function StaffClient({ data, canEdit }: { data: any[]; canEdit?: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      name: "",
      department: "",
      employeeCode: "",
      phone: "",
      isActive: true,
    },
  })

  const handleOpen = (staff?: any) => {
    if (!canEdit) return
    setError(null)
    if (staff) {
      setEditingId(staff.id)
      form.reset({
        id: staff.id,
        name: staff.name,
        department: staff.department || "",
        employeeCode: staff.employeeCode || "",
        phone: staff.phone || "",
        isActive: staff.isActive,
      })
    } else {
      setEditingId(null)
      form.reset({
        name: "",
        department: "",
        employeeCode: "",
        phone: "",
        isActive: true,
      })
    }
    setIsOpen(true)
  }

  const onSubmit = async (values: StaffFormValues) => {
    setError(null)
    const result = await saveStaff(values)
    if (result.success) {
      setIsOpen(false)
    } else {
      setError(result.error || "Something went wrong")
    }
  }

  const handleDelete = async (id: string) => {
    if (!canEdit) return
    if (confirm("Are you sure you want to deactivate this staff member?")) {
      const result = await deleteStaff(id)
      if (!result.success && result.error) {
        alert(result.error)
      }
    }
  }

  const columns = [
    {
      accessorKey: "name",
      header: ({ column }: any) => (
        <DataTableColumnHeader column={column} title="Staff Name" />
      ),
    },
    {
      accessorKey: "employeeCode",
      header: "Employee Code",
    },
    {
      accessorKey: "department",
      header: "Department",
    },
    {
      accessorKey: "phone",
      header: "Phone",
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
        <h2 className="text-2xl font-bold tracking-tight">Staff Master</h2>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchKey="name"
        searchPlaceholder="Search staff..."
        toolbarActions={
          canEdit ? (
            <Button onClick={() => handleOpen()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Staff
            </Button>
          ) : undefined
        }
      />

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Staff" : "Add Staff"}
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
                    <FormLabel>Staff Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="employeeCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employee Code</FormLabel>
                      <FormControl>
                        <Input placeholder="EMP001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <FormControl>
                        <Input placeholder="Sales" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        <FormLabel>Active Status</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

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
