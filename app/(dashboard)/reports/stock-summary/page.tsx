import { getStockSummaryReport } from "../actions"

export default async function StockSummaryReportPage() {
  const products = await getStockSummaryReport()

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Stock Summary</h2>
        <p className="text-sm text-muted-foreground">
          Current stock levels for all {products.length} active products
        </p>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">SKU</th>
              <th className="px-4 py-3 text-left font-medium">Description</th>
              <th className="px-4 py-3 text-left font-medium">Category</th>
              <th className="px-4 py-3 text-right font-medium">Opening</th>
              <th className="px-4 py-3 text-right font-medium">Current</th>
              <th className="px-4 py-3 text-right font-medium">Min</th>
              <th className="px-4 py-3 text-left font-medium">Unit</th>
              <th className="px-4 py-3 text-left font-medium">Bin</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                <td className="px-4 py-3">{p.description}</td>
                <td className="px-4 py-3">{p.category?.name}</td>
                <td className="px-4 py-3 text-right">{p.openingStock}</td>
                <td className={`px-4 py-3 text-right font-medium ${
                  p.minStock > 0 && p.currentStock <= p.minStock
                    ? "text-destructive"
                    : ""
                }`}>
                  {p.currentStock}
                </td>
                <td className="px-4 py-3 text-right">{p.minStock}</td>
                <td className="px-4 py-3">{p.unit?.abbreviation}</td>
                <td className="px-4 py-3">{p.defaultBin?.name || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
