"use client"

import { useState, useRef } from "react"
import { Upload, Download, FileSpreadsheet, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function ImportExportClient() {
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleExportProducts = async () => {
    try {
      const res = await fetch("/api/export/products")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `products-export-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      alert("Export failed")
    }
  }

  const handleExportStoreLog = async () => {
    try {
      const res = await fetch("/api/export/store-log")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `store-log-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      alert("Export failed")
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportResult(null)

    const formData = new FormData()
    formData.append("file", file)

    try {
      const res = await fetch("/api/import/products", {
        method: "POST",
        body: formData,
      })
      const result = await res.json()
      setImportResult(result)
    } catch (error) {
      setImportResult({ success: false, error: "Import failed" })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Import / Export</h2>
        <p className="text-sm text-muted-foreground">
          Import products from Excel or export data
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Import Card */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-3">
              <Upload className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Import Products</h3>
              <p className="text-sm text-muted-foreground">
                Upload an Excel (.xlsx) file to bulk-import products
              </p>
            </div>
          </div>

          <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center">
            <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground mb-3">
              Excel columns: SKU, Description, Category, Unit, Finish, Size,
              MinStock, OpeningStock
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              className="hidden"
              id="import-file"
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
            >
              {importing ? "Importing..." : "Choose File"}
            </Button>
          </div>

          {importResult && (
            <div
              className={`rounded-lg border p-4 ${
                importResult.success
                  ? "border-green-500/50 bg-green-500/10"
                  : "border-destructive/50 bg-destructive/10"
              }`}
            >
              {importResult.success ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-green-600">
                    <Check className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {importResult.imported > 0 && `${importResult.imported} new`}
                      {importResult.imported > 0 && importResult.updated > 0 && ", "}
                      {importResult.updated > 0 && `${importResult.updated} updated`}
                      {importResult.imported === 0 && importResult.updated === 0 && "No changes"}
                      {(importResult.imported > 0 || importResult.updated > 0) && " — done"}
                    </span>
                  </div>
                  {importResult.errors?.length > 0 && (
                    <ul className="text-xs text-amber-600 space-y-1 mt-2">
                      {importResult.errors.slice(0, 10).map((err: string, i: number) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-destructive">
                    <X className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {importResult.error}
                    </span>
                  </div>
                  {importResult.errors?.length > 0 && (
                    <ul className="text-xs text-destructive space-y-1">
                      {importResult.errors.slice(0, 10).map((err: string, i: number) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Export Card */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-3">
              <Download className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Export Data</h3>
              <p className="text-sm text-muted-foreground">
                Download data as Excel spreadsheets
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleExportProducts}
              className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
            >
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Product Master</p>
                <p className="text-xs text-muted-foreground">
                  All products with stock levels
                </p>
              </div>
              <Badge variant="outline" className="ml-auto">
                .xlsx
              </Badge>
            </button>

            <button
              onClick={handleExportStoreLog}
              className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
            >
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Store Log</p>
                <p className="text-xs text-muted-foreground">
                  Transaction history ledger
                </p>
              </div>
              <Badge variant="outline" className="ml-auto">
                .xlsx
              </Badge>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
