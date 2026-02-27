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
  1: "border-primary bg-primary/15 text-primary",
  0: "border-muted-foreground/40 bg-muted text-muted-foreground",
  [-1]: "border-destructive/60 bg-destructive/10 text-destructive",
}

export function AwardCard({ award, votes, onVote }: Props) {
  const maxSupport = award.score_config.max_count["1"] ?? 4
  const supportCount = award.nominees.filter((n) => votes[n.id] === 1).length

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-sm">{award.name}</h3>
          {award.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{award.description}</p>
          )}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          支持 {supportCount}/{maxSupport}
        </span>
      </div>

      <div className="space-y-2">
        {award.nominees.map((nominee) => {
          const current = votes[nominee.id]
          const canSupport = supportCount < maxSupport || current === 1
          return (
            <div key={nominee.id} className="flex items-center gap-2">
              <span className="text-sm flex-1 truncate min-w-0">{nominee.name}</span>
              <div className="flex gap-1 shrink-0">
                {[1, 0, -1].map((score) => {
                  const isActive = current === score
                  const disabled = score === 1 && !canSupport && !isActive
                  return (
                    <button
                      key={score}
                      disabled={disabled}
                      onClick={() => onVote(nominee.id, score)}
                      className={cn(
                        "px-2 py-1 text-xs rounded border transition-all",
                        isActive
                          ? SCORE_ACTIVE[score]
                          : "border-border hover:border-primary/40",
                        disabled && "opacity-30 cursor-not-allowed pointer-events-none"
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
