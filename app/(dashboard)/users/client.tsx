"use client"

import { useState } from "react"
import { Plus, Pencil, Shield, ShieldCheck, Trash2, Lock } from "lucide-react"
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

import { usePermissions } from "@/components/permission-provider"
import { PermissionMatrix, type PermissionRow } from "./permission-matrix"
import { saveUser, saveRole, deleteRole } from "./actions"

export function UsersClient({
  data,
  roles,
  permissions,
  currentUserId,
  currentRoleId,
}: {
  data: any[]
  roles: any[]
  permissions: PermissionRow[]
  currentUserId: string
  currentRoleId: string
}) {
  const router = useRouter()
  const perms = usePermissions()

  const canCreate = perms.can("USER_MANAGEMENT", "CREATE")
  const canEdit = perms.can("USER_MANAGEMENT", "EDIT")
  const canDelete = perms.can("USER_MANAGEMENT", "DELETE")
  const isSuperAdmin = perms.isSuperAdmin

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
  const [editingRoleLocked, setEditingRoleLocked] = useState(false)
  const [roleName, setRoleName] = useState("")
  const [roleDesc, setRoleDesc] = useState("")
  const [rolePermissions, setRolePermissions] = useState<string[]>([])
  const [savingRole, setSavingRole] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)

  const isEditingOwnRole = editingRoleId === currentRoleId

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
    if (!canCreate) return
    setEditingUserId(null)
    setUserName("")
    setUserEmail("")
    setUserRoleId(assignableRoles[0]?.id || "")
    setUserIsActive(true)
    setUserPassword("")
    setUserError(null)
    setUserOpen(true)
  }

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editingUserId ? !canEdit : !canCreate) return
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
    // The super-admin role has implicit full access; there is nothing to tick.
    setEditingRoleLocked(Boolean(role.isSuperAdmin))
    setRoleName(role.name)
    setRoleDesc(role.description || "")
    setRolePermissions(role.permissions.map((p: any) => p.permissionId))
    setRoleError(null)
    setRoleOpen(true)
  }

  const handleCreateRole = () => {
    if (!canCreate) return
    setEditingRoleId(null)
    setEditingRoleLocked(false)
    setRoleName("")
    setRoleDesc("")
    setRolePermissions([])
    setRoleError(null)
    setRoleOpen(true)
  }

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editingRoleId ? !canEdit : !canCreate) return
    if (editingRoleLocked) return
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

  const handleDeleteRole = async (role: any) => {
    if (!canDelete) return
    if (
      !confirm(
        `Delete the "${role.name}" role? This cannot be undone.`
      )
    )
      return
    const res = await deleteRole(role.id)
    if (res.success) router.refresh()
    else alert(res.error || "Failed to delete role")
  }

  // Only a super admin can hand out the super-admin role — mirrors saveUser.
  const assignableRoles = roles.filter((r) => isSuperAdmin || !r.isSuperAdmin)

  /** Count of granted permissions, used for the at-a-glance role summary. */
  const permissionCount = (role: any) =>
    role.isSuperAdmin ? permissions.length : role.permissions.length

  // Columns
  const userColumns = [
    {
      accessorKey: "name",
      header: ({ column }: any) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }: any) => (
        <div className="flex items-center gap-2 font-medium">
          {row.original.name}
          {row.original.id === currentUserId && (
            <Badge variant="outline" className="text-[10px]">You</Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: ({ column }: any) => <DataTableColumnHeader column={column} title="Email" />,
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }: any) => {
        const role = row.original.role
        return (
          <Badge variant={role?.isSuperAdmin ? "default" : "outline"}>
            {role?.name || "—"}
          </Badge>
        )
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
          {row.original.isSuperAdmin ? (
            <ShieldCheck className="h-4 w-4 text-primary" />
          ) : (
            <Shield className="h-4 w-4 text-muted-foreground" />
          )}
          {row.getValue("name")}
          {row.original.isSystem && (
            <Badge variant="outline" className="text-[10px]">Built-in</Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }: any) => (
        <div className="max-w-md text-muted-foreground">
          {row.getValue("description") || "—"}
        </div>
      ),
    },
    {
      id: "permissions",
      header: "Permissions",
      cell: ({ row }: any) =>
        row.original.isSuperAdmin ? (
          <Badge>Full access</Badge>
        ) : (
          <Badge variant="secondary">
            {permissionCount(row.original)} of {permissions.length}
          </Badge>
        ),
    },
    {
      id: "usersCount",
      header: "Assigned Users",
      cell: ({ row }: any) => (
        <Badge variant="secondary">{row.original._count?.users || 0} Users</Badge>
      ),
    },
    ...(canEdit || canDelete ? [{
      id: "actions",
      cell: ({ row }: any) => {
        const role = row.original
        const locked = role.isSuperAdmin
        return (
          <div className="flex items-center justify-end space-x-2">
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                disabled={locked}
                title={locked ? "The administrator role always has full access" : "Edit role"}
                onClick={() => handleEditRole(role)}
              >
                {locked ? <Lock className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              </Button>
            )}
            {canDelete && !role.isSystem && !role.isSuperAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDeleteRole(role)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )
      },
    }] : []),
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Access Management</h2>
          <p className="text-sm text-muted-foreground">
            Manage system users, roles, and permissions
          </p>
        </div>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles &amp; Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          {canCreate && (
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
          {canCreate && (
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
              <Select
                value={userRoleId}
                onValueChange={setUserRoleId}
                required
                disabled={editingUserId === currentUserId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editingUserId === currentUserId && (
                <p className="text-xs text-muted-foreground">
                  You can&apos;t change your own role — ask another administrator.
                </p>
              )}
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="isActive"
                checked={userIsActive}
                disabled={editingUserId === currentUserId}
                onCheckedChange={(c) => setUserIsActive(c as boolean)}
              />
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRoleId ? "Edit Role" : "Add Role"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRoleSubmit} className="space-y-6">
            {roleError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {roleError}
              </div>
            )}

            {editingRoleLocked && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                This is the built-in administrator role. It bypasses every
                permission check by design, so its grants can&apos;t be edited.
              </div>
            )}

            {isEditingOwnRole && !editingRoleLocked && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                This is your own role. Keep <strong>Users &amp; Roles →
                View + Edit</strong> ticked, or you&apos;ll lose access to this
                screen.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role Name *</Label>
                <Input
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  required
                  disabled={editingRoleLocked}
                  placeholder="e.g. Store Manager"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={roleDesc}
                  onChange={(e) => setRoleDesc(e.target.value)}
                  disabled={editingRoleLocked}
                  placeholder="Optional description"
                />
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              <div>
                <h3 className="text-lg font-semibold">Permissions</h3>
                <p className="text-sm text-muted-foreground">
                  Sections without <strong>View</strong> are removed from the
                  sidebar entirely for this role.
                </p>
              </div>

              <PermissionMatrix
                permissions={permissions}
                selectedIds={rolePermissions}
                onChange={setRolePermissions}
                disabled={editingRoleLocked}
              />
            </div>

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setRoleOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingRole || editingRoleLocked}>
                {savingRole ? "Saving..." : "Save Role"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
