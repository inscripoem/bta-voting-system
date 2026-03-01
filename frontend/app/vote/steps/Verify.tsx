"use client"

import { useState } from "react"
import Link from "next/link"
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

export function Verify() {
  const { school, schoolDetail, goTo, setConflict } = useVoteStore()
  const [method, setMethod] = useState<"question" | "email">("question")
  const [nickname, setNickname] = useState("")
  const [answer, setAnswer] = useState("")
  const [emailLocal, setEmailLocal] = useState("")
  const [emailSuffix, setEmailSuffix] = useState(schoolDetail?.email_suffixes?.[0] ?? "")
  const [code, setCode] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const question = schoolDetail?.verification_questions?.[0]?.question
  const suffixes = schoolDetail?.email_suffixes ?? []
  const fullEmail = emailLocal + (emailSuffix || (suffixes[0] ?? ""))

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
    if (!school || !nickname.trim()) {
      setError("请输入昵称")
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await api.auth.guest({
        nickname: nickname.trim(),
        school_code: school.code,
        method,
        answer: method === "question" ? answer : undefined,
        email: method === "email" ? fullEmail : undefined,
        code: method === "email" ? code : undefined,
      })
      if ("conflict" in res) {
        if (res.conflict === "different_school") {
          setError("该昵称已被其他学校使用，请换一个昵称。")
          return
        }
        setConflict(res.conflict, nickname.trim())
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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goTo("select-school")}
            disabled={loading}
            className="-ml-2 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <CardTitle>验证身份</CardTitle>
            <CardDescription>{school?.name}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Nickname */}
        <div className="space-y-1">
          <label className="text-sm font-medium">昵称</label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="设置你的唯一昵称"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>

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
                      <SelectTrigger className="w-auto border-0 border-l rounded-none shrink-0 text-muted-foreground text-sm focus:ring-0">
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
                  disabled={!emailLocal || loading}
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

        <div className="space-y-2">
          <Button className="w-full" onClick={handleSubmit} disabled={loading}>
            {loading ? "验证中…" : "确认"}
          </Button>

          <p className="text-xs text-muted-foreground text-center mt-2">
            你也可以选择
            <br />
            <Link href="/auth/register" className="underline">
              注册正式用户，保留历年记录
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
