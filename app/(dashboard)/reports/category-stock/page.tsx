import { getCategoryStockReport } from "../actions"
import { Badge } from "@/components/ui/badge"

export default async function CategoryStockReportPage() {
  const categories = await getCategoryStockReport()

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Category Stock Report</h2>
        <p className="text-sm text-muted-foreground">
          Stock summary grouped by category
        </p>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Category</th>
              <th className="px-4 py-3 text-right font-medium">Products</th>
              <th className="px-4 py-3 text-right font-medium">Total Stock</th>
              <th className="px-4 py-3 text-right font-medium">Low Stock Items</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-right">{c.totalProducts}</td>
                <td className="px-4 py-3 text-right">{c.totalStock.toFixed(1)}</td>
                <td className="px-4 py-3 text-right">
                  {c.lowStockCount > 0 ? (
                    <Badge variant="destructive">{c.lowStockCount}</Badge>
                  ) : (
                    <Badge variant="outline">0</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
