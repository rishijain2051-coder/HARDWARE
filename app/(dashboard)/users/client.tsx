"use client"

import { useState } from "react"
import { format } from "date-fns"
import { Plus, Pencil, Shield } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { saveUser, saveRole } from "./actions"

export function UsersClient({
  data,
  roles,
  permissions,
  canEdit,
}: {
  data: any[]
  roles: any[]
  permissions: any[]
  canEdit: boolean
}) {
  const router = useRouter()

  // User Modal State
  const [userOpen, setUserOpen] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const [userRoleId, setUserRoleId] = useState("")
  const [userIsActive, setUserIsActive] = useState(true)
  const [userPassword, setUserPassword] = useState("")
  const [savingUser, setSavingUser] = useState(false)
  const [userError, setUserError] = useState<string | null>(null)

  // Role Modal State
  const [roleOpen, setRoleOpen] = useState(false)
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [roleName, setRoleName] = useState("")
  const [roleDesc, setRoleDesc] = useState("")
  const [rolePermissions, setRolePermissions] = useState<string[]>([])
  const [savingRole, setSavingRole] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)

  // -- User Handlers --
  const handleEditUser = (user: any) => {
    if (!canEdit) return
    setEditingUserId(user.id)
    setUserName(user.name)
    setUserEmail(user.email)
    setUserRoleId(user.roleId)
    setUserIsActive(user.isActive)
    setUserPassword("") // Reset password field, optional to fill
    setUserError(null)
    setUserOpen(true)
  }

  const handleCreateUser = () => {
    setEditingUserId(null)
    setUserName("")
    setUserEmail("")
    setUserRoleId(roles[0]?.id || "")
    setUserIsActive(true)
    setUserPassword("")
    setUserError(null)
    setUserOpen(true)
  }

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canEdit) return
    setUserError(null)
    setSavingUser(true)
    
    if (!editingUserId && !userPassword) {
        setUserError("Password is required for new users")
        setSavingUser(false)
        return
    }

    const res = await saveUser({
      id: editingUserId || undefined,
      name: userName,
      email: userEmail,
      roleId: userRoleId,
      isActive: userIsActive,
      password: userPassword || undefined,
    })

    if (res.success) {
      setUserOpen(false)
      router.refresh()
    } else {
      setUserError(res.error || "Failed to save user")
    }
    setSavingUser(false)
  }

  // -- Role Handlers --
  const handleEditRole = (role: any) => {
    if (!canEdit) return
    setEditingRoleId(role.id)
    setRoleName(role.name)
    setRoleDesc(role.description || "")
    setRolePermissions(role.permissions.map((p: any) => p.permissionId))
    setRoleError(null)
    setRoleOpen(true)
  }

  const handleCreateRole = () => {
    setEditingRoleId(null)
    setRoleName("")
    setRoleDesc("")
    setRolePermissions([])
    setRoleError(null)
    setRoleOpen(true)
  }

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canEdit) return
    setRoleError(null)
    setSavingRole(true)

    const res = await saveRole({
      id: editingRoleId || undefined,
      name: roleName,
      description: roleDesc,
      permissionIds: rolePermissions,
    })

    if (res.success) {
      setRoleOpen(false)
      router.refresh()
    } else {
      setRoleError(res.error || "Failed to save role")
    }
    setSavingRole(false)
  }

  const togglePermission = (permId: string) => {
    if (!canEdit) return
    setRolePermissions((prev) =>
      prev.includes(permId)
        ? prev.filter((id) => id !== permId)
        : [...prev, permId]
    )
  }

  // Group permissions by module for the UI
  const groupedPermissions = permissions.reduce((acc: any, perm: any) => {
    if (!acc[perm.module]) acc[perm.module] = []
    acc[perm.module].push(perm)
    return acc
  }, {} as Record<string, any[]>)

  // Columns
  const userColumns = [
    {
      accessorKey: "name",
      header: ({ column }: any) => <DataTableColumnHeader column={column} title="Name" />,
    },
    {
      accessorKey: "email",
      header: ({ column }: any) => <DataTableColumnHeader column={column} title="Email" />,
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }: any) => {
        const rName = row.original.role?.name || "User"
        return <Badge variant={rName === "ADMIN" ? "default" : "outline"}>{rName}</Badge>
      },
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }: any) => (
        <Badge variant={row.getValue("isActive") ? "secondary" : "destructive"}>
          {row.getValue("isActive") ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    ...(canEdit ? [{
      id: "actions",
      cell: ({ row }: any) => (
        <div className="flex items-center justify-end space-x-2">
          <Button variant="ghost" size="icon" onClick={() => handleEditUser(row.original)}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      ),
    }] : []),
  ]

  const roleColumns = [
    {
      accessorKey: "name",
      header: ({ column }: any) => <DataTableColumnHeader column={column} title="Role Name" />,
      cell: ({ row }: any) => (
        <div className="flex items-center gap-2 font-medium">
          <Shield className="w-4 h-4 text-primary" />
          {row.getValue("name")}
        </div>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }: any) => <div className="text-muted-foreground">{row.getValue("description") || "—"}</div>,
    },
    {
      id: "usersCount",
      header: "Assigned Users",
      cell: ({ row }: any) => <Badge variant="secondary">{row.original._count?.users || 0} Users</Badge>,
    },
    ...(canEdit ? [{
      id: "actions",
      cell: ({ row }: any) => (
        <div className="flex items-center justify-end space-x-2">
          <Button variant="ghost" size="icon" onClick={() => handleEditRole(row.original)}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      ),
    }] : []),
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Access Management</h2>
          <p className="text-sm text-muted-foreground">Manage system users, roles, and permissions</p>
        </div>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <Button onClick={handleCreateUser}>
                <Plus className="mr-2 h-4 w-4" />
                New User
              </Button>
            </div>
          )}
          <DataTable columns={userColumns} data={data} searchKey="name" searchPlaceholder="Search users..." />
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <Button onClick={handleCreateRole}>
                <Plus className="mr-2 h-4 w-4" />
                New Role
              </Button>
            </div>
          )}
          <DataTable columns={roleColumns} data={roles} searchKey="name" searchPlaceholder="Search roles..." />
        </TabsContent>
      </Tabs>

      {/* User Modal */}
      <Dialog open={userOpen} onOpenChange={setUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUserId ? "Edit User" : "Add User"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUserSubmit} className="space-y-4">
            {userError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {userError}
              </div>
            )}
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={userName} onChange={(e) => setUserName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Password {editingUserId ? "(Leave blank to keep unchanged)" : "*"}</Label>
              <Input type="password" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={userRoleId} onValueChange={setUserRoleId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox id="isActive" checked={userIsActive} onCheckedChange={(c) => setUserIsActive(c as boolean)} />
              <Label htmlFor="isActive">Active (can log in)</Label>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setUserOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savingUser}>{savingUser ? "Saving..." : "Save User"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Role Modal */}
      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRoleId ? "Edit Role" : "Add Role"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRoleSubmit} className="space-y-6">
            {roleError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {roleError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role Name *</Label>
                <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} required placeholder="e.g. Store Manager" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={roleDesc} onChange={(e) => setRoleDesc(e.target.value)} placeholder="Optional description" />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-lg">Permissions</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(groupedPermissions).map(([module, perms]) => (
                  <div key={module} className="bg-muted/30 p-4 rounded-lg border">
                    <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      {module.replace("_", " ")}
                    </h4>
                    <div className="flex flex-wrap gap-4">
                      {(perms as any[]).map((p: any) => (
                        <div key={p.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={p.id}
                            checked={rolePermissions.includes(p.id)}
                            onCheckedChange={() => togglePermission(p.id)}
                          />
                          <Label htmlFor={p.id} className="text-sm font-normal cursor-pointer">
                            {p.action}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setRoleOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savingRole}>{savingRole ? "Saving..." : "Save Role"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
