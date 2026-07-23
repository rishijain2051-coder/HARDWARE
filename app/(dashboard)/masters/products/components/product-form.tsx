"use client"

import { useState, useEffect } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, X } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { productSchema, ProductFormValues } from "../schema"
import { saveProduct } from "../actions"

interface ProductFormProps {
  initialData?: any
  lookups: {
    categories: any[]
    units: any[]
    bins: any[]
    attributes: any[]
  }
}

export function ProductForm({ initialData, lookups }: ProductFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [aliasInput, setAliasInput] = useState("")

  const isEditing = !!initialData

  const form = useForm<ProductFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(productSchema) as any,
    defaultValues: initialData
      ? {
          id: initialData.id,
          sku: initialData.sku,
          previousSku: initialData.previousSku || "",
          description: initialData.description,
          categoryId: initialData.categoryId,
          unitId: initialData.unitId,
          finish: initialData.finish || "",
          size: initialData.size || "",
          minStock: initialData.minStock,
          openingStock: initialData.openingStock,
          defaultBinId: initialData.defaultBinId || "",
          isActive: initialData.isActive,
          aliases: initialData.aliases?.map((a: any) => a.alias) || [],
          attributes:
            initialData.attributeValues?.map((av: any) => ({
              attributeId: av.attributeId,
              value: av.value,
            })) || [],
        }
      : {
          description: "",
          categoryId: "",
          unitId: "",
          finish: "",
          size: "",
          minStock: 0,
          openingStock: 0,
          defaultBinId: "",
          isActive: true,
          aliases: [],
          attributes: [],
        },
  })

  const selectedCategoryId = form.watch("categoryId")
  const aliases = form.watch("aliases")

  // Filter attributes relevant to the selected category
  const relevantAttributes = lookups.attributes.filter(
    (attr: any) =>
      attr.categories.length === 0 ||
      attr.categories.some((ca: any) => ca.categoryId === selectedCategoryId)
  )

  // When category changes, update attribute fields
  useEffect(() => {
    if (!selectedCategoryId) return

    const currentAttrs = form.getValues("attributes")
    const newAttrs = relevantAttributes.map((attr: any) => {
      const existing = currentAttrs.find(
        (ca) => ca.attributeId === attr.id
      )
      return { attributeId: attr.id, value: existing?.value || "" }
    })
    form.setValue("attributes", newAttrs)
  }, [selectedCategoryId])

  const addAlias = () => {
    if (aliasInput.trim() && !aliases.includes(aliasInput.trim())) {
      form.setValue("aliases", [...aliases, aliasInput.trim()])
      setAliasInput("")
    }
  }

  const removeAlias = (index: number) => {
    form.setValue(
      "aliases",
      aliases.filter((_, i) => i !== index)
    )
  }

  const onSubmit = async (values: ProductFormValues) => {
    setError(null)
    setSaving(true)
    try {
      const result = await saveProduct(values)
      if (result.success) {
        router.push("/masters/products")
        router.refresh()
      } else {
        setError(result.error || "Failed to save product")
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/masters/products"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {isEditing ? "Edit Product" : "Add Product"}
          </h2>
          {isEditing && (
            <p className="text-sm text-muted-foreground">
              SKU: {initialData.sku}
            </p>
          )}
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Basic Info Card */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h3 className="text-lg font-semibold">Basic Information</h3>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="M.S. Round Bar 12mm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {lookups.categories.map((cat: any) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {lookups.units.map((unit: any) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.abbreviation})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU {!isEditing && "(auto)"}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Auto-generated"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="finish"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Finish</FormLabel>
                    <FormControl>
                      <Input placeholder="Galvanized" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="size"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Size</FormLabel>
                    <FormControl>
                      <Input placeholder="12mm" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="minStock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min Stock Level</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              {!isEditing && (
                <FormField
                  control={form.control}
                  name="openingStock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Opening Stock</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="defaultBinId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Bin</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {lookups.bins.map((bin: any) => (
                          <SelectItem key={bin.id} value={bin.id}>
                            {bin.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    <FormLabel>Active Product</FormLabel>
                  </div>
                </FormItem>
              )}
            />
          </div>

          {/* Aliases Card */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h3 className="text-lg font-semibold">Aliases / Alternate Names</h3>
            <p className="text-sm text-muted-foreground">
              Add alternative names staff might use to search for this product
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Add alias..."
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addAlias()
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addAlias}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {aliases.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {aliases.map((alias, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm"
                  >
                    {alias}
                    <button
                      type="button"
                      onClick={() => removeAlias(idx)}
                      className="rounded-full p-0.5 hover:bg-background"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Dynamic Attributes Card */}
          {relevantAttributes.length > 0 && (
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <h3 className="text-lg font-semibold">Product Attributes</h3>
              <div className="grid grid-cols-2 gap-4">
                {relevantAttributes.map((attr: any, idx: number) => {
                  const attrIndex = form
                    .getValues("attributes")
                    .findIndex((a) => a.attributeId === attr.id)
                  if (attrIndex === -1) return null

                  return (
                    <FormField
                      key={attr.id}
                      control={form.control}
                      name={`attributes.${attrIndex}.value`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {attr.name}
                            {attr.isRequired && " *"}
                          </FormLabel>
                          <FormControl>
                            {attr.type === "DROPDOWN" ? (
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {attr.options.map((opt: string) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : attr.type === "BOOLEAN" ? (
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Yes">Yes</SelectItem>
                                  <SelectItem value="No">No</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                type={attr.type === "NUMBER" ? "number" : "text"}
                                {...field}
                              />
                            )}
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/masters/products")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : isEditing ? "Update Product" : "Create Product"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
