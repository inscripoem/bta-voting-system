"use client"

import { useState } from "react"
import { api, APIError, saveTokens } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useVoteStore } from "@/hooks/useVoteStore"

export function NicknameConflict() {
  const { school, schoolDetail, pendingNickname, goTo } = useVoteStore()
  const [method, setMethod] = useState<"question" | "email">("question")
  const [answer, setAnswer] = useState("")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const question = schoolDetail?.verification_questions?.[0]?.question

  async function handleSendCode() {
    if (!school) return
    setLoading(true)
    try {
      await api.auth.sendCode(email, school.code)
      setCodeSent(true)
    } catch (err) {
      setError(err instanceof APIError ? err.message : "发送失败")
    } finally {
      setLoading(false)
    }
  }

  async function handleReauth() {
    if (!school) return
    setLoading(true)
    setError("")
    try {
      const res = await api.auth.guest({
        nickname: pendingNickname,
        school_code: school.code,
        method,
        answer: method === "question" ? answer : undefined,
        email: method === "email" ? email : undefined,
        code: method === "email" ? code : undefined,
        reauth: true,
      })
      if ("conflict" in res) {
        setError("验证失败，请重试")
        return
      }
      saveTokens(res.access_token, res.refresh_token)
      goTo("vote")
    } catch (err) {
      setError(err instanceof APIError ? err.message : "验证失败，请重试")
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
          「{pendingNickname}」这个昵称已被使用。如果这是你，请重新验证身份。
        </p>

        {/* Method toggle */}
        <div className="flex gap-2">
          <Button
            variant={method === "question" ? "default" : "outline"}
            size="sm"
            onClick={() => setMethod("question")}
          >
            验证题
          </Button>
          <Button
            variant={method === "email" ? "default" : "outline"}
            size="sm"
            onClick={() => setMethod("email")}
          >
            教育邮箱
          </Button>
        </div>

        {method === "question" && question && (
          <div className="space-y-1">
            <label className="text-sm font-medium">{question}</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="输入答案"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </div>
        )}

        {method === "email" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="教育邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button size="sm" variant="outline" onClick={handleSendCode} disabled={!email || loading}>
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
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button className="w-full" onClick={handleReauth} disabled={loading}>
          {loading ? "验证中…" : "重新验证身份"}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">或者</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={() => goTo("verify")}>
          ← 返回，换一个昵称
        </Button>
      </CardContent>
    </Card>
  )
}
