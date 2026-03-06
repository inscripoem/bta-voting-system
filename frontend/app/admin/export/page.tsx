"use client"

import { useState } from "react"
import { requestBlob, APIError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function AdminExportPage() {
  const [schoolId, setSchoolId] = useState("")
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setError(null)
    setDownloading(true)
    try {
      const path = `/admin/votes/export${schoolId.trim() ? `?school_id=${encodeURIComponent(schoolId.trim())}` : ""}`
      const blob = await requestBlob(path)
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = objectUrl
      a.download = "votes.csv"
      a.click()
      URL.revokeObjectURL(objectUrl)
    } catch (err: unknown) {
      if (err instanceof APIError) {
        setError(err.message)
      } else {
        setError("导出失败，请稍后再试")
      }
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>导出投票数据</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            导出当前会话的投票数据为 CSV 文件。超级管理员可以指定学校 ID 进行过滤；学校管理员无需填写，系统将自动限定为所管理的学校。
          </p>
          <div className="space-y-2">
            <label
              htmlFor="school-id"
              className="text-sm font-medium leading-none"
            >
              学校 ID（可选，仅超级管理员需填写）
            </label>
            <input
              id="school-id"
              type="text"
              value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
              placeholder="留空则导出所管理学校的全部数据"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button onClick={handleExport} disabled={downloading}>
            {downloading ? "导出中…" : "导出 CSV"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
