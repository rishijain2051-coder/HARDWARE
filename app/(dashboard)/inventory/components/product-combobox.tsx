"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Search, Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { QuickAddProductModal } from "./quick-add-product-modal"
import { usePermissions } from "@/components/permission-provider"
import { invalidateLookups, useLookup } from "@/components/lookup-cache"
import type { ProductRecord } from "@/lib/lookups/types"

// Fuzzy token filter for Command
function fuzzyFilter(value: string, search: string, keywords?: string[]) {
  const searchTokens = search.toLowerCase().split(/[\s,]+/).filter(Boolean)
  const targetText = value.toLowerCase()
  const keywordText = (keywords || []).join(" ").toLowerCase()

  // All tokens must be present somewhere in the value or keywords
  for (const token of searchTokens) {
    if (!targetText.includes(token) && !keywordText.includes(token)) {
      return 0 // 0 means no match
    }
  }
  return 1 // Match
}

export function ProductCombobox({
  value,
  onChange,
  onProductData,
}: {
  value: string
  onChange: (value: string) => void
  onProductData?: (product: ProductRecord) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [quickAddOpen, setQuickAddOpen] = React.useState(false)

  // The product list comes from the browser cache rather than the page payload.
  // A सामान आया form has one of these per line item, and they all read the same
  // cache entry, so ten line items still cost zero extra requests.
  const { rows: products, loading } = useLookup("products")

  // Quick-add writes to the product master, which is a separate grant from
  // being allowed to book a GRN or MIS. Hide it rather than let the user fill
  // in the form and get rejected by `saveProduct`.
  const canQuickAdd = usePermissions().can("PRODUCT_MASTER", "CREATE")

  // the selected product
  const selectedProduct = products.find((p) => p.id === value)

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={loading}
            className="w-full justify-between h-auto min-h-10 py-2"
          >
            {loading ? (
              <span className="text-muted-foreground">Loading products...</span>
            ) : selectedProduct ? (
              <div className="flex items-center gap-3 text-left">
                {selectedProduct.imageUrl ? (
                  <img src={selectedProduct.imageUrl} alt="" className="w-8 h-8 rounded object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-[10px] uppercase text-muted-foreground">Img</div>
                )}
                <div>
                  <div className="font-medium text-sm">{selectedProduct.description}</div>
                  <div className="text-xs text-muted-foreground">{selectedProduct.sku}</div>
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground">Select product...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[400px] p-0" align="start">
          <Command filter={fuzzyFilter}>
            <CommandInput placeholder="Search product (e.g., screw 5/16)..." />
            <CommandList>
              <CommandEmpty className="p-4 flex flex-col items-center justify-center text-sm text-muted-foreground">
                <p className={canQuickAdd ? "mb-4" : ""}>No product found.</p>
                {canQuickAdd && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setOpen(false)
                      setQuickAddOpen(true)
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Quick Add Product
                  </Button>
                )}
              </CommandEmpty>
              <CommandGroup>
                {products.map((product) => {
                  const keywords = product.aliases.map((a) => a.alias)
                  keywords.push(product.sku)

                  return (
                    <CommandItem
                      key={product.id}
                      value={product.description} // Value used for matching (plus keywords)
                      keywords={keywords}
                      onSelect={() => {
                        onChange(product.id)
                        if (onProductData) onProductData(product)
                        setOpen(false)
                      }}
                      className="flex items-center gap-3 py-3"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          value === product.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-[10px] uppercase shrink-0 text-muted-foreground">Img</div>
                      )}
                      <div className="flex-1 overflow-hidden">
                        <div className="font-medium truncate">{product.description}</div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                          <span>{product.sku}</span>
                          {product.lastPurchaseRate != null && (
                            <span className="text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded font-medium">
                              Last: ₹{product.lastPurchaseRate}
                            </span>
                          )}
                        </div>
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <QuickAddProductModal
        open={quickAddOpen && canQuickAdd}
        onOpenChange={setQuickAddOpen}
        onSuccess={() => {
          // Drop the cached list so the new product appears. This replaces a
          // router.refresh() and a blind 500ms wait for it to land: the refetch
          // is scoped to the product list, and every combobox on the form picks
          // up the result at the same time.
          invalidateLookups("products")
          setQuickAddOpen(false)
        }}
      />
    </>
  )
}
