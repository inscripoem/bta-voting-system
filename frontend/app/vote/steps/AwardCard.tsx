"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Award } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Info } from "lucide-react"

interface Props {
  award: Award
  votes: Record<string, number> // nomineeId → score
  onVote: (nomineeId: string, score: number) => void
}

const SCORE_LABELS: Record<number, string> = {
  1: "支持",
  0: "没看过",
  [-1]: "不支持",
}

const SCORE_ACTIVE: Record<number, string> = {
  1: "border-primary bg-primary/15 text-primary shadow-sm",
  0: "border-muted-foreground/40 bg-muted text-muted-foreground",
  [-1]: "border-destructive/60 bg-destructive/10 text-destructive",
}

export function AwardCard({ award, votes, onVote }: Props) {
  const maxSupport = award.score_config.max_count["1"] ?? 4
  const supportCount = award.nominees.filter((n) => votes[n.id] === 1).length

  return (
    <div className="space-y-4">
      {/* 奖项头部信息 */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-lg text-foreground">{award.name}</h3>
          {award.description && (
            <p className="text-sm text-muted-foreground mt-1">{award.description}</p>
          )}
        </div>
        <div className="bg-primary/10 text-primary px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap shrink-0">
          支持 {supportCount} / {maxSupport}
        </div>
      </div>

      {/* 提名网格 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {award.nominees.map((nominee) => {
          const current = votes[nominee.id]
          const canSupport = supportCount < maxSupport || current === 1

          return (
            <NomineeCard
              key={nominee.id}
              nominee={nominee}
              awardType={award.type}
              currentVote={current}
              canSupport={canSupport}
              onVote={onVote}
            />
          )
        })}
      </div>
    </div>
  )
}

// 单个提名卡片组件
interface NomineeCardProps {
  nominee: {
    id: string
    name: string
    description?: string | null
    cover_image_url?: string | null
    related_name?: string | null
    related_image_url?: string | null
  }
  awardType: string
  currentVote: number | undefined
  canSupport: boolean
  onVote: (nomineeId: string, score: number) => void
}

function NomineeCard({ nominee, awardType, currentVote, canSupport, onVote }: NomineeCardProps) {
  const [showInfo, setShowInfo] = useState(false)
  const [isLongPress, setIsLongPress] = useState(false)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // 鼠标悬停
  const handleMouseEnter = useCallback(() => {
    if (nominee.description) {
      setShowInfo(true)
    }
  }, [nominee.description])

  const handleMouseLeave = useCallback(() => {
    setShowInfo(false)
  }, [])

  // 触摸长按
  const handleTouchStart = useCallback(() => {
    if (nominee.description) {
      longPressTimer.current = setTimeout(() => {
        setIsLongPress(true)
        setShowInfo(true)
      }, 500) // 500ms 长按触发
    }
  }, [nominee.description])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    // 延迟关闭，让用户能看到信息
    setTimeout(() => {
      if (!isLongPress) {
        setShowInfo(false)
      }
    }, 100)
    setIsLongPress(false)
  }, [isLongPress])

  // 点击外部关闭
  useEffect(() => {
    if (!showInfo) return
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setShowInfo(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("touchstart", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("touchstart", handleClickOutside)
    }
  }, [showInfo])

  return (
    <div
      ref={cardRef}
      className="group relative rounded-xl border border-border bg-card overflow-hidden hover:border-primary/30 hover:shadow-md transition-all"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 图片区域 - 放大 */}
      <div className="relative aspect-[2/3] bg-muted overflow-hidden">
        {nominee.cover_image_url ? (
          <img
            src={nominee.cover_image_url}
            alt={nominee.name}
            className={cn(
              "w-full h-full object-cover transition-transform",
              showInfo ? "scale-110 blur-sm" : "group-hover:scale-105"
            )}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className={cn(
            "w-full h-full flex items-center justify-center transition-all",
            showInfo && "blur-sm"
          )}>
            <span className="text-4xl font-bold text-muted-foreground/30 select-none">
              {nominee.name.charAt(0)}
            </span>
          </div>
        )}

        {/* 信息提示图标（仅在移动端显示，提示可长按） */}
        {nominee.description && (
          <div className="absolute top-2 right-2 sm:hidden bg-black/50 text-white p-1.5 rounded-full backdrop-blur-sm">
            <Info className="w-4 h-4" />
          </div>
        )}

        {/* 详细信息浮层 */}
        {showInfo && nominee.description && (
          <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card rounded-lg p-4 max-h-full overflow-auto shadow-xl border border-border">
              <h5 className="font-semibold text-sm mb-2 text-foreground">{nominee.name}</h5>
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {nominee.description}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-3 text-center">
                点击外部关闭
              </p>
            </div>
          </div>
        )}

        {/* 关联信息悬浮标签 */}
        {nominee.related_name && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 bg-black/70 text-white px-2 py-1 rounded-full text-xs backdrop-blur-sm">
            {nominee.related_image_url ? (
              <img
                src={nominee.related_image_url}
                alt={nominee.related_name}
                className="w-4 h-4 rounded-full object-cover shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <span className="text-[8px] font-bold">
                  {nominee.related_name.charAt(0)}
                </span>
              </div>
            )}
            <span className="truncate font-medium">{nominee.related_name}</span>
          </div>
        )}
      </div>

      {/* 信息区域 */}
      <div className="p-3 space-y-2">
        {/* 提名名称 */}
        <h4 className="font-semibold text-sm text-foreground line-clamp-2 leading-snug min-h-[2.5rem]">
          {nominee.name}
        </h4>

        {/* 投票按钮组 - 竖排 */}
        <div className="flex flex-col gap-1.5">
          {[1, 0, -1].map((score) => {
            const isActive = currentVote === score
            const disabled = score === 1 && !canSupport && !isActive
            return (
              <button
                key={score}
                disabled={disabled}
                onClick={() => onVote(nominee.id, score)}
                className={cn(
                  "w-full px-2 py-2 text-xs font-medium rounded-md border transition-all active:scale-95",
                  isActive
                    ? SCORE_ACTIVE[score]
                    : "border-border bg-background hover:bg-muted text-foreground hover:border-border/80",
                  disabled && "opacity-40 cursor-not-allowed pointer-events-none grayscale"
                )}
              >
                {SCORE_LABELS[score]}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
