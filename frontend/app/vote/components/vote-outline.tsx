"use client"

import { useState, useEffect, useCallback } from "react"
import { Award } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Check, Circle, Menu, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

interface OutlineItem {
  id: string
  name: string
  category: "mandatory" | "optional" | "entertainment"
  completed: boolean
  progress: string
}

interface VoteOutlineProps {
  awards: Award[]
  votes: Record<string, number>
  onNavigate: (awardId: string) => void
}

export function VoteOutline({ awards, votes, onNavigate }: VoteOutlineProps) {
  const [activeId, setActiveId] = useState<string>("")
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)

  const outlineItems: OutlineItem[] = awards.map((award) => {
    const maxSupport = award.score_config.max_count["1"] ?? 4
    const supportCount = award.nominees.filter((n) => votes[n.id] === 1).length
    const completed = award.category === "mandatory" ? supportCount >= maxSupport : true

    return {
      id: award.id,
      name: award.name,
      category: award.category,
      completed,
      progress: `${supportCount}/${maxSupport}`,
    }
  })

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      {
        rootMargin: "-20% 0px -60% 0px",
        threshold: 0,
      }
    )

    awards.forEach((award) => {
      const element = document.getElementById(`award-${award.id}`)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [awards])

  const handleNavigate = useCallback(
    (awardId: string) => {
      onNavigate(awardId)
      setIsOpen(false)
    },
    [onNavigate]
  )

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case "mandatory":
        return "正赛"
      case "optional":
        return "附加"
      case "entertainment":
        return "娱乐"
      default:
        return ""
    }
  }

  const groupedItems = outlineItems.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = []
      acc[item.category].push(item)
      return acc
    },
    {} as Record<string, OutlineItem[]>
  )

  const totalCompleted = outlineItems.filter((i) => i.completed).length
  const totalItems = outlineItems.length

  const OutlineContent = () => (
    <div className="space-y-4">
      {["mandatory", "optional", "entertainment"].map(
        (category) =>
          groupedItems[category]?.length > 0 && (
            <div key={category} className="space-y-1">
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2">
                {getCategoryLabel(category)}
              </h4>
              <div className="space-y-0.5">
                {groupedItems[category].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left",
                      activeId === `award-${item.id}`
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted text-foreground"
                    )}
                  >
                    {item.completed ? (
                      <Check className="w-3 h-3 text-green-500 shrink-0" />
                    ) : (
                      <Circle className="w-3 h-3 text-muted-foreground shrink-0" />
                    )}
                    <span className="flex-1 truncate">{item.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {item.progress}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )
      )}
    </div>
  )

  return (
    <>
      {/* 桌面端 - 悬浮可折叠面板 */}
      <div
        className={cn(
          "hidden lg:flex fixed right-4 top-20 z-40 transition-all duration-300",
          isExpanded ? "translate-x-0" : "translate-x-[calc(100%+16px)]"
        )}
      >
        <div className="bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-lg overflow-hidden">
          {/* 展开状态 */}
          <div className={cn("w-56 transition-all", isExpanded ? "opacity-100" : "opacity-0 w-0")}>
            <div className="p-3 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">投票大纲</h3>
                <span className="text-xs text-muted-foreground">
                  {totalCompleted}/{totalItems}
                </span>
              </div>
            </div>
            <div className="p-2 max-h-[calc(100vh-12rem)] overflow-y-auto">
              <OutlineContent />
            </div>
          </div>
        </div>

        {/* 切换按钮 - 始终可见 */}
        <Button
          variant="secondary"
          size="icon"
          onClick={() => setIsExpanded(!isExpanded)}
          className="absolute left-0 top-0 -translate-x-full -ml-2 rounded-full shadow-lg bg-card/95 backdrop-blur-sm border border-border"
        >
          <ChevronRight
            className={cn(
              "w-4 h-4 transition-transform",
              isExpanded ? "rotate-180" : ""
            )}
          />
        </Button>
      </div>

      {/* 移动端 - Sheet 滑出 */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => setIsOpen(true)}
          className="fixed right-4 bottom-20 lg:hidden z-50 rounded-full shadow-lg bg-card/95 backdrop-blur-sm border border-border"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <SheetContent side="right" className="w-64">
          <SheetHeader className="pb-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-sm">投票大纲</SheetTitle>
              <span className="text-xs text-muted-foreground">
                {totalCompleted}/{totalItems}
              </span>
            </div>
          </SheetHeader>
          <OutlineContent />
        </SheetContent>
      </Sheet>
    </>
  )
}
