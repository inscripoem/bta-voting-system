"use client"

import { Award } from "@/lib/api"
import { cn } from "@/lib/utils"

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
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
      {/* 奖项头部信息 */}
      <div className="flex items-start justify-between gap-4 pb-3 border-b border-border/50">
        <div>
          <h3 className="font-semibold text-base text-foreground tracking-tight">{award.name}</h3>
          {award.description && (
            <p className="text-sm text-muted-foreground mt-1">{award.description}</p>
          )}
        </div>
        <div className="bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap shrink-0">
          支持 {supportCount} / {maxSupport}
        </div>
      </div>

      {/* 提名列表 */}
      <div className="grid gap-3">
        {award.nominees.map((nominee) => {
          const current = votes[nominee.id]
          const canSupport = supportCount < maxSupport || current === 1
          
          return (
            <div 
              key={nominee.id} 
              className="flex flex-col sm:flex-row gap-4 p-3 rounded-lg border border-border/60 bg-background hover:border-primary/30 transition-colors items-start sm:items-center relative overflow-hidden"
            >
              <div className="flex gap-4 flex-1 w-full items-center">
                <div className="relative shrink-0">
                  {nominee.cover_image_url ? (
                    <img
                      src={nominee.cover_image_url}
                      alt={nominee.name}
                      className={cn(
                        "w-16 h-20 sm:w-20 sm:h-28 object-cover rounded-md shadow-sm border border-border/50 shrink-0",
                        ["character", "staff", "seiyuu"].includes(award.type) 
                          ? "object-top" 
                          : "object-center"
                      )}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-16 h-20 sm:w-20 sm:h-28 rounded-md bg-muted flex items-center justify-center border border-border/50 shrink-0 shadow-sm">
                      <span className="text-xs text-muted-foreground/50">无封面</span>
                    </div>
                  )}
                </div>

                {/* 提名名称与关联信息 */}
                <div className="flex flex-col justify-center gap-1.5 flex-1 min-w-0 py-1">
                  <span className="text-base sm:text-lg font-bold text-foreground truncate leading-tight">
                    {nominee.name}
                  </span>
                  
                  {/* 关联信息展示气泡 */}
                  {nominee.related_name && (
                    <div className="flex items-center gap-2 bg-muted/60 text-muted-foreground w-fit pr-3 pl-1.5 py-1 rounded-full text-xs mt-1 border border-border/50">
                      {nominee.related_image_url ? (
                        <img 
                          src={nominee.related_image_url} 
                          alt={nominee.related_name}
                          className="w-4 h-4 rounded-full object-cover shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-border shrink-0" />
                      )}
                      <span className="truncate max-w-[150px] sm:max-w-[200px] font-medium">
                        {nominee.related_name}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 投票按钮组 */}
              <div className="flex gap-1.5 shrink-0 sm:ml-auto w-full sm:w-auto justify-end mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-none border-border/50">
                {[1, 0, -1].map((score) => {
                  const isActive = current === score
                  const disabled = score === 1 && !canSupport && !isActive
                  return (
                    <button
                      key={score}
                      disabled={disabled}
                      onClick={() => onVote(nominee.id, score)}
                      className={cn(
                        "flex-1 sm:flex-none px-3 py-1.5 text-sm font-medium rounded-md border transition-all active:scale-95",
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
          )
        })}
      </div>
    </div>
  )
}