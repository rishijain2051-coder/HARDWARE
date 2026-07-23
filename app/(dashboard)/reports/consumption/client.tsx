"use client"

import { useState } from "react"
import { startOfMonth, endOfMonth, format } from "date-fns"
import { Search, Download, FileSpreadsheet } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { getConsumptionReport } from "./actions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function ConsumptionClient({
  staffList,
}: {
  staffList: { id: string; name: string; department: string | null }[]
}) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [startDate, setStartDate] = useState(
    format(startOfMonth(new Date()), "yyyy-MM-dd")
  )
  const [endDate, setEndDate] = useState(
    format(endOfMonth(new Date()), "yyyy-MM-dd")
  )
  const [staffId, setStaffId] = useState<string>("ALL")
  const [hasSearched, setHasSearched] = useState(false)

  const handleSearch = async () => {
    setLoading(true)
    try {
      const result = await getConsumptionReport({
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        staffId,
      })
      setData(result)
      setHasSearched(true)
    } catch (error) {
      console.error(error)
      alert("Failed to load report")
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    {
      accessorKey: "staffName",
      header: ({ column }: any) => (
        <DataTableColumnHeader column={column} title="Staff Member" />
      ),
      cell: ({ row }: any) => (
        <div className="font-semibold text-primary">
          {row.getValue("staffName")}
          <span className="block text-xs font-normal text-muted-foreground">
            {row.original.staffDepartment}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "productSku",
      header: ({ column }: any) => (
        <DataTableColumnHeader column={column} title="SKU" />
      ),
      cell: ({ row }: any) => (
        <span className="font-mono text-xs font-medium">
          {row.getValue("productSku")}
        </span>
      ),
    },
    {
      accessorKey: "productDesc",
      header: ({ column }: any) => (
        <DataTableColumnHeader column={column} title="Product" />
      ),
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }: any) => (
        <Badge variant="outline">{row.getValue("category")}</Badge>
      ),
    },
    {
      accessorKey: "totalConsumed",
      header: ({ column }: any) => (
        <div className="text-right">
          <DataTableColumnHeader column={column} title="Total Consumed" />
        </div>
      ),
      cell: ({ row }: any) => {
        const amount = parseFloat(row.getValue("totalConsumed"))
        return (
          <div className="text-right font-medium">
            {amount.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}{" "}
            <span className="text-muted-foreground text-xs">{row.original.unit}</span>
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Consumption Report</h2>
          <p className="text-sm text-muted-foreground">
            Hardware consumption aggregated by staff member.
          </p>
        </div>
      </div>

      <div className="glass p-4 rounded-xl border border-slate-200/60 shadow-sm space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">From Date</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">To Date</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Staff Member</label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger>
                <SelectValue placeholder="All Staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Staff</SelectItem>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.department})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={handleSearch} disabled={loading}>
              <Search className="mr-2 h-4 w-4" />
              {loading ? "Loading..." : "Generate"}
            </Button>
          </div>
        </div>
      </div>

      {hasSearched && (
        <DataTable
          columns={columns}
          data={data}
          searchKey="productDesc"
          searchPlaceholder="Search products..."
        />
      )}
      {!hasSearched && (
        <div className="glass flex h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200/60 shadow-sm border-dashed">
          <FileSpreadsheet className="mb-4 h-12 w-12 text-slate-300" />
          <h3 className="text-lg font-medium">No Report Generated</h3>
          <p className="text-sm text-muted-foreground max-w-sm text-center mt-1">
            Select a date range and staff member, then click generate to view the consumption report.
          </p>
        </div>
      )}
    </div>
  )
}
