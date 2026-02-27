"use client"

import { useEffect, useState } from "react"
import { api, UserInfo, APIError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function AccountPage() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)
  const [userError, setUserError] = useState<string | null>(null)

  const [step, setStep] = useState<"form" | "verify">("form")
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    api.me
      .get()
      .then((u) => setUser(u))
      .catch((err: unknown) => {
        if (err instanceof APIError) {
          setUserError(err.message)
        } else {
          setUserError("加载用户信息失败")
        }
      })
      .finally(() => setLoadingUser(false))
  }, [])

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    setSubmitting(true)
    try {
      await api.auth.upgrade(email)
      setStep("verify")
    } catch (err: unknown) {
      if (err instanceof APIError) {
        setSubmitError(err.message)
      } else {
        setSubmitError("发送失败，请稍后再试")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container py-12 max-w-lg mx-auto px-4 space-y-6">
      <h1 className="text-2xl font-bold">账户中心</h1>

      <Card>
        <CardHeader>
          <CardTitle>当前用户信息</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingUser && <p className="text-muted-foreground text-sm">加载中…</p>}
          {userError && (
            <p className="text-destructive text-sm">{userError}</p>
          )}
          {user && (
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-20 shrink-0">昵称</dt>
                <dd className="font-medium">{user.nickname}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-20 shrink-0">账户类型</dt>
                <dd className="font-medium">
                  {user.is_guest ? (
                    <span className="text-yellow-500">访客账户</span>
                  ) : (
                    <span className="text-green-500">已注册账户</span>
                  )}
                </dd>
              </div>
              {user.email && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground w-20 shrink-0">邮箱</dt>
                  <dd className="font-medium">{user.email}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-20 shrink-0">角色</dt>
                <dd className="font-medium">{user.role}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      {user?.is_guest && (
        <Card>
          <CardHeader>
            <CardTitle>升级为注册账户</CardTitle>
          </CardHeader>
          <CardContent>
            {step === "form" && (
              <form onSubmit={handleSendEmail} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  输入您的邮箱地址，我们将发送一封验证邮件。点击邮件中的链接即可完成账户升级并设置密码。
                </p>
                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="text-sm font-medium leading-none"
                  >
                    邮箱地址
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                {submitError && (
                  <p className="text-destructive text-sm">{submitError}</p>
                )}
                <Button type="submit" disabled={submitting}>
                  {submitting ? "发送中…" : "发送验证邮件"}
                </Button>
              </form>
            )}

            {step === "verify" && (
              <div className="space-y-3">
                <p className="text-sm">
                  验证邮件已发送至 <strong>{email}</strong>
                </p>
                <p className="text-sm text-muted-foreground">
                  请检查您的收件箱，点击邮件中的链接完成账户升级。如未收到，请检查垃��邮件文件夹。
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStep("form")
                    setEmail("")
                  }}
                >
                  重新发送
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {user && !user.is_guest && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              您的账户已完成注册，无需再次升级。
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
