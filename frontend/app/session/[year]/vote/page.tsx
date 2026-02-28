"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { useVoteStore } from "@/hooks/useVoteStore"
import { api } from "@/lib/api"
import { SelectSchool } from "@/app/vote/steps/SelectSchool"
import { Verify } from "@/app/vote/steps/Verify"
import { VoteForm } from "@/app/vote/steps/VoteForm"
import { NicknameConflict } from "@/app/vote/steps/NicknameConflict"

export default function SessionVotePage() {
  const params = useParams()
  const router = useRouter()
  const yearParam = params.year as string
  const store = useVoteStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadSession() {
      const year = parseInt(yearParam)
      if (isNaN(year)) {
        try {
          const current = await api.sessions.current()
          router.replace(`/session/${current.year}/vote`)
        } catch (e) {
          console.error("Failed to load current session", e)
          setLoading(false)
        }
        return
      }

      if (store.session?.year !== year) {
        store.reset()
      }

      try {
        const session = await api.sessions.current()
        // If current session's year doesn't match the URL, treat it as "no active session for this year"
        if (session.year === year) {
          store.setSession(session)
        }
      } catch (e) {
        console.error("Failed to fetch session", e)
      } finally {
        setLoading(false)
      }
    }
    loadSession()
  }, [yearParam, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!store.session || store.session.year !== parseInt(yearParam)) {
    return (
      <div className="container py-20 text-center">
        <h2 className="text-2xl font-bold mb-4">暂无进行中的投票</h2>
        <p className="text-muted-foreground">该年份的投票尚未开启或已结束</p>
      </div>
    )
  }

  return (
    <div className="container py-8 max-w-3xl mx-auto px-4">
      {store.step === "select-school" && <SelectSchool />}
      {store.step === "verify" && <Verify />}
      {store.step === "vote" && <VoteForm />}
      {store.step === "conflict" && <NicknameConflict />}
    </div>
  )
}
