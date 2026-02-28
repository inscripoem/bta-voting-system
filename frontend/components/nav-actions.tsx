"use client"

import { useEffect, useState, Suspense } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, clearTokens, UserInfo } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { navigationMenuTriggerStyle } from "@/components/ui/navigation-menu"

export function NavActions() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUser() {
      try {
        const data = await api.me.get()
        setUser(data)
      } catch (err) {
        setUser(null)
      } finally {
        setLoading(false)
      }
    }
    fetchUser()
  }, [])

  const handleLogout = () => {
    clearTokens()
    setUser(null)
    router.push("/auth/login")
    // Force reload to update UI state if needed
    router.refresh()
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

      {user ? (
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          退出
        </Button>
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
