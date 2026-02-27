"use client"

import { useEffect, useState } from "react"
import { api, VotingSession, APIError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type SessionStatus = VotingSession["status"]

const STATUS_OPTIONS: { value: SessionStatus; label: string }[] = [
  { value: "pending", label: "待开始" },
  { value: "active", label: "投票中" },
  { value: "counting", label: "计票中" },
  { value: "published", label: "已公布" },
]

export default function AdminSessionPage() {
  const [session, setSession] = useState<VotingSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)

  useEffect(() => {
    api.sessions
      .current()
      .then((s) => setSession(s))
      .catch((err: unknown) => {
        if (err instanceof APIError) {
          setError(err.message)
        } else {
          setError("加载会话信息失败")
        }
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleStatusChange(status: SessionStatus) {
    if (!session) return
    setUpdateError(null)
    setUpdating(true)
    try {
      const updated = await api.admin.patchSessionStatus("current", status)
      setSession(updated)
    } catch (err: unknown) {
      if (err instanceof APIError) {
        setUpdateError(err.message)
      } else {
        setUpdateError("更新状态失败，请稍后再试")
      }
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>当前投票会话</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-muted-foreground text-sm">加载中…</p>}
          {error && <p className="text-destructive text-sm">{error}</p>}
          {session && (
            <dl className="space-y-2 text-sm mb-6">
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-16 shrink-0">名称</dt>
                <dd className="font-medium">{session.name}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-16 shrink-0">年份</dt>
                <dd className="font-medium">{session.year}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-16 shrink-0">ID</dt>
                <dd className="font-mono text-xs text-muted-foreground">{session.id}</dd>
              </div>
            </dl>
          )}

          <div className="space-y-3">
            <p className="text-sm font-medium">投票状态</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map(({ value, label }) => {
                const isCurrent = session?.status === value
                return (
                  <Button
                    key={value}
                    variant={isCurrent ? "default" : "outline"}
                    disabled={updating || !session}
                    onClick={() => handleStatusChange(value)}
                    className={isCurrent ? "ring-2 ring-primary ring-offset-2" : ""}
                  >
                    {label}
                    {isCurrent && " (当前)"}
                  </Button>
                )
              })}
            </div>
            {updateError && (
              <p className="text-destructive text-sm">{updateError}</p>
            )}
            {updating && (
              <p className="text-muted-foreground text-sm">更新中…</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
