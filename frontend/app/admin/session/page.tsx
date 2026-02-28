"use client"

import * as React from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Suspense } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { Pencil, Trash2, Plus, AlertCircle } from "lucide-react"
import { api, SessionListItem, APIError } from "@/lib/api"
import { DataTable } from "@/components/admin/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

function SessionContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // URL state
  const page = Number(searchParams.get("page")) || 1
  const pageSize = Number(searchParams.get("page_size")) || 20
  const q = searchParams.get("q") || ""

  const [data, setData] = React.useState<SessionListItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [editingSession, setEditingSession] = React.useState<SessionListItem | null>(null)
  const [formData, setFormData] = React.useState({
    year: new Date().getFullYear(),
    name: "",
    status: "pending" as SessionListItem["status"],
  })

  // AlertDialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  const fetchData = React.useCallback(async () => {
    setError(null)
    try {
      const res = await api.admin.listSessions({ page, page_size: pageSize, q })
      setData(res.data)
      setTotal(res.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载数据失败")
    }
  }, [page, pageSize, q])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  const updateURL = (newParams: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === "") {
        params.delete(key)
      } else {
        params.set(key, value.toString())
      }
    })
    router.push(`${pathname}?${params.toString()}`)
  }

  const handleCreate = () => {
    setEditingSession(null)
    setFormData({
      year: new Date().getFullYear(),
      name: "",
      status: "pending",
    })
    setIsDialogOpen(true)
  }

  const handleEdit = (session: SessionListItem) => {
    setEditingSession(session)
    setFormData({
      year: session.year,
      name: session.name,
      status: session.status,
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) {
      setError("名称不能为空")
      return
    }
    if (isNaN(formData.year)) {
      setError("年份必须是数字")
      return
    }

    try {
      if (editingSession) {
        await api.admin.updateSession(editingSession.id, formData)
      } else {
        await api.admin.createSession(formData)
      }
      setIsDialogOpen(false)
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败")
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    setDeleteError(null)
    try {
      await api.admin.deleteSession(deletingId)
      setIsDeleteDialogOpen(false)
      setDeletingId(null)
      fetchData()
    } catch (err) {
      if (err instanceof APIError && err.status === 409) {
        setDeleteError("该会话存在投票记录，无法删除")
      } else {
        setDeleteError(err instanceof Error ? err.message : "删除失败")
      }
    }
  }

  const columns: ColumnDef<SessionListItem>[] = [
    {
      accessorKey: "year",
      header: "年份",
    },
    {
      accessorKey: "name",
      header: "名称",
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => {
        const status = row.original.status
        const statusMap = {
          pending: { color: "bg-gray-500", label: "待开始" },
          active: { color: "bg-green-500", label: "投票中" },
          counting: { color: "bg-yellow-500", label: "计票中" },
          published: { color: "bg-blue-500", label: "已公布" },
        }
        const { color, label } = statusMap[status]
        return (
          <Badge className={`${color} text-white border-none`}>
            {label}
          </Badge>
        )
      },
    },
    {
      accessorKey: "created_at",
      header: "创建时间",
      cell: ({ row }) => new Date(row.original.created_at).toLocaleString("zh-CN"),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleEdit(row.original)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setDeletingId(row.original.id)
              setDeleteError(null)
              setIsDeleteDialogOpen(true)
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ]

  const statusOptions = [
    { id: "pending", label: "待开始", value: "pending" },
    { id: "active", label: "投票中", value: "active" },
    { id: "counting", label: "计票中", value: "counting" },
    { id: "published", label: "已公布", value: "published" },
  ]

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">投票会话管理</h1>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          新建会话
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>错误</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DataTable
        columns={columns}
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={(p) => updateURL({ page: p })}
        onPageSizeChange={(s) => updateURL({ page_size: s, page: 1 })}
        searchValue={q}
        onSearchChange={(v) => updateURL({ q: v, page: 1 })}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSession ? "编辑会话" : "新建会话"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="year">年份</Label>
              <Input
                id="year"
                type="number"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">名称</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">状态</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as SessionListItem["status"] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit">确定</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销。如果该会话已有投票记录，将无法删除。
              {deleteError && (
                <div className="mt-2 text-destructive font-medium">
                  错误：{deleteError}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function SessionPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground text-sm">加载中…</div>}>
      <SessionContent />
    </Suspense>
  )
}
