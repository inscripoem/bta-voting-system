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
      accessorKey: "type",
      header: "类型",
      cell: ({ row }) => {
        const typeMap: Record<string, string> = {
          anime: "动画",
          character: "角色",
          staff: "动画人",
          seiyuu: "声优",
          other: "其他"
        }
        return typeMap[row.getValue("type") as string] || "未知"
      }
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
    type: "anime" as "anime" | "character" | "staff" | "seiyuu" | "other",
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
        type: editingAward.type || "other",
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
        type: "other",
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
              <Label htmlFor="type">奖项类型</Label>
              <Select
                value={formData.type}
                onValueChange={(val: any) => setFormData({ ...formData, type: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anime">动画</SelectItem>
                  <SelectItem value="character">角色</SelectItem>
                  <SelectItem value="staff">动画人</SelectItem>
                  <SelectItem value="seiyuu">声优</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
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
      cell: ({ row }) => {
        const val = row.getValue("cover_image_key") as string;
        if (!val) return "-";
        return (
          <div className="max-w-[150px] truncate" title={val}>
            {val}
          </div>
        );
      },
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
          award={award}
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
  award,
  editingNominee,
}: {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  award: AwardListItem
  editingNominee: NomineeListItem | null
}) {
  const [formData, setFormData] = React.useState({
    name: "",
    display_order: 0,
    cover_image_key: "",
    description: "",
    bangumi_id: "",
    related_bangumi_id: "",
    related_name: "",
    related_image_url: "",
  })

  const isOtherType = award.type === "other"
  const isSubjectType = award.type === "anime"
  const isComboType = ["character", "staff", "seiyuu"].includes(award.type)

  const comboConfig = React.useMemo(() => {
    if (award.type === "character") {
      return {
        nomLabel: "提名角色", relLabel: "关联作品",
        nomApi: { url: "/v0/search/characters", body: (k: string) => ({ keyword: k }) },
        relApi: { url: "/v0/search/subjects", body: (k: string) => ({ keyword: k, sort: "match" }) },
        nomToRel: (id: string) => `/v0/characters/${id}/subjects`,
        relToNom: (id: string) => `/v0/subjects/${id}/characters`,
      }
    }
    if (award.type === "staff") {
      return {
        nomLabel: "提名动画人", relLabel: "关联作品",
        nomApi: { url: "/v0/search/persons", body: (k: string) => ({ keyword: k, filter: { career: [] } }) },
        relApi: { url: "/v0/search/subjects", body: (k: string) => ({ keyword: k, sort: "match", filter: { type: [2] } }) },
        nomToRel: (id: string) => `/v0/persons/${id}/subjects`,
        relToNom: (id: string) => `/v0/subjects/${id}/persons`,
      }
    }
    if (award.type === "seiyuu") {
      return {
        nomLabel: "提名声优", relLabel: "关联角色",
        nomApi: { url: "/v0/search/persons", body: (k: string) => ({ keyword: k, filter: { career: ["seiyu"] } }) },
        relApi: { url: "/v0/search/characters", body: (k: string) => ({ keyword: k }) },
        nomToRel: (id: string) => `/v0/persons/${id}/characters`,
        relToNom: (id: string) => `/v0/characters/${id}/persons`,
      }
    }
    return null
  }, [award.type])

  const [searchResults, setSearchResults] = React.useState<any[]>([])
  const [isSearching, setIsSearching] = React.useState(false)

  const [relatedQuery, setRelatedQuery] = React.useState("")
  const [selectedRelatedId, setSelectedRelatedId] = React.useState<string>("")

  const [isNomSearching, setIsNomSearching] = React.useState(false)
  const [isRelSearching, setIsRelSearching] = React.useState(false)

  const [cachedRelNoms, setCachedRelNoms] = React.useState<any[]>([]) // Related -> Nominees
  const [cachedNomRels, setCachedNomRels] = React.useState<any[]>([]) // Nominee -> Related

  const [nomDropdown, setNomDropdown] = React.useState<{isOpen: boolean, data: any[], type: 'search'|'cached'}>({isOpen: false, data: [], type: 'search'})
  const [relDropdown, setRelDropdown] = React.useState<{isOpen: boolean, data: any[], type: 'search'|'cached'}>({isOpen: false, data: [], type: 'search'})

  React.useEffect(() => {
    if (editingNominee) {
      setFormData({
        name: editingNominee.name,
        display_order: editingNominee.display_order,
        cover_image_key: editingNominee.cover_image_key || "",
        description: editingNominee.description || "",
        bangumi_id: editingNominee.bangumi_id || "",
        related_bangumi_id: editingNominee.related_bangumi_id || "",
        related_name: editingNominee.related_name || "",
        related_image_url: editingNominee.related_image_url || "",
      })
      if (isComboType && editingNominee.bangumi_id && comboConfig) {
        setSelectedRelatedId(editingNominee.related_bangumi_id || "")
        fetch(`https://api.bgm.tv${comboConfig.nomToRel(editingNominee.bangumi_id)}`)
          .then(r => r.json())
          .then(res => setCachedNomRels(res || []))
          .catch(console.error)
      }
    } else {
      setFormData({
        name: "",
        display_order: 0,
        cover_image_key: "",
        description: "",
        bangumi_id: "",
        related_bangumi_id: "",
        related_name: "",
        related_image_url: "",
      })
    }
    setSearchResults([]); setRelatedQuery(""); setSelectedRelatedId("");
    setCachedRelNoms([]); setCachedNomRels([]);
    setNomDropdown({isOpen: false, data: [], type: 'search'});
    setRelDropdown({isOpen: false, data: [], type: 'search'});
  }, [editingNominee, isOpen, award.type, comboConfig, isComboType])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const submitData = {
        ...formData,
        bangumi_id: isOtherType ? "" : formData.bangumi_id,
        related_bangumi_id: isOtherType ? "" : formData.related_bangumi_id,
        related_name: isOtherType ? "" : formData.related_name,
        related_image_url: isOtherType ? "" : formData.related_image_url,
      }

      if (editingNominee) {
        await api.admin.updateNominee(editingNominee.id, submitData)
      } else {
        await api.admin.createNominee({ ...formData, award_id: award.id })
      }
      onSuccess()
    } catch (err) {
      alert("保存提名人失败")
    }
  }

  const getNameCn = (item: any) => {
    if (item.name_cn) return item.name_cn
    if (item.infobox) {
      const cnObj = item.infobox.find((i: any) => i.key === "简体中文名")
      if (cnObj && typeof cnObj.value === "string") return cnObj.value
    }
    return item.name || ""
  }

  const getExtraInfo = (item: any) => {
    const parts = []
    if (item.id) parts.push(`ID: ${item.id}`)
    if (item.subject_name) parts.push(`出自: ${item.subject_name}`)
    if (item.relation) parts.push(item.relation)
    if (item.staff) parts.push(item.staff)
    if (item.date) parts.push(`日期: ${item.date}`)
    return parts.join(" | ")
  }

  const renderSubjectTypeBadge = (type: number) => {
    switch (type) {
      case 1: return <span className="bg-green-100 text-green-700 border border-green-200 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">书籍</span>
      case 2: return <span className="bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">动画</span>
      case 3: return <span className="bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">音乐</span>
      case 4: return <span className="bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">游戏</span>
      case 6: return <span className="bg-yellow-100 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">三次元</span>
      default: return null
    }
  }

  const getYear = (dateStr?: string) => {
    if (!dateStr) return "未知年份"
    return dateStr.substring(0, 4)
  }

  const searchBangumi = async () => {
    if (!formData.name.trim()) return
    setIsSearching(true)
    try {
      const searchBody: any = {
        keyword: formData.name.trim(),
        sort: "match",
      }

      if (award.type === "anime") {
        searchBody.filter = { type: [2] }
      }

      const res = await fetch("https://api.bgm.tv/v0/search/subjects?limit=10&offset=0", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(searchBody),
      })

      if (!res.ok) {
        throw new Error(`Search failed with status ${res.status}`)
      }

      const data = await res.json()
      setSearchResults(data.data  || [])
    } catch (err) {
      console.error(err)
      alert("搜索 Bangumi 失败，请检查网络状态或稍后再试。")
    } finally {
      setIsSearching(false)
    }
  }

  const handleSearchNominee = async () => {
    if (!formData.name.trim() || !comboConfig) return

    setIsNomSearching(true)
    try {
      const res = await fetch(`https://api.bgm.tv${comboConfig.nomApi.url}?limit=20&offset=0`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(comboConfig.nomApi.body(formData.name.trim()))
      }).then(r => r.json())

      let results = res.data || []
      
      if (selectedRelatedId && cachedRelNoms.length > 0) {
        const validIds = new Set(cachedRelNoms.map(c => c.id))
        results = results.filter((c: any) => validIds.has(c.id))
      }
      setNomDropdown({ isOpen: true, data: results, type: 'search' })
      setRelDropdown({ ...relDropdown, isOpen: false })
    } catch (err) { alert("搜索失败") } 
    finally { setIsNomSearching(false) }
  }

  const onSelectNominee = async (item: any) => {
    const nameCn = getNameCn(item)
    setFormData(prev => ({
      ...prev, name: nameCn, bangumi_id: String(item.id),
      cover_image_key: item.images?.large || item.images?.medium || item.images?.small || prev.cover_image_key,
      description: item.summary || item.short_summary || prev.description
    }))
    setNomDropdown(prev => ({ ...prev, isOpen: false }))

    if (comboConfig) {
      try {
        let rawRes = await fetch(`https://api.bgm.tv${comboConfig.nomToRel(item.id)}`).then(r => r.json())
        if (!Array.isArray(rawRes)) rawRes = []
        const uniqueRes = Array.from(new Map((rawRes || []).map((x: any) => [x.id || x.subject_id, x])).values())
        setCachedNomRels(uniqueRes || [])
        setRelDropdown({ isOpen: !selectedRelatedId, data: uniqueRes, type: 'cached' })
      } catch (e) { console.error(e) }
    }
  }

  const handleSearchRelated = async () => {
    if (!relatedQuery.trim() || !comboConfig) return
    setIsRelSearching(true)
    try {
      const res = await fetch(`https://api.bgm.tv${comboConfig.relApi.url}?limit=20&offset=0`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(comboConfig.relApi.body(relatedQuery.trim()))
      }).then(r => r.json())

      let results = res.data || []
      
      if (formData.bangumi_id && cachedNomRels.length > 0) {
        const validIds = new Set(cachedNomRels.map(s => s.subject_id || s.id))
        results = results.filter((s: any) => validIds.has(s.id))
      }
      setRelDropdown({ isOpen: true, data: results, type: 'search' })
      setNomDropdown({ ...nomDropdown, isOpen: false })
    } catch (err) { alert("搜索关联项失败") } 
    finally { setIsRelSearching(false) }
  }

  const onSelectRelated = async (item: any) => {
    const nameCn = getNameCn(item)
    const itemId = item.subject_id || item.id
    const cover = item.images?.small || item.image || ""
    setRelatedQuery(nameCn)
    setSelectedRelatedId(String(itemId))
    
    setFormData(prev => ({ 
      ...prev, 
      related_bangumi_id: String(itemId),
      related_name: nameCn,
      related_image_url: cover,
    }))

    setRelDropdown(prev => ({ ...prev, isOpen: false }))

    if (comboConfig) {
      try {
        let rawRes = await fetch(`https://api.bgm.tv${comboConfig.relToNom(itemId)}`).then(r => r.json())
        if (!Array.isArray(rawRes)) rawRes = []
        if (award.type === "staff") {
          rawRes = rawRes.filter((x: any) => {
            const rel = x.relation || ""
            return !rel.includes("歌") && !rel.includes("声优") && !rel.includes("出演")
          })
        }
        const uniqueRes = Array.from(new Map(rawRes.map((x: any) => [x.id, x])).values())
        setCachedRelNoms(uniqueRes)
        setNomDropdown({ isOpen: !formData.bangumi_id, data: uniqueRes, type: 'cached' })
      } catch (e) { console.error(e) }
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingNominee ? "编辑提名" : "新建提名"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {isOtherType && (
            <div className="grid gap-2">
              <Label htmlFor="nominee-name">名称</Label>
              <Input
                id="nominee-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="输入提名名称"
                required
              />
            </div>
          )}

          {isSubjectType && (
            <div className="grid gap-2 relative">
              <Label htmlFor="nominee-name">名称</Label>
              <div className="flex gap-2">
                <Input
                  id="nominee-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="输入作品名称"
                  required
                />
                <Button type="button" variant="secondary" onClick={searchBangumi} disabled={isSearching || !formData.name.trim()}>
                  {isSearching ? "搜索中..." : "搜索"}
                </Button>
              </div>
              
              {searchResults.length > 0 && (
                <div className="bg-background border rounded-md shadow-sm max-h-60 overflow-y-auto mt-1 flex flex-col divide-y absolute top-full w-full z-10">
                  {searchResults.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-2 hover:bg-muted cursor-pointer transition-colors" onClick={() => {
                        setFormData(prev => ({
                          ...prev, name: item.name_cn || item.name, bangumi_id: String(item.id),
                          cover_image_key: item.images?.common || item.images?.large || item.images?.medium || prev.cover_image_key,
                          description: item.summary || prev.description,
                        }))
                        setSearchResults([]) 
                      }}>
                      {item.images?.small ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.images.small} alt="cover" className="w-10 h-10 object-cover rounded" referrerPolicy="no-referrer" />
                      ) : <div className="w-10 h-10 bg-muted rounded flex items-center justify-center text-xs shrink-0">无图</div>}
                      <div className="flex flex-col overflow-hidden w-full">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate flex-1">{item.name_cn || item.name}</span>
                          {renderSubjectTypeBadge(item.type || item.subject_type)}
                        </div>
                        <span className="text-xs text-muted-foreground truncate">{item.name} | ID: {item.id} | {getYear(item.date)}</span>
                      </div>
                    </div>
                  ))}
                  <div className="p-2 text-center text-xs text-primary cursor-pointer hover:bg-muted" onClick={() => setSearchResults([])}>关闭列表</div>
                </div>
              )}
            </div>
          )}

          {isComboType && comboConfig && (
            <>
              {/* 提名方搜索栏 */}
              <div className="grid gap-2 relative">
                <Label htmlFor="nominee-search">{comboConfig.nomLabel}</Label>
                <div className="flex gap-2">
                  <Input
                    id="nominee-search"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value, bangumi_id: "" })
                      setCachedNomRels([]) 
                    }}
                    placeholder={`输入${comboConfig.nomLabel}名称`}
                    required
                  />
                  <Button type="button" variant="secondary" onClick={handleSearchNominee} disabled={isNomSearching || !formData.name.trim()}>
                    {isNomSearching ? "搜索中..." : "搜索"}
                  </Button>
                </div>
                {nomDropdown.isOpen && (
                  <div className="bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto mt-1 flex flex-col divide-y absolute top-full w-full z-20">
                    {nomDropdown.type === 'cached' && nomDropdown.data.length > 0 && (
                      <div className="p-2 text-xs text-muted-foreground bg-muted font-medium sticky top-0">根据关联项推荐：</div>
                    )}
                    {nomDropdown.data.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">未找到匹配项，请删除关联内容后重试</div>
                    ) : (
                      nomDropdown.data.map((item, index) => (
                        <div key={`${item.id}-${index}`} className="flex items-center gap-3 p-2 hover:bg-muted cursor-pointer transition-colors" onClick={() => onSelectNominee(item)}>
                          {item.images?.small ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.images.small} alt="cover" className="w-10 h-10 object-cover object-top rounded" referrerPolicy="no-referrer" />
                          ) : <div className="w-10 h-10 bg-muted rounded flex items-center justify-center text-xs shrink-0">无图</div>}
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-sm font-medium truncate">{getNameCn(item)}</span>
                            <span className="text-xs text-muted-foreground truncate">{item.name} | {getExtraInfo(item)}</span>
                          </div>
                        </div>
                      ))
                    )}
                    <div className="p-2 text-center text-xs text-primary cursor-pointer hover:bg-muted sticky bottom-0 bg-background" onClick={() => setNomDropdown({...nomDropdown, isOpen: false})}>关闭列表</div>
                  </div>
                )}
              </div>

              {/* 关联方搜索栏 */}
              <div className="grid gap-2 relative">
                <Label htmlFor="related-search">{comboConfig.relLabel}</Label>
                <div className="flex gap-2">
                  <Input
                    id="related-search"
                    value={relatedQuery}
                    onChange={(e) => {
                      setFormData({ ...formData, related_bangumi_id: "" })
                      setRelatedQuery(e.target.value)
                      setSelectedRelatedId("")
                      setCachedRelNoms([]) 
                    }}
                    placeholder={`输入${comboConfig.relLabel}名称 (选填)`}
                  />
                  <Button type="button" variant="secondary" onClick={handleSearchRelated} disabled={isRelSearching || !relatedQuery.trim()}>
                    {isRelSearching ? "搜索中..." : "搜索"}
                  </Button>
                </div>
                {relDropdown.isOpen && (
                  <div className="bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto mt-1 flex flex-col divide-y absolute top-full w-full z-20">
                    {relDropdown.type === 'cached' && relDropdown.data.length > 0 && (
                      <div className="p-2 text-xs text-muted-foreground bg-muted font-medium sticky top-0">已知的关联项：</div>
                    )}
                    {relDropdown.data.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">未找到匹配项，请删除提名内容后重试</div>
                    ) : (
                      relDropdown.data.map((item, index) => {
                        const cover = item.images?.small || item.image
                        return (
                          <div key={`${item.id || item.subject_id}-${index}`} className="flex items-center gap-3 p-2 hover:bg-muted cursor-pointer transition-colors" onClick={() => onSelectRelated(item)}>
                            {cover ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={cover} alt="cover" className="w-10 h-10 object-cover object-top rounded" referrerPolicy="no-referrer" />
                            ) : <div className="w-10 h-10 bg-muted rounded flex items-center justify-center text-xs shrink-0">无图</div>}
                            <div className="flex flex-col overflow-hidden w-full">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate flex-1">{getNameCn(item)}</span>
                                {renderSubjectTypeBadge(item.subject_type || item.type)}
                              </div>
                              <span className="text-xs text-muted-foreground truncate">{item.name || item.subject_name} | {getExtraInfo(item)}</span>
                            </div>
                          </div>
                        )
                      })
                    )}
                    <div className="p-2 text-center text-xs text-primary cursor-pointer hover:bg-muted sticky bottom-0 bg-background" onClick={() => setRelDropdown({...relDropdown, isOpen: false})}>关闭列表</div>
                  </div>
                )}
              </div>
            </>
          )}

          {!isOtherType && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="nominee-bgm-id">Bangumi ID (选填)</Label>
                <Input
                  id="nominee-bgm-id"
                  value={formData.bangumi_id}
                  onChange={(e) => setFormData({ ...formData, bangumi_id: e.target.value })}
                  placeholder="主条目或角色的 ID"
                />
              </div>
              {isComboType && (
                <div className="grid gap-2">
                  <Label htmlFor="nominee-related-bgm-id">关联 Bangumi ID (选填)</Label>
                  <Input
                    id="nominee-related-bgm-id"
                    value={formData.related_bangumi_id}
                    onChange={(e) => setFormData({ ...formData, related_bangumi_id: e.target.value })}
                    placeholder="通过上方关联栏搜索后自动填充"
                  />
                </div>
              )}
            </>
          )}

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
              placeholder="例如 s3-key-for-image，也可以填入网络图片 URL"
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
