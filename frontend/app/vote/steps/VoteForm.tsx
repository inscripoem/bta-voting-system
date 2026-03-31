"use client"

import { useEffect, useState, useCallback } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { api, Award } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useVoteStore } from "@/hooks/useVoteStore"
import { AwardCard } from "./AwardCard"
import { VoteOutline } from "../components/vote-outline"

const SHOW_INITIALLY = 3

function VoteSkeleton() {
  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16 px-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-32" />
      </div>
      {[1, 2].map((i) => (
        <section key={i} className="space-y-6">
          <Skeleton className="h-4 w-40" />
          <div className="space-y-8">
            {[1, 2].map((j) => (
              <div key={j} className="space-y-4">
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function VoteForm() {
  const { school, session } = useVoteStore()
  const [awards, setAwards] = useState<Award[]>([])
  const [votes, setVotes] = useState<Record<string, number>>({})
  const [showAllOptional, setShowAllOptional] = useState(false)
  const [showAllEntertainment, setShowAllEntertainment] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!school || !session) return
    setLoading(true)
    Promise.all([
      api.awards.list(school.id),
      api.vote.getItems(session.id)
    ]).then(([awardsRes, itemsRes]) => {
      setAwards(awardsRes)
      const map: Record<string, number> = {}
      itemsRes.forEach((it) => { map[it.nominee_id] = it.score })
      setVotes(map)
    })
    .catch(console.error)
    .finally(() => setLoading(false))
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

  const mandatory = awards.filter((a) => a.category === "mandatory")
  const optional = awards.filter((a) => a.category === "optional")
  const entertainment = awards.filter((a) => a.category === "entertainment")

  const visibleOptional = showAllOptional ? optional : optional.slice(0, SHOW_INITIALLY)
  const visibleEntertainment = showAllEntertainment ? entertainment : entertainment.slice(0, SHOW_INITIALLY)

  const handleNavigate = useCallback((awardId: string) => {
    const isInOptional = optional.some((a) => a.id === awardId)
    const isInEntertainment = entertainment.some((a) => a.id === awardId)
    if (isInOptional && !showAllOptional) setShowAllOptional(true)
    if (isInEntertainment && !showAllEntertainment) setShowAllEntertainment(true)
    // 等待 React 渲染展开后的元素再滚动
    setTimeout(() => {
      document.getElementById(`award-${awardId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 0)
  }, [optional, entertainment, showAllOptional, showAllEntertainment])

  if (loading) return <VoteSkeleton />

  return (
    <div className="relative">
      {/* 大纲导航 - 桌面端固定右侧 */}
      <VoteOutline awards={awards} votes={votes} onNavigate={handleNavigate} expandedOptional={showAllOptional} expandedEntertainment={showAllEntertainment} />

      {/* 主内容区 */}
      <div className="max-w-7xl mx-auto space-y-8 pb-16 px-4">
        <div className="flex items-center justify-between sticky top-[3.5rem] z-20 bg-background/80 backdrop-blur-sm py-4 border-b -mx-4 px-4 mb-4">
          <h1 className="text-xl font-bold tracking-tight">投票</h1>
          <div className="flex items-center gap-2 text-xs font-medium">
            {saving ? (
              <span className="flex items-center gap-1.5 text-muted-foreground animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin" />
                正在保存...
              </span>
            ) : saveError ? (
              <span className="flex items-center gap-1.5 text-destructive">
                <AlertCircle className="h-3 w-3" />
                {saveError}
              </span>
            ) : lastSavedAt ? (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                已自动保存 {lastSavedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            ) : (
              <span className="text-muted-foreground italic">选择选项后将自动保存</span>
            )}
          </div>
        </div>

        {/* Mandatory awards */}
        {mandatory.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-primary" />
              <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                正赛奖项 <span className="text-primary/70 ml-1">（必填）</span>
              </h2>
            </div>
            <div className="grid gap-8">
              {mandatory.map((award) => (
                <div key={award.id} id={`award-${award.id}`} className="scroll-mt-24">
                  <AwardCard award={award} votes={votes} onVote={handleVote} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Optional awards */}
        {optional.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
              <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                附加奖项 <span className="font-normal text-muted-foreground/60 ml-1">（选填）</span>
              </h2>
            </div>
            <div className="grid gap-8">
              <AnimatePresence initial={false}>
                {visibleOptional.map((award) => (
                  <motion.div
                    key={award.id}
                    id={`award-${award.id}`}
                    className="scroll-mt-24"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <AwardCard award={award} votes={votes} onVote={handleVote} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            {optional.length > SHOW_INITIALLY && !showAllOptional && (
              <Button 
                variant="outline" 
                className="w-full h-12 border-dashed hover:border-primary/50 transition-all" 
                onClick={() => setShowAllOptional(true)}
              >
                展开全部附加奖项 ({optional.length})
              </Button>
            )}
          </section>
        )}

        {/* Entertainment awards */}
        {entertainment.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-orange-400" />
              <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                本校娱乐奖项
              </h2>
            </div>
            <div className="grid gap-8">
              <AnimatePresence initial={false}>
                {visibleEntertainment.map((award) => (
                  <motion.div
                    key={award.id}
                    id={`award-${award.id}`}
                    className="scroll-mt-24"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <AwardCard award={award} votes={votes} onVote={handleVote} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            {entertainment.length > SHOW_INITIALLY && !showAllEntertainment && (
              <Button 
                variant="outline" 
                className="w-full h-12 border-dashed hover:border-orange-400/50 transition-all" 
                onClick={() => setShowAllEntertainment(true)}
              >
                展开全部娱乐奖项 ({entertainment.length})
              </Button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
