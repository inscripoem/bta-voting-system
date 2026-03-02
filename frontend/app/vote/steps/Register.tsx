"use client"

import { useState } from "react"
import { api, APIError } from "@/lib/api"
import { useVoteStore } from "@/hooks/useVoteStore"
import { useAuthStore } from "@/hooks/useAuthStore"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function Register() {
  const { verifiedEmail, verificationMethod, goTo } = useVoteStore()
  const refreshAuth = useAuthStore((s) => s.refresh)

  const canReuseEmail = verificationMethod === "email" && !!verifiedEmail
  const [useVerifiedEmail, setUseVerifiedEmail] = useState(canReuseEmail)
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSendCode = async () => {
    setLoading(true)
    setError(null)
    try {
      await api.auth.sendCode(email)
      setCodeSent(true)
    } catch (err: any) {
      setError(err instanceof APIError ? err.message : "发送失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterAndVote = async () => {
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致")
      return
    }
    if (!useVerifiedEmail && (!email || !code)) {
      setError("请完成邮箱验证")
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (!useVerifiedEmail) {
        await api.auth.verifyEmail(email, code)
      }
      await api.auth.upgrade(password)
      await refreshAuth()
      goTo("vote")
    } catch (err: any) {
      setError(err instanceof APIError ? err.message : "注册失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle>验证成功</CardTitle>
        <CardDescription>你可以直接投票，或注册正式账户保留历年记录</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Button className="w-full" onClick={() => goTo("vote")}>
          进入投票
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">或者</span>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-sm font-medium">成为正式用户，保留历年投票记录</p>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="reuse-email-checkbox"
              checked={useVerifiedEmail}
              onCheckedChange={(v) => setUseVerifiedEmail(Boolean(v))}
              disabled={!canReuseEmail}
            />
            <Label
              htmlFor="reuse-email-checkbox"
              className={`text-sm font-normal cursor-pointer select-none ${!canReuseEmail ? "text-muted-foreground" : ""}`}
            >
              使用已验证的教育邮箱
            </Label>
          </div>

          {useVerifiedEmail && canReuseEmail ? (
            <div className="space-y-2">
              <Label>已验证邮箱</Label>
              <Input value={verifiedEmail!} disabled className="bg-muted" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="reg-email">注册邮箱</Label>
                <div className="flex gap-2">
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSendCode}
                    disabled={!email || loading}
                  >
                    {codeSent ? "重发" : "发送"}
                  </Button>
                </div>
              </div>
              {codeSent && (
                <div className="space-y-2">
                  <Label htmlFor="reg-code">验证码</Label>
                  <Input
                    id="reg-code"
                    placeholder="6位验证码"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reg-password">设置密码</Label>
            <Input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-confirm">确认密码</Label>
            <Input
              id="reg-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleRegisterAndVote}
            disabled={loading || !password || !confirmPassword}
          >
            {loading ? "处理中..." : "注册并投票"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
