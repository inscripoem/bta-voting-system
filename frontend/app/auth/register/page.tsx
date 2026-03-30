"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { api, APIError, School, SchoolDetail } from "@/lib/api"
import { useAuthStore } from "@/hooks/useAuthStore"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ─── Upgrade flow (for existing guest users) ────────────────────────────────

function UpgradeFlow() {
  const router = useRouter()
  const { user, refresh } = useAuthStore()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await api.auth.upgrade(password)
      await refresh()
      setDone(true)
    } catch (err) {
      setError(err instanceof APIError ? err.message : "设置密码失败")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>升级为正式用户</CardTitle>
        <CardDescription>设置密码，保留历年投票记录。</CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <div className="space-y-4 text-center">
            <p className="text-sm">账号已成功升级为正式用户！</p>
            <Button className="w-full" onClick={() => router.push("/")}>回到首页</Button>
          </div>
        ) : (
          <form onSubmit={handleSetPassword} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {user?.email && (
              <div className="space-y-2">
                <Label>绑定邮箱</Label>
                <Input value={user.email} disabled className="bg-muted" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">设置登录密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">确认密码</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "提交中..." : "完成升级"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Direct registration flow (for unauthenticated users) ────────────────────

function DirectRegisterFlow() {
  const router = useRouter()
  const { refresh } = useAuthStore()
  const [schools, setSchools] = useState<School[]>([])
  const [step, setStep] = useState<"school" | "form" | "done">("school")
  const [school, setSchool] = useState<School | null>(null)
  const [schoolDetail, setSchoolDetail] = useState<SchoolDetail | null>(null)
  const [method, setMethod] = useState<"question" | "email">("question")
  const [nickname, setNickname] = useState("")
  const [answers, setAnswers] = useState<string[]>([])
  const [emailLocal, setEmailLocal] = useState("")
  const [emailSuffix, setEmailSuffix] = useState("")
  const [code, setCode] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [loginEmail, setLoginEmail] = useState("")
  const [loginCode, setLoginCode] = useState("")
  const [loginCodeSent, setLoginCodeSent] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    api.schools.list().then(setSchools).catch(console.error)
  }, [])

  const handleSelectSchool = async (s: School) => {
    setSchool(s)
    setLoadingDetail(true)
    try {
      const detail = await api.schools.get(s.code)
      setSchoolDetail(detail)
      setEmailSuffix(detail.email_suffixes?.[0] ?? "")
    } catch {
      setError("加载学校信息失败")
    } finally {
      setLoadingDetail(false)
    }
  }

  const suffixes = schoolDetail?.email_suffixes ?? []
  const fullEmail = emailLocal + (emailSuffix || suffixes[0] || "")
  const verificationQuestions = schoolDetail?.verification_questions ?? []

  const handleSendCode = async () => {
    if (!school) return
    setSubmitting(true)
    setError(null)
    try {
      await api.auth.sendCode(fullEmail, school.code)
      setCodeSent(true)
    } catch (err) {
      setError(err instanceof APIError ? err.message : "发送失败")
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendLoginCode = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await api.auth.sendCode(loginEmail)
      setLoginCodeSent(true)
    } catch (err) {
      setError(err instanceof APIError ? err.message : "发送失败")
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!school) return
    if (method === "question" && (!loginEmail || !loginCode)) {
      setError("请输入邮箱并完成验证码验证")
      return
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const res = await api.auth.register({
        nickname: nickname.trim(),
        school_code: school.code,
        method,
        answers: method === "question" ? answers : undefined,
        email: method === "email" ? fullEmail : loginEmail,
        code: method === "email" ? code : loginCode,
        password,
      })
      if ("conflict" in res) {
        setError(
          res.conflict === "different_school"
            ? "该昵称已被其他学校使用，请换一个昵称。"
            : "该昵称已被使用，请换一个昵称，或前往投票页面验证原账户。"
        )
        return
      }
      await refresh()
      setStep("done")
    } catch (err) {
      setError(err instanceof APIError ? err.message : "注册失败，请重试")
    } finally {
      setSubmitting(false)
    }
  }

  if (step === "done") {
    return (
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>注册成功</CardTitle>
          <CardDescription>你的正式账户已创建，可以开始投票了。</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button className="w-full" onClick={() => router.push("/vote")}>前往投票</Button>
        </CardFooter>
      </Card>
    )
  }

  if (step === "school") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>注册正式账户</CardTitle>
          <CardDescription>选择你的学校，通过身份验证后设置密码。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {schools.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelectSchool(s)}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                school?.id === s.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/50"
              }`}
            >
              {s.name}
            </button>
          ))}
          <Button
            className="w-full mt-2"
            disabled={!school || loadingDetail}
            onClick={() => setStep("form")}
          >
            {loadingDetail ? "加载中…" : "下一步"}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>验证身份并设置密码</CardTitle>
        <CardDescription>{school?.name}</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={handleRegister} className="space-y-4">
          {/* Nickname */}
          <div className="space-y-2">
            <Label htmlFor="nickname">昵称</Label>
            <Input
              id="nickname"
              placeholder="设置你的唯一昵称"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
            />
          </div>

          {/* Method toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={method === "question" ? "default" : "outline"}
              size="sm"
              onClick={() => setMethod("question")}
            >
              验证题
            </Button>
            <Button
              type="button"
              variant={method === "email" ? "default" : "outline"}
              size="sm"
              onClick={() => setMethod("email")}
            >
              教育邮箱
            </Button>
          </div>

          {/* Question */}
          {method === "question" && verificationQuestions.length > 0 && (
            <div className="space-y-4">
              {verificationQuestions.map((q, i) => (
                <div key={i} className="space-y-2">
                  <Label>{q.question}</Label>
                  <Input
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
              <div className="space-y-2 border-t pt-4">
                <Label>账户登录邮箱（任意邮箱）</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleSendLoginCode}
                    disabled={!loginEmail || submitting}
                  >
                    {loginCodeSent ? "重发" : "发送"}
                  </Button>
                </div>
                {loginCodeSent && (
                  <Input
                    placeholder="6位验证码"
                    value={loginCode}
                    onChange={(e) => setLoginCode(e.target.value)}
                  />
                )}
              </div>
            </div>
          )}

          {/* Email */}
          {method === "email" && (
            <div className="space-y-2">
              <Label>教育邮箱</Label>
              <div className="flex gap-2">
                <div className="flex flex-1 items-center rounded-md border border-input overflow-hidden">
                  <input
                    className="flex-1 bg-background px-3 py-2 text-sm outline-none"
                    placeholder="用户名"
                    value={emailLocal}
                    onChange={(e) => setEmailLocal(e.target.value)}
                  />
                  {suffixes.length > 1 ? (
                    <Select value={emailSuffix || suffixes[0]} onValueChange={setEmailSuffix}>
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
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleSendCode}
                  disabled={!emailLocal || submitting}
                >
                  {codeSent ? "重发" : "发送"}
                </Button>
              </div>
              {codeSent && (
                <div className="space-y-2">
                  <Label htmlFor="code">验证码</Label>
                  <Input
                    id="code"
                    placeholder="6位验证码"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="reg-password">登录密码</Label>
            <Input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-confirm">确认密码</Label>
            <Input
              id="reg-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "注册中..." : "完成注册"}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("school")}>
            ← 换一所学校
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ─── Page entry point ────────────────────────────────────────────────────────

export default function RegisterPage() {
  const { user, loading, refresh } = useAuthStore()

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
        加载中...
      </div>
    )
  }

  if (user && !user.is_guest) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>已是正式用户</CardTitle>
            <CardDescription>您已经是正式注册用户，无需再次注册。</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" asChild>
              <Link href="/">返回首页</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
      {user?.is_guest ? <UpgradeFlow /> : <DirectRegisterFlow />}
    </div>
  )
}
