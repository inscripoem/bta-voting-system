"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/api"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface CodeInfo {
  nickname: string
  external_provider?: string | null
}

// Human-readable names for trusted SSO providers.
const PROVIDER_NAMES: Record<string, string> = {
  cac_website: "CAC",
}

function AuthorizeHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [info, setInfo] = useState<CodeInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const fetched = useRef(false)

  const code = searchParams.get("code")
  const next = searchParams.get("next")

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    if (!code) {
      setError("缺少登录凭证，请从 CAC 网站重新进入。")
      return
    }
    api.auth
      .ssoCodeInfo(code)
      .then(setInfo)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "登录凭证无效或已过期，请从 CAC 网站重新进入。")
      })
  }, [code])

  const handleConfirm = () => {
    if (!code || confirming) return
    setConfirming(true)
    api.auth
      .consumeSsoCode(code)
      .then(() => {
        window.location.href = next && next.startsWith("/") ? next : "/"
      })
      .catch((err) => {
        setConfirming(false)
        setError(err instanceof Error ? err.message : "免登录失败，请重试")
      })
  }

  const providerName = info?.external_provider
    ? PROVIDER_NAMES[info.external_provider] ?? info.external_provider
    : null

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold">授权登录</CardTitle>
        <CardDescription>
          {providerName ? `${providerName} 账号免登录` : "第三方账号免登录"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button
              className="w-full"
              onClick={() => router.push(`/auth/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)}
            >
              前往登录页
            </Button>
          </>
        ) : !info ? (
          <div className="text-center text-muted-foreground">正在获取登录信息…</div>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold">
                {info.nickname.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{info.nickname}</p>
                <p className="text-sm text-muted-foreground">
                  使用{providerName ?? "第三方"}账号登录 BTA 投票系统
                </p>
              </div>
            </div>
            <Button className="w-full" onClick={handleConfirm} disabled={confirming}>
              {confirming ? "登录中…" : "确认登录"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => router.push("/")}>
              取消
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function AuthorizePage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
      <Suspense fallback={<div>Loading...</div>}>
        <AuthorizeHandler />
      </Suspense>
    </div>
  )
}
