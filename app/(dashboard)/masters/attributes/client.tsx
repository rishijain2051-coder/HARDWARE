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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { attributeSchema, AttributeFormValues } from "./schema"
import { saveAttribute, deleteAttribute } from "./actions"

export function AttributesClient({ data, canEdit }: { data: any[]; canEdit?: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<AttributeFormValues>({
    resolver: zodResolver(attributeSchema),
    defaultValues: {
      name: "",
      type: "TEXT",
      isRequired: false,
      isSearchable: false,
      options: [],
    },
  })

  const watchType = form.watch("type")
  // State for raw options text input
  const [optionsText, setOptionsText] = useState("")

  const handleOpen = (attribute?: any) => {
    if (!canEdit) return
    setError(null)
    if (attribute) {
      setEditingId(attribute.id)
      setOptionsText(attribute.options ? attribute.options.join(", ") : "")
      form.reset({
        id: attribute.id,
        name: attribute.name,
        type: attribute.type,
        isRequired: attribute.isRequired,
        isSearchable: attribute.isSearchable,
        options: attribute.options || [],
      })
    } else {
      setEditingId(null)
      setOptionsText("")
      form.reset({
        name: "",
        type: "TEXT",
        isRequired: false,
        isSearchable: false,
        options: [],
      })
    }
    setIsOpen(true)
  }

  const onSubmit = async (values: AttributeFormValues) => {
    setError(null)
    
    // Parse options if dropdown
    if (values.type === "DROPDOWN") {
      values.options = optionsText
        .split(",")
        .map((o) => o.trim())
        .filter((o) => o.length > 0)
    } else {
      values.options = []
    }

    const result = await saveAttribute(values)
    if (result.success) {
      setIsOpen(false)
    } else {
      setError(result.error || "Something went wrong")
    }
  }

  const handleDelete = async (id: string) => {
    if (!canEdit) return
    if (confirm("Are you sure you want to delete this attribute?")) {
      const result = await deleteAttribute(id)
      if (!result.success && result.error) {
        alert(result.error)
      }
    }
  }

  const columns = [
    {
      accessorKey: "name",
      header: ({ column }: any) => (
        <DataTableColumnHeader column={column} title="Attribute Name" />
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }: any) => <Badge variant="outline">{row.getValue("type")}</Badge>
    },
    {
      accessorKey: "isRequired",
      header: "Required",
      cell: ({ row }: any) => (
        <Badge variant={row.getValue("isRequired") ? "default" : "secondary"}>
          {row.getValue("isRequired") ? "Yes" : "No"}
        </Badge>
      ),
    },
    ...(canEdit ? [{
      id: "actions",
      cell: ({ row }: any) => (
        <div className="flex items-center justify-end space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpen(row.original)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
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
        <h2 className="text-2xl font-bold tracking-tight">Attribute Master</h2>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchKey="name"
        searchPlaceholder="Search attributes..."
        toolbarActions={
          canEdit ? (
            <Button onClick={() => handleOpen()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Attribute
            </Button>
          ) : undefined
        }
      />

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Attribute" : "Add Attribute"}
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
                    <FormLabel>Attribute Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Material, Color, etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Attribute Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="TEXT">Text</SelectItem>
                        <SelectItem value="NUMBER">Number</SelectItem>
                        <SelectItem value="DROPDOWN">Dropdown</SelectItem>
                        <SelectItem value="BOOLEAN">Yes/No (Boolean)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchType === "DROPDOWN" && (
                <FormItem>
                  <FormLabel>Options (Comma Separated)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Red, Blue, Green" 
                      value={optionsText}
                      onChange={(e) => setOptionsText(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="isRequired"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Required</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isSearchable"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Searchable</FormLabel>
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
