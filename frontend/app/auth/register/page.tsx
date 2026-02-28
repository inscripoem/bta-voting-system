"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { api, clearTokens } from "@/lib/api"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"

export default function RegisterPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [step, setStep] = useState<"email" | "code" | "password" | "done">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    async function checkAuth() {
      try {
        const data = await api.me.get()
        setUser(data)
      } catch (err) {
        setUser(null)
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
  }, [])

  if (loading) {
    return <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">加载中...</div>
  }

  if (!user) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>升级账户</CardTitle>
            <CardDescription>请先完成投票身份验证</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
             <p className="text-sm text-center text-muted-foreground">
               您目前还不是正式用户或访客用户。升级账号前，请先通过所在学校的身份验证。
             </p>
             <Button asChild className="w-full">
               <Link href="/vote">前往投票/身份验证</Link>
             </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!user.is_guest) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>已是正式用户</CardTitle>
            <CardDescription>您已经是正式注册用户，无需升级。</CardDescription>
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

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      // POST /api/v1/auth/send-code
      // We need user.school_code
      await api.auth.sendCode(email, user.school_code)
      setStep("code")
    } catch (err: any) {
      setError(err.message ?? "发送验证码失败")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      // POST /api/v1/auth/verify-email
      await api.auth.verifyEmail(email, code)
      setStep("password")
    } catch (err: any) {
      setError(err.message ?? "验证码错误")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致")
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      // POST /api/v1/auth/upgrade
      await api.auth.upgrade(password)
      setStep("done")
    } catch (err: any) {
      setError(err.message ?? "设置密码失败")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>升级为正式用户</CardTitle>
          <CardDescription>
            正式用户可以长期保存投票记录并参与未来的活动。升级过程需要验证您的学校邮箱。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === "email" && (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">学校邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.edu.cn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  请使用您所在学校的官方邮箱。
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "发送中..." : "发送验证码"}
              </Button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">验证码</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="请输入6位验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "验证中..." : "下一步"}
              </Button>
              <Button variant="link" className="w-full text-xs" onClick={() => setStep("email")}>
                修改邮箱地址
              </Button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={handleSetPassword} className="space-y-4">
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
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "提交中..." : "完成升级"}
              </Button>
            </form>
          )}

          {step === "done" && (
            <div className="space-y-4 text-center">
              <p className="text-sm">恭喜您，账号已成功升级为正式用户！</p>
              <Button className="w-full" onClick={() => router.push('/')}>
                回到首页
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
