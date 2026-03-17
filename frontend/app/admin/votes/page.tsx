"use client"

import * as React from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { Suspense } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { api, VoteItemListItem, SessionListItem, UserInfo } from "@/lib/api"
import { DataTable } from "@/components/admin/data-table"
import { SearchableSelect } from "@/components/admin/searchable-select"
import { Button } from "@/components/ui/button"
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { InfoIcon, Trash2 } from "lucide-react"

function VotesContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [sessions, setSessions] = React.useState<SessionListItem[]>([])
  const [voteItems, setVoteItems] = React.useState<VoteItemListItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [, setLoading] = React.useState(false)
  const [user, setUser] = React.useState<UserInfo | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  const sessionId = searchParams.get("session_id") || ""
  const page = Number(searchParams.get("page")) || 1
  const pageSize = Number(searchParams.get("page_size")) || 20

  // Fetch initial data (user info and sessions)
  React.useEffect(() => {
    api.me.get().then(setUser).catch(console.error)
    api.admin.listSessions({ page_size: 100 }).then((res) => {
      setSessions(res.data)
    }).catch(console.error)
  }, [])

  // Fetch vote items when filters change
  const fetchVoteItems = React.useCallback(async () => {
    if (!sessionId) {
      setVoteItems([])
      setTotal(0)
      return
    }
    setLoading(true)
    try {
      const res = await api.admin.listVoteItems({
        session_id: sessionId,
        page,
        page_size: pageSize,
      })
      setVoteItems(res.data)
      setTotal(res.total)
    } catch (err) {
      console.error("Failed to fetch vote items", err)
    } finally {
      setLoading(false)
    }
  }, [sessionId, page, pageSize])

  React.useEffect(() => {
    fetchVoteItems()
  }, [fetchVoteItems])

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

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      await api.admin.deleteVoteItem(deletingId)
      fetchVoteItems()
    } catch (err) {
      console.error("Failed to delete vote item", err)
      alert("删除失败")
    } finally {
      setDeletingId(null)
    }
  }

  const sessionOptions = React.useMemo(() => 
    sessions.map(s => ({
      value: s.id,
      label: `${s.year} - ${s.name}`
    })),
    [sessions]
  )

  const columns = React.useMemo<ColumnDef<VoteItemListItem>[]>(
    () => [
      {
        accessorKey: "user_nickname",
        header: "用户昵称",
      },
      {
        accessorKey: "school_name",
        header: "学校",
      },
      {
        accessorKey: "award_name",
        header: "奖项",
      },
      {
        accessorKey: "nominee_name",
        header: "提名",
      },
      {
        accessorKey: "score",
        header: "分数",
      },
      {
        accessorKey: "ip_address",
        header: "IP",
      },
      {
        accessorKey: "updated_at",
        header: "更新时间",
        cell: ({ row }) => new Date(row.original.updated_at).toLocaleString("zh-CN"),
      },
      {
        id: "actions",
        header: "操作",
        cell: ({ row }) => {
          if (user?.role !== "super_admin") return null
          return (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeletingId(row.original.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )
        },
      },
    ],
    [user]
  )

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="w-full md:max-w-xs">
          <SearchableSelect
            options={sessionOptions}
            value={sessionId}
            onChange={(val) => updateQueryParams({ session_id: val, page: 1 })}
            placeholder="选择投票会话..."
          />
        </div>
      </div>

      {!sessionId ? (
        <Alert>
          <InfoIcon className="h-4 w-4" />
          <AlertTitle>提示</AlertTitle>
          <AlertDescription>请选择投票会话以查看投票数据。</AlertDescription>
        </Alert>
      ) : (
        <DataTable
          columns={columns}
          data={voteItems}
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={(p) => updateQueryParams({ page: p })}
          onPageSizeChange={(s) => updateQueryParams({ page_size: s, page: 1 })}
        />
      )}

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销。该投票记录将被永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function VotesPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground text-sm">加载中…</div>}>
      <VotesContent />
    </Suspense>
  )
}
