"use client"

import { Check, Minus } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ACTION_HINTS,
  ACTION_LABELS,
  ACTION_ORDER,
  MODULES_BY_GROUP,
  permissionKey,
  type ModuleDefinition,
  type PermissionAction,
} from "@/lib/permissions"

/**
 * A permission row per module, a column per action.
 *
 * The previous editor rendered a flat list of whatever rows happened to be in
 * the `permissions` table, so it couldn't show which actions a module supports,
 * couldn't group them, and offered no way to grant a whole module at once.
 */

export interface PermissionRow {
  id: string
  module: string
  action: string
}

export function PermissionMatrix({
  permissions,
  selectedIds,
  onChange,
  disabled = false,
}: {
  permissions: PermissionRow[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  // "MODULE:ACTION" -> permission row id, so the UI can talk in module/action
  // terms while the server still stores opaque ids.
  const idByKey = new Map(
    permissions.map((p) => [permissionKey(p.module, p.action), p.id])
  )
  const selected = new Set(selectedIds)

  const idFor = (module: string, action: PermissionAction) =>
    idByKey.get(permissionKey(module, action))

  const isChecked = (module: string, action: PermissionAction) => {
    const id = idFor(module, action)
    return id ? selected.has(id) : false
  }

  const grantedIdsFor = (m: ModuleDefinition) =>
    m.actions.map((a) => idFor(m.key, a)).filter((id): id is string => Boolean(id))

  const setMany = (ids: string[], on: boolean) => {
    if (disabled) return
    const next = new Set(selected)
    for (const id of ids) {
      if (on) next.add(id)
      else next.delete(id)
    }
    onChange([...next])
  }

  const toggle = (module: string, action: PermissionAction) => {
    const id = idFor(module, action)
    if (!id) return
    // VIEW is the gate for the whole module: removing it removes everything
    // else, and granting any other action implies being able to look at it.
    if (action === "VIEW" && isChecked(module, "VIEW")) {
      setMany(
        ACTION_ORDER.map((a) => idFor(module, a)).filter((x): x is string => Boolean(x)),
        false
      )
      return
    }
    if (action !== "VIEW" && !isChecked(module, action)) {
      const viewId = idFor(module, "VIEW")
      setMany(viewId ? [id, viewId] : [id], true)
      return
    }
    setMany([id], !selected.has(id))
  }

  const moduleState = (m: ModuleDefinition) => {
    const ids = grantedIdsFor(m)
    const on = ids.filter((id) => selected.has(id)).length
    if (on === 0) return "none" as const
    if (on === ids.length) return "all" as const
    return "some" as const
  }

  return (
    <div className="space-y-6">
      {MODULES_BY_GROUP.map(({ group, modules }) => {
        const groupIds = modules.flatMap(grantedIdsFor)
        const groupOn = groupIds.filter((id) => selected.has(id)).length
        const allOn = groupOn === groupIds.length && groupIds.length > 0

        return (
          <div key={group} className="rounded-lg border">
            <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold">{group}</h4>
                <Badge variant="secondary" className="text-[10px]">
                  {groupOn}/{groupIds.length}
                </Badge>
              </div>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setMany(groupIds, !allOn)}
                >
                  {allOn ? "Clear all" : "Select all"}
                </Button>
              )}
            </div>

            <div className="divide-y">
              {modules.map((m) => {
                const state = moduleState(m)
                return (
                  <div
                    key={m.key}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 sm:w-64">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => setMany(grantedIdsFor(m), state !== "all")}
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded border text-primary-foreground transition-colors disabled:opacity-50 data-[state=all]:border-primary data-[state=all]:bg-primary data-[state=some]:border-primary data-[state=some]:bg-primary/60 data-[state=none]:border-input"
                          data-state={state}
                          aria-label={`Toggle all ${m.label} permissions`}
                        >
                          {state === "all" && <Check className="h-3 w-3" />}
                          {state === "some" && <Minus className="h-3 w-3" />}
                        </button>
                        <p className="truncate text-sm font-medium">{m.label}</p>
                      </div>
                      <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
                        {m.description}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-2 pl-6 sm:pl-0">
                      {ACTION_ORDER.map((action) => {
                        const supported = m.actions.includes(action)
                        const id = idFor(m.key, action)

                        // Keep a fixed-width slot per action so the columns
                        // line up across rows even when a module doesn't
                        // support that action.
                        if (!supported || !id) {
                          return (
                            <span
                              key={action}
                              className="w-[74px] text-xs text-muted-foreground/30"
                              aria-hidden
                            >
                              —
                            </span>
                          )
                        }

                        return (
                          <label
                            key={action}
                            title={ACTION_HINTS[action]}
                            className={`flex w-[74px] items-center gap-1.5 text-xs ${
                              disabled ? "opacity-60" : "cursor-pointer"
                            }`}
                          >
                            <Checkbox
                              checked={isChecked(m.key, action)}
                              disabled={disabled}
                              onCheckedChange={() => toggle(m.key, action)}
                            />
                            <span>{ACTION_LABELS[action]}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
