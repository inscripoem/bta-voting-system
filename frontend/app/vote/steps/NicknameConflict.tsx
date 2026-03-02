"use client"

import { useState } from "react"
import Link from "next/link"
import { api, APIError, saveTokens } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useVoteStore } from "@/hooks/useVoteStore"
import { useAuthStore } from "@/hooks/useAuthStore"

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export function NicknameConflict() {
  const { school, pendingNickname, conflictIsGuest, goTo } = useVoteStore()
  const refreshAuth = useAuthStore((s) => s.refresh)
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  if (!conflictIsGuest) {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>昵称已被正式用户注册</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            「{pendingNickname}」这个昵称已被正式用户注册，无法认领。
          </p>
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href="/auth/login">前往登录</Link>
            </Button>
            <Button variant="outline" onClick={() => goTo("nickname")}>
              ← 返回，换一个昵称
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  async function handleSendCode() {
    setLoading(true)
    setError("")
    try {
      await api.auth.sendCode(email)
      setCodeSent(true)
    } catch (err) {
      setError(err instanceof APIError ? err.message : "发送失败")
    } finally {
      setLoading(false)
    }
  }

  async function handleClaim() {
    if (!school) return
    setLoading(true)
    setError("")
    try {
      const res = await api.auth.claimNickname({
        nickname: pendingNickname,
        school_code: school.code,
        email,
        code,
      })
      if ("conflict" in res) {
        setError(res.conflict === "email_mismatch"
          ? "邮箱与账号绑定邮箱不符，请确认后重试"
          : "认领失败，请重试")
        return
      }
      saveTokens(res.access_token, res.refresh_token)
      await refreshAuth()
      goTo("vote")
    } catch (err) {
      setError(err instanceof APIError ? err.message : "认领失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>昵称已被使用</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          「{pendingNickname}」这个昵称已被使用。如果这是你，请通过之前绑定的邮箱验证身份。
        </p>

        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="输入之前绑定的邮箱"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleSendCode}
              disabled={!email || !isValidEmail(email) || loading}
            >
              {codeSent ? "重发" : "发送"}
            </Button>
          </div>
          {codeSent && (
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="6位验证码"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          className="w-full"
          onClick={handleClaim}
          disabled={!codeSent || !code || loading}
        >
          {loading ? "验证中…" : "确认认领"}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">或者</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={() => goTo("nickname")}>
          ← 返回，换一个昵称
        </Button>
      </CardContent>
    </Card>
  )
}
