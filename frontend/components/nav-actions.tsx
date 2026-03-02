"use client"

import { useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { User } from "lucide-react"
import { clearTokens } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { navigationMenuTriggerStyle } from "@/components/ui/navigation-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useAuthStore } from "@/hooks/useAuthStore"

export function NavActions() {
  const router = useRouter()
  const { user, loading, refresh, clear } = useAuthStore()

  useEffect(() => {
    refresh()
  }, [])

  const handleLogout = () => {
    clearTokens()
    clear()
    router.push("/auth/login")
  }

  if (loading) return null

  return (
    <div className="flex items-center gap-2">
      {user && (user.role === "school_admin" || user.role === "super_admin") && (
        <Link href="/admin/session" className={navigationMenuTriggerStyle()}>
          管理后台
        </Link>
      )}

      {user && user.is_guest && (
        <Link href="/auth/register" className={navigationMenuTriggerStyle()}>
          升级账号
        </Link>
      )}

      {user && (
        <Link href="/account" className={`${navigationMenuTriggerStyle()} flex items-center gap-1.5`}>
          <User className="h-4 w-4" />
          <span>{user.nickname}</span>
        </Link>
      )}

      {user ? (
        user.is_guest ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm">退出</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认退出访客账户？</AlertDialogTitle>
                <AlertDialogDescription>
                  访客账户没有密码。退出后，如需继续投票，需要重新通过学校身份验证。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout}>确认退出</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            退出
          </Button>
        )
      ) : (
        <Link href="/auth/login" className={navigationMenuTriggerStyle()}>
          登录
        </Link>
      )}
    </div>
  )
}

export function AdminNavLink() {
  return (
    <Suspense fallback={null}>
      <NavActions />
    </Suspense>
  )
}
