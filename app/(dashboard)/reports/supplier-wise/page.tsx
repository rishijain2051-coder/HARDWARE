import { getSupplierWiseReport } from "../actions"

export default async function SupplierWiseReportPage() {
  const suppliers = await getSupplierWiseReport()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Supplier Report</h2>
        <p className="text-sm text-muted-foreground">
          Purchase summary by supplier
        </p>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Supplier</th>
              <th className="px-4 py-3 text-right font-medium">Total GRNs</th>
              <th className="px-4 py-3 text-right font-medium">Total Purchases</th>
              <th className="px-4 py-3 text-right font-medium">Total Value</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-right">{s.totalGrns}</td>
                <td className="px-4 py-3 text-right">{s.totalPurchases}</td>
                <td className="px-4 py-3 text-right font-medium">
                  ₹{s.totalValue.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
