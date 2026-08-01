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

import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"
import type { ModuleKey } from "@/lib/permissions"

/**
 * Each card declares the module it actually lands on. The Store Log card, for
 * example, links out of Reports into the inventory ledger — so it is hidden
 * unless the role can view that ledger, rather than dead-ending on a denial.
 */
const reports: {
  title: string
  description: string
  href: string
  module: ModuleKey
  icon: React.ReactNode
  color: string
  bg: string
}[] = [
  {
    title: "Low Stock Report",
    description: "Products at or below minimum stock level",
    href: "/reports/low-stock",
    module: "REPORTS",
    icon: <AlertTriangle className="h-6 w-6" />,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    title: "Stock Summary",
    description: "Current stock levels for all products",
    href: "/reports/stock-summary",
    module: "REPORTS",
    icon: <Package className="h-6 w-6" />,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    title: "Purchase History",
    description: "Purchase records with rate tracking",
    href: "/reports/purchase-history",
    module: "REPORTS",
    icon: <ShoppingCart className="h-6 w-6" />,
    color: "text-green-500",
    bg: "bg-green-500/10",
  },
  {
    title: "Supplier Report",
    description: "Supplier-wise purchase summary",
    href: "/reports/supplier-wise",
    module: "REPORTS",
    icon: <Building2 className="h-6 w-6" />,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  {
    title: "Category Stock",
    description: "Stock summary by category",
    href: "/reports/category-stock",
    module: "REPORTS",
    icon: <Layers className="h-6 w-6" />,
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
  },
  {
    title: "Store Log Report",
    description: "Complete transaction ledger",
    href: "/inventory/store-log",
    module: "STORE_LOG",
    icon: <FileSpreadsheet className="h-6 w-6" />,
    color: "text-teal-500",
    bg: "bg-teal-500/10",
  },
  {
    title: "Consumption Report",
    description: "Hardware consumption by staff",
    href: "/reports/consumption",
    module: "REPORTS",
    icon: <Users className="h-6 w-6" />,
    color: "text-rose-500",
    bg: "bg-rose-500/10",
  },
]

export default async function ReportsPage() {
  const gate = await guardPage("REPORTS", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const visibleReports = reports.filter((r) => gate.access.canView(r.module))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Reports</h2>
        <p className="text-sm text-muted-foreground">
          Generate and export inventory reports
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visibleReports.map((report) => (
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
