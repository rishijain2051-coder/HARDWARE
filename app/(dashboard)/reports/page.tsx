import Link from "next/link"
import {
  AlertTriangle,
  Package,
  ShoppingCart,
  Building2,
  Layers,
  FileSpreadsheet,
  Users,
} from "lucide-react"

const reports = [
  {
    title: "Low Stock Report",
    description: "Products at or below minimum stock level",
    href: "/reports/low-stock",
    icon: <AlertTriangle className="h-6 w-6" />,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    title: "Stock Summary",
    description: "Current stock levels for all products",
    href: "/reports/stock-summary",
    icon: <Package className="h-6 w-6" />,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    title: "Purchase History",
    description: "Purchase records with rate tracking",
    href: "/reports/purchase-history",
    icon: <ShoppingCart className="h-6 w-6" />,
    color: "text-green-500",
    bg: "bg-green-500/10",
  },
  {
    title: "Supplier Report",
    description: "Supplier-wise purchase summary",
    href: "/reports/supplier-wise",
    icon: <Building2 className="h-6 w-6" />,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  {
    title: "Category Stock",
    description: "Stock summary by category",
    href: "/reports/category-stock",
    icon: <Layers className="h-6 w-6" />,
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
  },
  {
    title: "Store Log Report",
    description: "Complete transaction ledger",
    href: "/inventory/store-log",
    icon: <FileSpreadsheet className="h-6 w-6" />,
    color: "text-teal-500",
    bg: "bg-teal-500/10",
  },
  {
    title: "Consumption Report",
    description: "Hardware consumption by staff",
    href: "/reports/consumption",
    icon: <Users className="h-6 w-6" />,
    color: "text-rose-500",
    bg: "bg-rose-500/10",
  },
]

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Reports</h2>
        <p className="text-sm text-muted-foreground">
          Generate and export inventory reports
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <Link key={report.href} href={report.href}>
            <div className="group rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/30">
              <div className={`mb-4 inline-flex rounded-lg p-3 ${report.bg}`}>
                <span className={report.color}>{report.icon}</span>
              </div>
              <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
                {report.title}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {report.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
