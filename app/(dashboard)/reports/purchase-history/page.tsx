import { format } from "date-fns"
import { getPurchaseHistoryReport } from "../actions"

export default async function PurchaseHistoryReportPage() {
  const history = await getPurchaseHistoryReport()

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Purchase History</h2>
        <p className="text-sm text-muted-foreground">
          {history.length} purchase records
        </p>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">SKU</th>
              <th className="px-4 py-3 text-left font-medium">Product</th>
              <th className="px-4 py-3 text-left font-medium">Supplier</th>
              <th className="px-4 py-3 text-right font-medium">Qty</th>
              <th className="px-4 py-3 text-right font-medium">Rate</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 text-left font-medium">Invoice #</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-muted-foreground">
                  No purchase history found
                </td>
              </tr>
            ) : (
              history.map((h) => (
                <tr key={h.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    {format(new Date(h.date), "dd MMM yyyy")}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {h.product?.sku}
                  </td>
                  <td className="px-4 py-3">{h.product?.description}</td>
                  <td className="px-4 py-3">{h.supplier?.name}</td>
                  <td className="px-4 py-3 text-right">{h.quantity}</td>
                  <td className="px-4 py-3 text-right">₹{h.rate.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    ₹{(h.rate * h.quantity).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">{h.invoiceNumber || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
