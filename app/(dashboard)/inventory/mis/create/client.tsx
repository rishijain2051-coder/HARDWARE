"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { saveMis } from "../actions"
import { ProductCombobox } from "../../components/product-combobox"

interface LineItem {
  productId: string
  quantity: number
  binId: string
}

export function MisCreateClient({
  staff,
  products,
  bins,
  categories,
  units,
  userId,
}: {
  staff: any[]
  products: any[]
  bins: any[]
  categories: any[]
  units: any[]
  userId: string
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [recipientType, setRecipientType] = useState("")
  const [staffId, setStaffId] = useState("")
  const [purpose, setPurpose] = useState("")

  const [items, setItems] = useState<LineItem[]>([
    { productId: "", quantity: 0, binId: "" },
  ])

  const updateItem = (index: number, field: string, value: any) => {
    setItems((prev) =>
      prev.map((item, i) => (i !== index ? item : { ...item, [field]: value }))
    )
  }

  const addItem = () => {
    setItems((prev) => [...prev, { productId: "", quantity: 0, binId: "" }])
  }

  const removeItem = (index: number) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    setError(null)
    if (!recipientType) {
      setError("Please select a recipient type")
      return
    }
    const validItems = items.filter((i) => i.productId && i.quantity > 0)
    if (validItems.length === 0) {
      setError("Please add at least one item with a product and quantity")
      return
    }

    setSaving(true)
    try {
      const result = await saveMis({
        recipientType,
        staffId: staffId || undefined,
        purpose: purpose || undefined,
        items: validItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          binId: i.binId || undefined,
        })),
        createdById: userId,
      })

      if (result.success) {
        router.push("/inventory/mis")
        router.refresh()
      } else {
        setError(result.error || "Failed to save MIS")
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/inventory/mis"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="text-2xl font-bold tracking-tight">New Material Issue</h2>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <h3 className="text-lg font-semibold">MIS Header</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Recipient Type *</label>
            <Select onValueChange={setRecipientType} value={recipientType}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUFACTURING">Manufacturing</SelectItem>
                <SelectItem value="POLISHING">Polishing</SelectItem>
                <SelectItem value="PACKAGING">Packaging</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Staff</label>
            <Select onValueChange={setStaffId} value={staffId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select staff" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {recipientType === "OTHER" && (
            <div className="col-span-2">
              <label className="text-sm font-medium">Purpose</label>
              <Input
                className="mt-1"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Describe the purpose"
              />
            </div>
          )}
        </div>
      </div>

      {/* Line Items */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Line Items</h3>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        </div>

        {/* Mobile card layout */}
        <div className="space-y-4 sm:hidden">
          {items.map((item, index) => {
            const selectedProduct = products.find(
              (p: any) => p.id === item.productId
            )
            return (
              <div key={index} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Item {index + 1}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive h-8 w-8"
                    onClick={() => removeItem(index)}
                    disabled={items.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Product *</label>
                  <ProductCombobox
                    products={products}
                    categories={categories}
                    units={units}
                    value={item.productId}
                    onChange={(v) => updateItem(index, "productId", v)}
                  />
                </div>
                {selectedProduct && (
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                    Available: {selectedProduct.currentStock} {selectedProduct.unit?.abbreviation || ""}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Qty *</label>
                    <Input
                      type="number"
                      value={item.quantity || ""}
                      onChange={(e) =>
                        updateItem(index, "quantity", parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Bin</label>
                    <Select
                      value={item.binId}
                      onValueChange={(v) => updateItem(index, "binId", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        {bins.map((b: any) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Desktop table layout */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">Product *</th>
                <th className="pb-2 font-medium">Available</th>
                <th className="pb-2 font-medium">Qty *</th>
                <th className="pb-2 font-medium">Bin</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const selectedProduct = products.find(
                  (p: any) => p.id === item.productId
                )
                return (
                  <tr key={index} className="border-b last:border-0">
                    <td className="py-2 pr-2 text-muted-foreground">
                      {index + 1}
                    </td>
                    <td className="py-2 pr-2">
                      <div className="w-[300px]">
                        <ProductCombobox
                          products={products}
                          categories={categories}
                          units={units}
                          value={item.productId}
                          onChange={(v) => updateItem(index, "productId", v)}
                        />
                      </div>
                    </td>
                    <td className="py-2 pr-2 text-muted-foreground">
                      {selectedProduct
                        ? `${selectedProduct.currentStock} ${selectedProduct.unit?.abbreviation || ""}`
                        : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        type="number"
                        className="w-20"
                        value={item.quantity || ""}
                        onChange={(e) =>
                          updateItem(
                            index,
                            "quantity",
                            parseFloat(e.target.value) || 0
                          )
                        }
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Select
                        value={item.binId}
                        onValueChange={(v) => updateItem(index, "binId", v)}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          {bins.map((b: any) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => removeItem(index)}
                        disabled={items.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.push("/inventory/mis")}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving..." : "Save MIS"}
        </Button>
      </div>
    </div>
  )
}
