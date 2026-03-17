"use client"
import { Suspense } from "react"

import * as React from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { ColumnDef } from "@tanstack/react-table"
import { api, UserListItem } from "@/lib/api"
import { DataTable } from "@/components/admin/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SearchableSelect } from "@/components/admin/searchable-select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ShieldAlert } from "lucide-react"

const ROLE_OPTIONS = [
  { value: "voter", label: "投票者" },
  { value: "school_admin", label: "学校管理员" },
  { value: "super_admin", label: "超级管理员" },
]

function UsersContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [users, setUsers] = React.useState<UserListItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [, setLoading] = React.useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = React.useState<boolean | null>(null)

  // Edit role state
  const [editingUser, setEditingUser] = React.useState<UserListItem | null>(null)
  const [newRole, setNewRole] = React.useState<string>("")
  const [submitting, setSubmitting] = React.useState(false)

  const page = Number(searchParams.get("page")) || 1
  const pageSize = Number(searchParams.get("page_size")) || 20
  const q = searchParams.get("q") || ""

  const fetchUsers = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.admin.listUsers({ page, page_size: pageSize, q })
      setUsers(res.data)
      setTotal(res.total)
    } catch (err) {
      console.error("Failed to fetch users", err)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, q])

  React.useEffect(() => {
    api.me.get().then((user) => {
      setIsSuperAdmin(user.role === "super_admin")
    }).catch(() => setIsSuperAdmin(false))
  }, [])

  React.useEffect(() => {
    if (isSuperAdmin === true) {
      fetchUsers()
    }
  }, [isSuperAdmin, fetchUsers])

  const updateQueryParams = React.useCallback(
    (updates: Record<string, string | number | undefined>) => {
      const params = new URLSearchParams(searchParams.toString())
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === "") {
          params.delete(key)
        } else {
          params.set(key, value.toString())
        }
      })
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams]
  )

  const handlePatchRole = async () => {
    if (!editingUser || !newRole) return
    setSubmitting(true)
    try {
      await api.admin.patchUserRole(editingUser.id, newRole as "voter" | "school_admin" | "super_admin")
      setEditingUser(null)
      fetchUsers()
    } catch (err) {
      console.error("Failed to update role", err)
      alert("修改角色失败")
    } finally {
      setSubmitting(false)
    }
  }

  const columns = React.useMemo<ColumnDef<UserListItem>[]>(
    () => [
      {
        accessorKey: "nickname",
        header: "昵称",
      },
      {
        accessorKey: "email",
        header: "邮箱",
        cell: ({ row }) => row.original.email || "-",
      },
      {
        accessorKey: "role",
        header: "角色",
        cell: ({ row }) => {
          const role = row.original.role
          let className = ""
          switch (role) {
            case "voter":
              className = "bg-slate-100 text-slate-800 border-slate-200"
              break
            case "school_admin":
              className = "bg-blue-100 text-blue-800 border-blue-200"
              break
            case "super_admin":
              className = "bg-purple-100 text-purple-800 border-purple-200"
              break
          }
          return (
            <Badge variant="secondary" className={className}>
              {ROLE_OPTIONS.find((opt) => opt.value === role)?.label || role}
            </Badge>
          )
        },
      },
      {
        accessorKey: "school_name",
        header: "学校名",
        cell: ({ row }) => row.original.school_name || "-",
      },
      {
        accessorKey: "is_guest",
        header: "类型",
        cell: ({ row }) => (
          <span>{row.original.is_guest ? "Guest" : "正式"}</span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "注册时间",
        cell: ({ row }) => (
          <span>
            {new Date(row.original.created_at).toLocaleString("zh-CN")}
          </span>
        ),
      },
      {
        id: "actions",
        header: "操作",
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditingUser(row.original)
              setNewRole(row.original.role)
            }}
          >
            修改角色
          </Button>
        ),
      },
    ],
    []
  )

  if (isSuperAdmin === false) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>访问受限</AlertTitle>
        <AlertDescription>
          仅超级管理员可以访问用户管理页面。
        </AlertDescription>
      </Alert>
    )
  }

  if (isSuperAdmin === null) {
    return <div className="text-muted-foreground text-sm">验证权限中…</div>
  }

  return (
    <div className="py-6 space-y-4">
      <DataTable
        columns={columns}
        data={users}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={(p) => updateQueryParams({ page: p })}
        onPageSizeChange={(s) => updateQueryParams({ page_size: s, page: 1 })}
        searchValue={q}
        onSearchChange={(v) => updateQueryParams({ q: v, page: 1 })}
      />

      <Dialog
        open={!!editingUser}
        onOpenChange={(open) => !open && setEditingUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改用户角色</DialogTitle>
            <DialogDescription>
              正在修改用户 {editingUser?.nickname} 的角色。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>选择新角色</Label>
              <SearchableSelect
                options={ROLE_OPTIONS}
                value={newRole}
                onChange={setNewRole}
                placeholder="选择角色..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingUser(null)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button onClick={handlePatchRole} disabled={submitting || !newRole}>
              {submitting ? "提交中..." : "确定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


export default function UsersPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground text-sm">加载中…</div>}>
      <UsersContent />
    </Suspense>
  )
}
