"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface ScoreLabelEditorProps {
  /** score (as string key) -> display label */
  value: Record<string, string>
  onChange: (value: Record<string, string>) => void
}

const DEFAULT_LABELS: Record<string, string> = {
  "1": "支持",
  "0": "没看过",
  "-1": "不支持",
}

export function ScoreLabelEditor({ value, onChange }: ScoreLabelEditorProps) {
  const entries = Object.entries(value || {})

  const update = (next: Record<string, string>) => {
    onChange(Object.fromEntries(Object.entries(next).filter(([, label]) => label.trim() !== "")))
  }

  const addRow = () => {
    let newScore = "0"
    let counter = 2
    while (newScore in (value || {})) {
      newScore = String(counter)
      counter++
    }
    // New rows start with an empty label; bypass the empty-label filter in
    // update() so the row actually appears and stays until filled or removed.
    onChange({ ...(value || {}), [newScore]: "" })
  }

  const removeRow = (score: string) => {
    const next = { ...(value || {}) }
    delete next[score]
    onChange(next)
  }

  const changeScore = (oldScore: string, newScore: string) => {
    const trimmed = newScore.trim()
    if (trimmed === "" || trimmed === oldScore) return
    if (trimmed in (value || {})) {
      alert("分值已存在")
      return
    }
    const next: Record<string, string> = {}
    for (const [k, v] of Object.entries(value || {})) {
      next[k === oldScore ? trimmed : k] = v
    }
    onChange(next)
  }

  const changeLabel = (score: string, label: string) => {
    update({ ...(value || {}), [score]: label })
  }

  if (entries.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">尚未配置分值，使用默认：1=支持，0=没看过，-1=不支持</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...DEFAULT_LABELS })}
        >
          <Plus className="mr-2 h-4 w-4" />
          使用默认分值
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {entries.map(([score, label]) => (
        <div key={score} className="flex gap-2 items-center">
          <Input
            type="number"
            defaultValue={score}
            onBlur={(e) => changeScore(score, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur()
              }
            }}
            className="w-[100px]"
            aria-label="分值"
          />
          <Input
            placeholder="显示名称"
            value={label}
            onChange={(e) => changeLabel(score, e.target.value)}
            className="flex-1"
            aria-label="显示名称"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeRow(score)}
            className="text-destructive shrink-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="mr-2 h-4 w-4" />
        添加分值
      </Button>
    </div>
  )
}
