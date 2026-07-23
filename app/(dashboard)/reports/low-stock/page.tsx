import { getLowStockReport } from "../actions"
import { Badge } from "@/components/ui/badge"

export default async function LowStockReportPage() {
  const products = await getLowStockReport()
  const lowStockProducts = products.filter(
    (p) => p.currentStock <= p.minStock
  )

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Low Stock Report</h2>
        <p className="text-sm text-muted-foreground">
          {lowStockProducts.length} products at or below minimum stock
        </p>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">SKU</th>
              <th className="px-4 py-3 text-left font-medium">Description</th>
              <th className="px-4 py-3 text-left font-medium">Category</th>
              <th className="px-4 py-3 text-right font-medium">Current Stock</th>
              <th className="px-4 py-3 text-right font-medium">Min Stock</th>
              <th className="px-4 py-3 text-right font-medium">Deficit</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {lowStockProducts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                  All products are well-stocked!
                </td>
              </tr>
            ) : (
              lowStockProducts.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                  <td className="px-4 py-3">{p.description}</td>
                  <td className="px-4 py-3">{p.category?.name}</td>
                  <td className="px-4 py-3 text-right font-medium text-destructive">
                    {p.currentStock} {p.unit?.abbreviation}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.minStock} {p.unit?.abbreviation}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-destructive">
                    {(p.minStock - p.currentStock).toFixed(1)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={p.currentStock === 0 ? "destructive" : "secondary"}>
                      {p.currentStock === 0 ? "Out of Stock" : "Low Stock"}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
