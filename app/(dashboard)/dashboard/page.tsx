import { prisma } from "@/lib/prisma"
import {
  Package,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  FileInput,
  FileOutput,
  Layers,
} from "lucide-react"

import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"
import type { PermissionSet } from "@/lib/permissions"
import { TXN_LABELS } from "@/lib/labels"

/**
 * The dashboard aggregates data from several modules, so it is assembled from
 * whatever the role is actually allowed to see. A clerk with no product access
 * gets no stock figures — and, just as importantly, we never run the query.
 */
async function getDashboardStats(access: PermissionSet) {
  const showProducts = access.canView("PRODUCT_MASTER")
  const showGrn = access.canView("INWARD_RECORD")
  const showMis = access.canView("OUTWARD_RECORD")
  const showCategories = access.canView("CATEGORY_MASTER")

  const [
    totalProducts,
    activeProducts,
    lowStockCount,
    totalGrns,
    totalMis,
    recentGrns,
    recentMis,
    categoryBreakdown,
  ] = await Promise.all([
    showProducts ? prisma.hardwareProduct.count() : 0,
    showProducts ? prisma.hardwareProduct.count({ where: { isActive: true } }) : 0,
    showProducts
      ? prisma.hardwareProduct.count({
          where: {
            isActive: true,
            currentStock: { lte: prisma.hardwareProduct.fields.minStock },
            minStock: { gt: 0 },
          },
        })
      : 0,
    showGrn ? prisma.grnHeader.count({ where: { isDeleted: false } }) : 0,
    showMis ? prisma.misHeader.count({ where: { isDeleted: false } }) : 0,
    showGrn
      ? prisma.grnHeader.findMany({
          where: { isDeleted: false },
          include: {
            supplier: { select: { name: true } },
            _count: { select: { items: true } },
          },
          orderBy: { date: "desc" },
          take: 5,
        })
      : [],
    showMis
      ? prisma.misHeader.findMany({
          where: { isDeleted: false },
          include: {
            staff: { select: { name: true } },
            _count: { select: { items: true } },
          },
          orderBy: { date: "desc" },
          take: 5,
        })
      : [],
    showProducts && showCategories
      ? prisma.hardwareProduct.groupBy({
          by: ["categoryId"],
          _count: { id: true },
          where: { isActive: true },
        })
      : [],
  ])

  // Get category names
  const categoryIds = categoryBreakdown.map((c: any) => c.categoryId)
  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true },
  })

  const categoryData = categoryBreakdown.map((cb: any) => ({
    name: categories.find((c: any) => c.id === cb.categoryId)?.name || "Unknown",
    count: cb._count.id,
  }))

  return {
    totalProducts,
    activeProducts,
    lowStockCount,
    totalGrns,
    totalMis,
    recentGrns,
    recentMis,
    categoryData,
    showProducts,
    showGrn,
    showMis,
  }
}

export default async function DashboardPage() {
  const gate = await guardPage("DASHBOARD", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  let stats: any
  try {
    stats = await getDashboardStats(gate.access)
  } catch {
    stats = {
      totalProducts: 0,
      activeProducts: 0,
      lowStockCount: 0,
      totalGrns: 0,
      totalMis: 0,
      recentGrns: [],
      recentMis: [],
      categoryData: [],
      showProducts: false,
      showGrn: false,
      showMis: false,
    }
  }

  const cards = [
    {
      label: "Total Products",
      value: stats.totalProducts,
      visible: stats.showProducts,
      icon: <Package className="h-5 w-5" />,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Active Products",
      value: stats.activeProducts,
      visible: stats.showProducts,
      icon: <Layers className="h-5 w-5" />,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Low Stock Alerts",
      value: stats.lowStockCount,
      visible: stats.showProducts,
      icon: <AlertTriangle className="h-5 w-5" />,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      label: `कुल ${TXN_LABELS.inward}`,
      value: stats.totalGrns,
      visible: stats.showGrn,
      icon: <TrendingUp className="h-5 w-5" />,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      label: `कुल ${TXN_LABELS.outward}`,
      value: stats.totalMis,
      visible: stats.showMis,
      icon: <TrendingDown className="h-5 w-5" />,
      color: "text-rose-500",
      bg: "bg-rose-500/10",
    },
  ].filter((card) => card.visible)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          Overview of your hardware store inventory
        </p>
      </div>

      {cards.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Your role doesn&apos;t have access to any of the figures shown here.
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                {card.label}
              </p>
              <div className={`rounded-lg p-2 ${card.bg}`}>
                <span className={card.color}>{card.icon}</span>
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent GRNs */}
        {stats.showGrn && (
        <div className="rounded-xl border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold flex items-center gap-2">
            <FileInput className="h-5 w-5 text-green-500" />
            हाल का {TXN_LABELS.inward}
          </h3>
          {stats.recentGrns.length === 0 ? (
            <p className="text-sm text-muted-foreground">अभी तक कोई {TXN_LABELS.inward} दर्ज नहीं</p>
          ) : (
            <div className="space-y-3">
              {stats.recentGrns.map((grn: any) => (
                <div
                  key={grn.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium font-mono">
                      {grn.grnNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {grn.supplier?.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {new Date(grn.date).toLocaleDateString()}
                    </p>
                    <p className="text-xs">{grn._count?.items} items</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Recent MIS */}
        {stats.showMis && (
        <div className="rounded-xl border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold flex items-center gap-2">
            <FileOutput className="h-5 w-5 text-rose-500" />
            हाल का {TXN_LABELS.outward}
          </h3>
          {stats.recentMis.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              अभी तक कोई {TXN_LABELS.outward} दर्ज नहीं
            </p>
          ) : (
            <div className="space-y-3">
              {stats.recentMis.map((mis: any) => (
                <div
                  key={mis.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium font-mono">
                      {mis.misNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {mis.recipientType} · {mis.staff?.name || "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {new Date(mis.date).toLocaleDateString()}
                    </p>
                    <p className="text-xs">{mis._count?.items} items</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      {/* Category Breakdown */}
      {stats.categoryData.length > 0 && (
        <div className="rounded-xl border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Products by Category</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            {stats.categoryData.map((cat: any) => (
              <div
                key={cat.name}
                className="rounded-lg border p-3 text-center"
              >
                <p className="text-2xl font-bold">{cat.count}</p>
                <p className="text-xs text-muted-foreground">{cat.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
