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
import { saveGrn } from "../actions"
import { ProductCombobox } from "../../components/product-combobox"

interface LineItem {
  productId: string
  productLabel: string
  quantity: number
  baseQuantity: number
  purchaseUnitName: string
  conversionFactor: number
  rate: number
  binId: string
}

export function GrnCreateClient({
  suppliers,
  products,
  bins,
  categories,
  units,
  userId,
}: {
  suppliers: any[]
  products: any[]
  bins: any[]
  categories: any[]
  units: any[]
  userId: string
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [supplierId, setSupplierId] = useState("")
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [invoiceDate, setInvoiceDate] = useState("")
  const [remarks, setRemarks] = useState("")

  const [items, setItems] = useState<LineItem[]>([
    {
      productId: "",
      productLabel: "",
      quantity: 0,
      baseQuantity: 0,
      purchaseUnitName: "",
      conversionFactor: 1,
      rate: 0,
      binId: "",
    },
  ])

  const updateItem = (index: number, field: string, value: any, productData?: any) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const updated = { ...item, [field]: value }
        // Recalculate baseQuantity
        if (field === "quantity" || field === "conversionFactor") {
          updated.baseQuantity = updated.quantity * updated.conversionFactor
        }
        if (field === "productId" && productData) {
          updated.productLabel = `${productData.sku} - ${productData.description}`
          if (productData.lastPurchaseRate) {
            updated.rate = productData.lastPurchaseRate
          }
        }
        return updated
      })
    )
  }

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        productId: "",
        productLabel: "",
        quantity: 0,
        baseQuantity: 0,
        purchaseUnitName: "",
        conversionFactor: 1,
        rate: 0,
        binId: "",
      },
    ])
  }

  const removeItem = (index: number) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    setError(null)
    if (!supplierId) {
      setError("Please select a supplier")
      return
    }
    const validItems = items.filter((i) => i.productId && i.quantity > 0)
    if (validItems.length === 0) {
      setError("Please add at least one item with a product and quantity")
      return
    }

    setSaving(true)
    try {
      const result = await saveGrn({
        supplierId,
        invoiceNumber,
        invoiceDate,
        remarks,
        items: validItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          baseQuantity: i.baseQuantity,
          purchaseUnitName: i.purchaseUnitName || undefined,
          conversionFactor: i.conversionFactor,
          rate: i.rate,
          binId: i.binId || undefined,
        })),
        createdById: userId,
      })

      if (result.success) {
        router.push("/inventory/grn")
        router.refresh()
      } else {
        setError(result.error || "Failed to save GRN")
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/inventory/grn"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="text-2xl font-bold tracking-tight">New GRN</h2>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <h3 className="text-lg font-semibold">GRN Header</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Supplier *</label>
            <Select onValueChange={setSupplierId} value={supplierId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Invoice Number</label>
            <Input
              className="mt-1"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="INV-001"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Invoice Date</label>
            <Input
              className="mt-1"
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Remarks</label>
            <Input
              className="mt-1"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
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

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">Product *</th>
                <th className="pb-2 font-medium">Qty *</th>
                <th className="pb-2 font-medium">Conv. Factor</th>
                <th className="pb-2 font-medium">Base Qty</th>
                <th className="pb-2 font-medium">Rate</th>
                <th className="pb-2 font-medium">Bin</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className="border-b last:border-0">
                  <td className="py-2 pr-2 text-muted-foreground">{index + 1}</td>
                  <td className="py-2 pr-2">
                    <div className="w-[300px]">
                      <ProductCombobox
                        products={products}
                        categories={categories}
                        units={units}
                        value={item.productId}
                        onChange={(v) => updateItem(index, "productId", v)}
                        onProductData={(p) => updateItem(index, "productId", p.id, p)}
                      />
                    </div>
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      type="number"
                      className="w-20"
                      value={item.quantity || ""}
                      onChange={(e) =>
                        updateItem(index, "quantity", parseFloat(e.target.value) || 0)
                      }
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      type="number"
                      className="w-20"
                      value={item.conversionFactor}
                      onChange={(e) =>
                        updateItem(
                          index,
                          "conversionFactor",
                          parseFloat(e.target.value) || 1
                        )
                      }
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <span className="text-muted-foreground">
                      {item.baseQuantity.toFixed(2)}
                    </span>
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      type="number"
                      className="w-24"
                      value={item.rate || ""}
                      onChange={(e) =>
                        updateItem(index, "rate", parseFloat(e.target.value) || 0)
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
                      size="sm"
                      className="text-destructive"
                      onClick={() => removeItem(index)}
                      disabled={items.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.push("/inventory/grn")}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving..." : "Save GRN"}
        </Button>
      </div>
    </div>
  )
}
