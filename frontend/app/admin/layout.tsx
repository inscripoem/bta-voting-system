"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const navItems = [
  { href: "/admin/session", label: "投票状态" },
  { href: "/admin/schools", label: "学校管理" },
  { href: "/admin/awards", label: "奖项管理" },
  { href: "/admin/export", label: "导出数据" },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="container py-8 max-w-5xl mx-auto px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">管理后台</h1>
        <nav className="flex gap-1 border-b pb-0">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground",
                ].join(" ")}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
      <div>{children}</div>
    </div>
  )
}
