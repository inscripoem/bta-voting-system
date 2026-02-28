"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"

export default function VoteRedirectPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function redirect() {
      try {
        const session = await api.sessions.current()
        router.replace(`/session/${session.year}/vote`)
      } catch (e) {
        console.error("Failed to load current session", e)
        setLoading(false)
      }
    }
    redirect()
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="container py-20 text-center">
      <h2 className="text-2xl font-bold mb-4">暂无进行中的投票</h2>
      <p className="text-muted-foreground">目前没有任何活跃的投票会话</p>
    </div>
  )
}
