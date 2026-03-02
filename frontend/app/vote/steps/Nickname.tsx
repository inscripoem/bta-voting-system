"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { api, APIError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useVoteStore } from "@/hooks/useVoteStore"

export function Nickname() {
  const { school, setNickname, setConflict, goTo } = useVoteStore()
  const [nickname, setLocal] = useState("")
  const [error, setError] = useState("")
  const [formalConflict, setFormalConflict] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleContinue() {
    const trimmed = nickname.trim()
    if (!trimmed) {
      setError("请输入昵称")
      return
    }
    if (!school) return
    setLoading(true)
    setError("")
    setFormalConflict(false)
    try {
      const result = await api.auth.checkNickname(trimmed, school.code)
      if (result.available) {
        setNickname(trimmed)
        goTo("verify")
      } else if (result.conflict === "different_school") {
        setError("该昵称已被其他学校使用，请换一个昵称")
      } else if (result.conflict === "same_school") {
        if (result.is_guest) {
          setNickname(trimmed)
          setConflict("same_school", trimmed, true)
        } else {
          setFormalConflict(true)
          setError("该昵称已被正式用户注册，请登录或换一个昵称")
        }
      }
    } catch (err) {
      setError(err instanceof APIError ? err.message : "检查昵称失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goTo("select-school")}
            className="-ml-2 shrink-0"
            disabled={loading}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <CardTitle>设置昵称</CardTitle>
            <CardDescription>{school?.name}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">昵称</label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="设置你的唯一昵称"
            value={nickname}
            onChange={(e) => { setLocal(e.target.value); setError(""); setFormalConflict(false) }}
            onKeyDown={(e) => e.key === "Enter" && handleContinue()}
            disabled={loading}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          {formalConflict && (
            <Link href="/auth/login" className="text-sm text-primary underline">
              前往登录
            </Link>
          )}
        </div>
        <Button className="w-full" onClick={handleContinue} disabled={loading}>
          {loading ? "检查中…" : "继续"}
        </Button>
      </CardContent>
    </Card>
  )
}
