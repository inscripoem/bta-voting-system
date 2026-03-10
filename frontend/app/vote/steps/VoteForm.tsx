"use client"

import { useEffect, useState, useCallback } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { api, Award } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { useVoteStore } from "@/hooks/useVoteStore"
import { AwardCard } from "./AwardCard"
import { VoteOutline } from "../components/vote-outline"

const SHOW_INITIALLY = 3

export function VoteForm() {
  const { school, session } = useVoteStore()
  const [awards, setAwards] = useState<Award[]>([])
  const [votes, setVotes] = useState<Record<string, number>>({})
  const [showAllOptional, setShowAllOptional] = useState(false)
  const [showAllEntertainment, setShowAllEntertainment] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    if (!school || !session) return
    api.awards.list(school.id).then(setAwards).catch(console.error)
    api.vote.getItems(session.id).then((items) => {
      const map: Record<string, number> = {}
      items.forEach((it) => { map[it.nominee_id] = it.score })
      setVotes(map)
    }).catch(console.error)
  }, [school, session])

  const handleVote = useCallback(async (nomineeId: string, score: number) => {
    if (!session) return
    setVotes((prev) => ({ ...prev, [nomineeId]: score }))
    setSaving(true)
    setSaveError("")
    try {
      await api.vote.upsertItems(session.id, [{ nominee_id: nomineeId, score }])
      setLastSavedAt(new Date())
    } catch {
      setSaveError("保存失败，请重试")
    } finally {
      setSaving(false)
    }
  }, [session])

  const handleNavigate = useCallback((awardId: string) => {
    const element = document.getElementById(`award-${awardId}`)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [])

  const mandatory = awards.filter((a) => a.category === "mandatory")
  const optional = awards.filter((a) => a.category === "optional")
  const entertainment = awards.filter((a) => a.category === "entertainment")

  const visibleOptional = showAllOptional ? optional : optional.slice(0, SHOW_INITIALLY)
  const visibleEntertainment = showAllEntertainment ? entertainment : entertainment.slice(0, SHOW_INITIALLY)

  return (
    <div className="relative">
      {/* 大纲导航 - 桌面端固定右侧 */}
      <VoteOutline awards={awards} votes={votes} onNavigate={handleNavigate} />

      {/* 主内容区 */}
      <div className="max-w-7xl mx-auto space-y-8 pb-16 px-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">投票</h1>
          <span className="text-xs text-muted-foreground">
            {saving
              ? "保存中…"
              : saveError
              ? <span className="text-destructive">{saveError}</span>
              : lastSavedAt
              ? `保存于 ${lastSavedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
              : null}
          </span>
        </div>

        {/* Mandatory awards */}
        {mandatory.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              正赛奖项（必填）
            </h2>
            <div className="space-y-8">
              {mandatory.map((award) => (
                <div key={award.id} id={`award-${award.id}`}>
                  <AwardCard award={award} votes={votes} onVote={handleVote} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Optional awards */}
        {optional.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              附加奖项（选填）
            </h2>
            <div className="space-y-8">
              <AnimatePresence initial={false}>
                {visibleOptional.map((award) => (
                  <motion.div
                    key={award.id}
                    id={`award-${award.id}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <AwardCard award={award} votes={votes} onVote={handleVote} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            {optional.length > SHOW_INITIALLY && !showAllOptional && (
              <Button variant="outline" className="w-full" onClick={() => setShowAllOptional(true)}>
                展开全部 ({optional.length})
              </Button>
            )}
          </section>
        )}

        {/* Entertainment awards */}
        {entertainment.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              本校娱乐奖项
            </h2>
            <div className="space-y-8">
              <AnimatePresence initial={false}>
                {visibleEntertainment.map((award) => (
                  <motion.div
                    key={award.id}
                    id={`award-${award.id}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <AwardCard award={award} votes={votes} onVote={handleVote} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            {entertainment.length > SHOW_INITIALLY && !showAllEntertainment && (
              <Button variant="outline" className="w-full" onClick={() => setShowAllEntertainment(true)}>
                展开全部 ({entertainment.length})
              </Button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
