"use client"

import { useEffect, useState } from "react"
import { api, UserInfo, APIError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function AccountPage() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)
  const [userError, setUserError] = useState<string | null>(null)

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
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-4">
              升级为正式用户可保留历年投票记录，并通过邮箱密码登录。
            </p>
            <Button asChild className="w-full">
              <a href="/auth/register">升级账户</a>
            </Button>
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
