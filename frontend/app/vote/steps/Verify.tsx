"use client"

import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { api, APIError, saveTokens } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useVoteStore } from "@/hooks/useVoteStore"
import { useAuthStore } from "@/hooks/useAuthStore"

export function Verify() {
  const { school, schoolDetail, pendingNickname, goTo, setConflict, setVerificationResult } = useVoteStore()
  const refreshAuth = useAuthStore((s) => s.refresh)
  const [method, setMethod] = useState<"question" | "email">("question")

  // Question method state
  const questions = schoolDetail?.verification_questions ?? []
  const [answers, setAnswers] = useState<string[]>([])
  const [guestEmail, setGuestEmail] = useState("")
  const [guestCode, setGuestCode] = useState("")
  const [guestCodeSent, setGuestCodeSent] = useState(false)

  // Email method state
  const [emailLocal, setEmailLocal] = useState("")
  const [emailSuffix, setEmailSuffix] = useState(schoolDetail?.email_suffixes?.[0] ?? "")
  const [code, setCode] = useState("")
  const [codeSent, setCodeSent] = useState(false)

  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const suffixes = schoolDetail?.email_suffixes ?? []
  const fullEmail = emailLocal + (emailSuffix || (suffixes[0] ?? ""))
  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

  async function handleSendGuestCode() {
    setLoading(true)
    setError("")
    try {
      await api.auth.sendCode(guestEmail) // no schoolCode → any email accepted
      setGuestCodeSent(true)
    } catch (err) {
      setError(err instanceof APIError ? err.message : "发送失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  async function handleSendCode() {
    if (!school) return
    setLoading(true)
    setError("")
    try {
      await api.auth.sendCode(fullEmail, school.code)
      setCodeSent(true)
    } catch (err) {
      setError(err instanceof APIError ? err.message : "发送失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit() {
    if (!school) return
    setLoading(true)
    setError("")
    try {
      const res = await api.auth.guest({
        nickname: pendingNickname,
        school_code: school.code,
        method,
        answers: method === "question" ? answers : undefined,
        email: method === "question" ? guestEmail : fullEmail,
        code: method === "question" ? guestCode : code,
      })
      if ("conflict" in res) {
        if (res.conflict === "different_school") {
          setError("该昵称已被其他学校使用，请换一个昵称。")
          return
        }
        setConflict(res.conflict, pendingNickname, res.is_guest)
        return
      }
      saveTokens(res.access_token, res.refresh_token)
      await refreshAuth()
      setVerificationResult(method, method === "email" ? fullEmail : guestEmail)
      goTo("register")
    } catch (err) {
      setError(err instanceof APIError ? err.message : "验证失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  const submitDisabled =
    loading ||
    (method === "question" && (
      questions.some((_, i) => !answers[i]?.trim()) ||
      !guestEmail || !guestCodeSent || !guestCode
    )) ||
    (method === "email" && (!emailLocal || !codeSent || !code))

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goTo("nickname")}
            disabled={loading}
            className="-ml-2 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <CardTitle>验证身份</CardTitle>
            <CardDescription>{school?.name} · {pendingNickname}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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

        {/* Question path */}
        {method === "question" && (
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={i} className="space-y-1">
                <label className="text-sm font-medium">{q.question}</label>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="输入答案"
                  value={answers[i] ?? ""}
                  onChange={(e) => {
                    const next = [...answers]
                    next[i] = e.target.value
                    setAnswers(next)
                  }}
                />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-sm font-medium">绑定邮箱</label>
              <p className="text-xs text-muted-foreground">用任意邮箱绑定账号，认领昵称时需要</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="your@email.com"
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSendGuestCode}
                  disabled={!guestEmail || !isValidEmail(guestEmail) || loading}
                >
                  {guestCodeSent ? "重新发送" : "发送验证码"}
                </Button>
              </div>
            </div>
            {guestCodeSent && (
              <div className="space-y-1">
                <label className="text-sm font-medium">验证码</label>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="6位验证码"
                  value={guestCode}
                  onChange={(e) => setGuestCode(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {/* Email path */}
        {method === "email" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">教育邮箱</label>
              <div className="flex gap-2">
                <div className="flex flex-1 items-center rounded-md border border-input overflow-hidden">
                  <input
                    className="flex-1 bg-background px-3 py-2 text-sm outline-none"
                    placeholder="用户名"
                    value={emailLocal}
                    onChange={(e) => setEmailLocal(e.target.value)}
                  />
                  {suffixes.length > 1 ? (
                    <Select
                      value={emailSuffix || suffixes[0]}
                      onValueChange={setEmailSuffix}
                    >
                      <SelectTrigger className="min-w-[5rem] w-auto border-0 border-l rounded-none shrink-0 text-muted-foreground text-sm focus:ring-0 justify-between">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {suffixes.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="px-3 py-2 text-sm text-muted-foreground border-l bg-muted/30 shrink-0">
                      {suffixes[0] ?? "@edu.cn"}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSendCode}
                  disabled={!emailLocal || !isValidEmail(fullEmail) || loading}
                >
                  {codeSent ? "重新发送" : "发送验证码"}
                </Button>
              </div>
            </div>
            {codeSent && (
              <div className="space-y-1">
                <label className="text-sm font-medium">验证码</label>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="6位验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button className="w-full" onClick={handleSubmit} disabled={submitDisabled}>
          {loading ? "验证中…" : "确认"}
        </Button>
      </CardContent>
    </Card>
  )
}
