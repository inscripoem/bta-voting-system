"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const navItems = [
  { href: "/admin/session", label: "投票会话" },
  { href: "/admin/schools", label: "学校管理" },
  { href: "/admin/awards", label: "奖项管理" },
  { href: "/admin/votes", label: "投票数据" },
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/export", label: "数据导出" },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    api.me
      .get()
      .then((user) => {
        if (user.role === "school_admin" || user.role === "super_admin") {
          setAuthorized(true)
        } else {
          setAuthorized(false)
          router.push("/auth/login")
        }
      })
      .catch(() => {
        setAuthorized(false)
        router.push("/auth/login")
      })
  }, [router])

  if (authorized === null) {
    return (
      <div className="container py-8 max-w-5xl mx-auto px-4">
        <p className="text-muted-foreground text-sm">加载中…</p>
      </div>
    )
  }

  if (authorized === false) {
    return null
  }

  const activeTab = navItems.find((item) => pathname.startsWith(item.href))?.href || navItems[0].href

  return (
    <div className="container py-8 max-w-5xl mx-auto px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">管理后台</h1>
        <Tabs value={activeTab} onValueChange={(value) => router.push(value)}>
          <TabsList>
            {navItems.map((item) => (
              <TabsTrigger key={item.href} value={item.href}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div>{children}</div>
    </div>
  )
}
