"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Users, 
  ArrowLeft,
  ChevronRight
} from "lucide-react"
import { ColumnDef } from "@tanstack/react-table"

import { api, AwardListItem, NomineeListItem, UserInfo, SessionListItem } from "@/lib/api"
import { DataTable } from "@/components/admin/data-table"
import { SearchableSelect } from "@/components/admin/searchable-select"
import { TagInput } from "@/components/admin/tag-input"
import { KVEditor } from "@/components/admin/kv-editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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

export default function AdminAwardsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionIdFromUrl = searchParams.get("session_id") || ""

  const [sessions, setSessions] = React.useState<SessionListItem[]>([])
  const [user, setUser] = React.useState<UserInfo | null>(null)
  const [awards, setAwards] = React.useState<AwardListItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [loading, setLoading] = React.useState(false)

  // Award Dialog State
  const [isAwardDialogOpen, setIsAwardDialogOpen] = React.useState(false)
  const [editingAward, setEditingAward] = React.useState<AwardListItem | null>(null)
  
  // Nominee Sheet State
  const [selectedAward, setSelectedAward] = React.useState<AwardListItem | null>(null)
  const [isNomineeSheetOpen, setIsNomineeSheetOpen] = React.useState(false)

  // Fetch initial data
  React.useEffect(() => {
    api.me.get().then(setUser)
    api.admin.listSessions({ page_size: 100 }).then((res) => setSessions(res.data))
  }, [])

  const fetchAwards = React.useCallback(async () => {
    if (!sessionIdFromUrl) return
    setLoading(true)
    try {
      const res = await api.admin.listAwards({
        session_id: sessionIdFromUrl,
        page,
        page_size: pageSize,
      })
      setAwards(res.data)
      setTotal(res.total)
    } catch (err) {
      console.error("获取奖项失败:", err)
    } finally {
      setLoading(false)
    }
  }, [sessionIdFromUrl, page, pageSize])

  React.useEffect(() => {
    fetchAwards()
  }, [fetchAwards])

  const handleSessionChange = (id: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (id) {
      params.set("session_id", id)
    } else {
      params.delete("session_id")
    }
    router.push(`?${params.toString()}`)
  }

  const handleDeleteAward = async (id: string) => {
    if (!confirm("您确定要删除此奖项吗？")) return
    try {
      await api.admin.deleteAward(id)
      fetchAwards()
    } catch (err) {
      alert("删除奖项失败")
    }
  }

  const columns: ColumnDef<AwardListItem>[] = [
    {
      accessorKey: "name",
      header: "名称",
    },
    {
      accessorKey: "category",
      header: "分类",
      cell: ({ row }) => {
        const category = row.getValue("category") as string
        let variant: "destructive" | "default" | "secondary" | "outline" = "outline"
        let className = ""
        let label = category
        
        if (category === "mandatory") {
          variant = "destructive"
          label = "必填"
        } else if (category === "optional") {
          className = "bg-blue-500 hover:bg-blue-600 text-white border-transparent"
          label = "可选"
        } else if (category === "entertainment") {
          className = "bg-green-500 hover:bg-green-600 text-white border-transparent"
          label = "娱乐"
        }
        
        return <Badge variant={variant} className={className}>{label}</Badge>
      },
    },
    {
      accessorKey: "nominee_count",
      header: "提名",
    },
    {
      accessorKey: "display_order",
      header: "顺序",
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => {
        const award = row.original
        const isSchoolAdmin = user?.role === "school_admin"
        const canEdit = !isSchoolAdmin || award.category === "entertainment"

        return (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedAward(award)
                setIsNomineeSheetOpen(true)
              }}
            >
              <Users className="h-4 w-4 mr-1" />
              提名
            </Button>
            {canEdit && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditingAward(award)
                    setIsAwardDialogOpen(true)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={() => handleDeleteAward(award.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">奖项管理</h1>
          <p className="text-muted-foreground">
            管理投票会话的奖项及其提名人。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-[250px]">
            <SearchableSelect
              placeholder="选择投票会话"
              options={sessions.map(s => ({ value: s.id, label: `${s.year} - ${s.name}` }))}
              value={sessionIdFromUrl}
              onChange={handleSessionChange}
            />
          </div>
          <Button 
            disabled={!sessionIdFromUrl}
            onClick={() => {
              setEditingAward(null)
              setIsAwardDialogOpen(true)
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            新建奖项
          </Button>
        </div>
      </div>

      {!sessionIdFromUrl ? (
        <div className="flex flex-col items-center justify-center h-[400px] border-2 border-dashed rounded-lg bg-muted/50">
          <p className="text-lg font-medium text-muted-foreground">请选择投票会话以查看奖项。</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={awards}
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}

      <AwardDialog
        isOpen={isAwardDialogOpen}
        onClose={() => setIsAwardDialogOpen(false)}
        onSuccess={() => {
          setIsAwardDialogOpen(false)
          fetchAwards()
        }}
        editingAward={editingAward}
        sessionId={sessionIdFromUrl}
        user={user}
        sessions={sessions}
      />

      {selectedAward && (
        <NomineeSheet
          isOpen={isNomineeSheetOpen}
          onClose={() => {
            setIsNomineeSheetOpen(false)
            setSelectedAward(null)
            fetchAwards() // Refresh count
          }}
          award={selectedAward}
        />
      )}
    </div>
  )
}

function AwardDialog({
  isOpen,
  onClose,
  onSuccess,
  editingAward,
  sessionId,
  user,
  sessions,
}: {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  editingAward: AwardListItem | null
  sessionId: string
  user: UserInfo | null
  sessions: SessionListItem[]
}) {
  const [formData, setFormData] = React.useState({
    session_id: sessionId,
    name: "",
    category: "entertainment" as "mandatory" | "optional" | "entertainment",
    score_config: {
      allowed_scores: [1, 2, 3, 4, 5],
      max_count: {} as Record<string, number>,
    },
    display_order: 0,
  })

  React.useEffect(() => {
    if (editingAward) {
      setFormData({
        session_id: editingAward.session_id,
        name: editingAward.name,
        category: editingAward.category,
        score_config: {
          allowed_scores: editingAward.score_config.allowed_scores,
          max_count: editingAward.score_config.max_count,
        },
        display_order: editingAward.display_order,
      })
    } else {
      setFormData({
        session_id: sessionId,
        name: "",
        category: user?.role === "school_admin" ? "entertainment" : "mandatory",
        score_config: {
          allowed_scores: [1, 2, 3, 4, 5],
          max_count: {},
        },
        display_order: 0,
      })
    }
  }, [editingAward, sessionId, user, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingAward) {
        await api.admin.updateAward(editingAward.id, formData)
      } else {
        await api.admin.createAward(formData)
      }
      onSuccess()
    } catch (err) {
      alert("保存奖项失败")
    }
  }

  const isSchoolAdmin = user?.role === "school_admin"

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingAward ? "编辑奖项" : "新建奖项"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>会话</Label>
              <SearchableSelect
                options={sessions.map(s => ({ value: s.id, label: `${s.year} - ${s.name}` }))}
                value={formData.session_id}
                onChange={(val) => setFormData({ ...formData, session_id: val })}
                placeholder="选择会话"
                disabled={isSchoolAdmin}
              />
              {isSchoolAdmin && (
                <p className="text-xs text-muted-foreground">学校管理员无法更改会话。</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">奖项名称</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="category">分类</Label>
              <Select
                value={formData.category}
                onValueChange={(val: any) => setFormData({ ...formData, category: val })}
                disabled={isSchoolAdmin}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mandatory">必填 (仅限超级管理员)</SelectItem>
                  <SelectItem value="optional">可选 (仅限超级管理员)</SelectItem>
                  <SelectItem value="entertainment">娱乐</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>允许的分数</Label>
              <TagInput
                value={formData.score_config.allowed_scores.map(String)}
                onChange={(tags) => setFormData({
                  ...formData,
                  score_config: {
                    ...formData.score_config,
                    allowed_scores: tags.map(Number).filter(n => !isNaN(n))
                  }
                })}
                placeholder="添加分数 (例如 1)"
              />
            </div>

            <div className="grid gap-2">
              <Label>每个分数的最大提名人数 (键值编辑器)</Label>
              <KVEditor
                value={formData.score_config.max_count}
                onChange={(kv) => setFormData({
                  ...formData,
                  score_config: {
                    ...formData.score_config,
                    max_count: kv
                  }
                })}
              />
              <p className="text-xs text-muted-foreground">键是分数 (字符串), 值是最大数量。</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="display_order">显示顺序</Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit">保存</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NomineeSheet({
  isOpen,
  onClose,
  award,
}: {
  isOpen: boolean
  onClose: () => void
  award: AwardListItem
}) {
  const [nominees, setNominees] = React.useState<NomineeListItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [loading, setLoading] = React.useState(false)

  const [isNomineeDialogOpen, setIsNomineeDialogOpen] = React.useState(false)
  const [editingNominee, setEditingNominee] = React.useState<NomineeListItem | null>(null)
  const [deletingNomineeId, setDeletingNomineeId] = React.useState<string | null>(null)

  const fetchNominees = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.admin.listNominees({
        award_id: award.id,
        page,
        page_size: pageSize,
      })
      setNominees(res.data)
      setTotal(res.total)
    } catch (err) {
      console.error("获取提名人失败:", err)
    } finally {
      setLoading(false)
    }
  }, [award.id, page, pageSize])

  React.useEffect(() => {
    if (isOpen) fetchNominees()
  }, [isOpen, fetchNominees])

  const handleDeleteNominee = async () => {
    if (!deletingNomineeId) return
    try {
      await api.admin.deleteNominee(deletingNomineeId)
      fetchNominees()
      setDeletingNomineeId(null)
    } catch (err: any) {
      if (err.status === 409) {
        alert("无法删除提名人：此提名人已有投票记录。")
      } else {
        alert("删除提名人失败")
      }
      setDeletingNomineeId(null)
    }
  }

  const columns: ColumnDef<NomineeListItem>[] = [
    {
      accessorKey: "name",
      header: "名称",
    },
    {
      accessorKey: "display_order",
      header: "顺序",
    },
    {
      accessorKey: "cover_image_key",
      header: "封面 Key",
      cell: ({ row }) => row.getValue("cover_image_key") || "-",
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setEditingNominee(row.original)
              setIsNomineeDialogOpen(true)
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={() => setDeletingNomineeId(row.original.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[90%] sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{award.name} - 提名管理</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => {
              setEditingNominee(null)
              setIsNomineeDialogOpen(true)
            }}>
              <Plus className="h-4 w-4 mr-2" />
              添加提名
            </Button>
          </div>
          <DataTable
            columns={columns}
            data={nominees}
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>

        <NomineeFormDialog
          isOpen={isNomineeDialogOpen}
          onClose={() => setIsNomineeDialogOpen(false)}
          onSuccess={() => {
            setIsNomineeDialogOpen(false)
            fetchNominees()
          }}
          awardId={award.id}
          editingNominee={editingNominee}
        />

        <AlertDialog open={!!deletingNomineeId} onOpenChange={(open) => !open && setDeletingNomineeId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>您确定吗？</AlertDialogTitle>
              <AlertDialogDescription>
                此操作无法撤销。这将永久删除该提名人。
                如果该提名人已收到任何投票，删除将失败。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteNominee} className="bg-destructive text-destructive-foreground">删除</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  )
}

function NomineeFormDialog({
  isOpen,
  onClose,
  onSuccess,
  awardId,
  editingNominee,
}: {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  awardId: string
  editingNominee: NomineeListItem | null
}) {
  const [formData, setFormData] = React.useState({
    name: "",
    display_order: 0,
    cover_image_key: "",
    description: "",
  })

  React.useEffect(() => {
    if (editingNominee) {
      setFormData({
        name: editingNominee.name,
        display_order: editingNominee.display_order,
        cover_image_key: editingNominee.cover_image_key || "",
        description: editingNominee.description || "",
      })
    } else {
      setFormData({
        name: "",
        display_order: 0,
        cover_image_key: "",
        description: "",
      })
    }
  }, [editingNominee, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingNominee) {
        await api.admin.updateNominee(editingNominee.id, formData)
      } else {
        await api.admin.createNominee({ ...formData, award_id: awardId })
      }
      onSuccess()
    } catch (err) {
      alert("保存提名人失败")
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingNominee ? "编辑提名" : "新建提名"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="nominee-name">名称</Label>
            <Input
              id="nominee-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nominee-order">显示顺序</Label>
            <Input
              id="nominee-order"
              type="number"
              value={formData.display_order}
              onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nominee-cover">封面图片 Key</Label>
            <Input
              id="nominee-cover"
              value={formData.cover_image_key}
              onChange={(e) => setFormData({ ...formData, cover_image_key: e.target.value })}
              placeholder="例如 s3-key-for-image"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nominee-desc">描述</Label>
            <Textarea
              id="nominee-desc"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit">保存</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
