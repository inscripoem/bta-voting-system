"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Suspense } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { Plus, Edit2, Trash2, Loader2 } from "lucide-react"

import { api, SchoolListItem, UserInfo } from "@/lib/api"
import { DataTable } from "@/components/admin/data-table"
import { TagInput } from "@/components/admin/tag-input"
import { RepeaterField } from "@/components/admin/repeater-field"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

function SchoolsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const page = Number(searchParams.get("page")) || 1
  const pageSize = Number(searchParams.get("page_size")) || 20
  const q = searchParams.get("q") || ""

  const [data, setData] = React.useState<SchoolListItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [user, setUser] = React.useState<UserInfo | null>(null)

  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editingSchool, setEditingSchool] = React.useState<SchoolListItem | null>(null)

  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [newSchool, setNewSchool] = React.useState({
    name: "",
    code: "",
    email_suffixes: [] as string[],
    verification_questions: [] as any[],
    is_active: true
  })

  const [deactivateDialogOpen, setDeactivateDialogOpen] = React.useState(false)
  const [deactivatingSchool, setDeactivatingSchool] = React.useState<SchoolListItem | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const fetchSchools = async () => {
    setLoading(true)
    try {
      const res = await api.admin.listSchools({ page, page_size: pageSize, q })
      setData(res.data)
      setTotal(res.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchUser = async () => {
    try {
      const res = await api.me.get()
      setUser(res)
    } catch (err) {
      console.error(err)
    }
  }

  React.useEffect(() => {
    fetchSchools()
  }, [page, pageSize, q])

  React.useEffect(() => {
    fetchUser()
  }, [])

  const updateQuery = (updates: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === "") {
        params.delete(key)
      } else {
        params.set(key, String(value))
      }
    })
    router.push(`?${params.toString()}`)
  }

  const isSuperAdmin = user?.role === "super_admin"

  const columns: ColumnDef<SchoolListItem>[] = [
    {
      accessorKey: "name",
      header: "名称",
    },
    {
      accessorKey: "code",
      header: "编码",
    },
    {
      accessorKey: "email_suffixes",
      header: "邮箱后缀数量",
      cell: ({ row }) => (row.original.email_suffixes?.length || 0),
    },
    {
      accessorKey: "is_active",
      header: "状态",
      cell: ({ row }) => (
        <Badge
          variant={row.original.is_active ? "default" : "secondary"}
          className={cn(row.original.is_active ? "bg-green-500 hover:bg-green-600" : "")}
        >
          {row.original.is_active ? "启用" : "停用"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setEditingSchool(row.original)
              setEditDialogOpen(true)
            }}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          {isSuperAdmin && (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => {
                setDeactivatingSchool(row.original)
                setDeactivateDialogOpen(true)
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ]

  const handleUpdate = async () => {
    if (!editingSchool) return
    setError(null)
    try {
      await api.admin.updateSchool(editingSchool.id, {
        name: editingSchool.name,
        code: editingSchool.code,
        email_suffixes: editingSchool.email_suffixes,
        verification_questions: editingSchool.verification_questions,
        is_active: editingSchool.is_active,
      })
      setEditDialogOpen(false)
      fetchSchools()
    } catch (err) {
      console.error(err)
      setError("更新失败")
    }
  }

  const handleCreate = async () => {
    setError(null)
    try {
      await api.admin.createSchool(newSchool)
      setCreateDialogOpen(false)
      fetchSchools()
      setNewSchool({
        name: "",
        code: "",
        email_suffixes: [],
        verification_questions: [],
        is_active: true
      })
    } catch (err) {
      console.error(err)
      setError("创建失败")
    }
  }

  const handleDeactivate = async () => {
    if (!deactivatingSchool) return
    setError(null)
    try {
      await api.admin.deleteSchool(deactivatingSchool.id)
      setDeactivateDialogOpen(false)
      fetchSchools()
    } catch (err) {
      console.error(err)
      setError("停用失败")
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">学校管理</h1>
        {isSuperAdmin && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            新建学校
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DataTable
        columns={columns}
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={(p) => updateQuery({ page: p })}
        onPageSizeChange={(ps) => updateQuery({ page_size: ps, page: 1 })}
        searchValue={q}
        onSearchChange={(val) => updateQuery({ q: val, page: 1 })}
      />

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑学校</DialogTitle>
            <DialogDescription>
              修改学校基本信息、邮箱后缀和验证问题。
            </DialogDescription>
          </DialogHeader>
          {editingSchool && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">学校名称</Label>
                <Input
                  id="edit-name"
                  value={editingSchool.name}
                  disabled={!isSuperAdmin}
                  onChange={(e) => setEditingSchool({ ...editingSchool, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-code">学校编码</Label>
                <Input
                  id="edit-code"
                  value={editingSchool.code}
                  disabled={!isSuperAdmin}
                  onChange={(e) => setEditingSchool({ ...editingSchool, code: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>邮箱后缀</Label>
                <TagInput
                  value={editingSchool.email_suffixes || []}
                  onChange={(tags) => setEditingSchool({ ...editingSchool, email_suffixes: tags })}
                  placeholder="pku.edu.cn"
                  prefix="@"
                />
              </div>
              <div className="grid gap-2">
                <Label>验证问题</Label>
                <RepeaterField
                  value={editingSchool.verification_questions || []}
                  onChange={(qs) => setEditingSchool({ ...editingSchool, verification_questions: qs })}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-active"
                  checked={editingSchool.is_active}
                  disabled={!isSuperAdmin}
                  onCheckedChange={(checked) => setEditingSchool({ ...editingSchool, is_active: !!checked })}
                />
                <Label htmlFor="edit-active">是否启用</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleUpdate}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新建学校</DialogTitle>
            <DialogDescription>
              添加新的学校。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="new-name">学校名称</Label>
              <Input
                id="new-name"
                value={newSchool.name}
                onChange={(e) => setNewSchool({ ...newSchool, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-code">学校编码</Label>
              <Input
                id="new-code"
                value={newSchool.code}
                onChange={(e) => setNewSchool({ ...newSchool, code: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>邮箱后缀</Label>
              <TagInput
                value={newSchool.email_suffixes}
                onChange={(tags) => setNewSchool({ ...newSchool, email_suffixes: tags })}
                placeholder="pku.edu.cn"
                prefix="@"
              />
            </div>
            <div className="grid gap-2">
              <Label>验证问题</Label>
              <RepeaterField
                value={newSchool.verification_questions}
                onChange={(qs) => setNewSchool({ ...newSchool, verification_questions: qs })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="new-active"
                checked={newSchool.is_active}
                onCheckedChange={(checked) => setNewSchool({ ...newSchool, is_active: !!checked })}
              />
              <Label htmlFor="new-active">是否启用</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>取消</Button>
            <Button onClick={handleCreate}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate AlertDialog */}
      <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认停用学校？</AlertDialogTitle>
            <AlertDialogDescription>
              停用后该学校的用户将无法登录和投票。此操作为软删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} className="bg-destructive text-destructive-foreground">确认停用</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function SchoolsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <SchoolsContent />
    </Suspense>
  )
}
