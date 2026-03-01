"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface VerificationQuestion {
  question: string
  answer?: string
}

interface RepeaterFieldProps {
  value: VerificationQuestion[]
  onChange: (value: VerificationQuestion[]) => void
}

export function RepeaterField({ value, onChange }: RepeaterFieldProps) {
  const addRow = () => {
    onChange([...(value || []), { question: "", answer: "" }])
  }

  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const updateRow = (index: number, updates: Partial<VerificationQuestion>) => {
    onChange(
      value.map((row, i) => (i === index ? { ...row, ...updates } : row))
    )
  }

  return (
    <div className="space-y-4">
      {(value || []).map((row, index) => (
        <div key={index} className="space-y-1 rounded-md border p-3">
          <div className="flex gap-2 items-center">
            <Input
              placeholder="题目"
              value={row.question}
              onChange={(e) => updateRow(index, { question: e.target.value })}
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeRow(index)}
              className="text-destructive shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Input
            placeholder="答案（用于验证，大小写不敏感）"
            value={row.answer ?? ""}
            onChange={(e) => updateRow(index, { answer: e.target.value })}
          />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="mr-2 h-4 w-4" />
        添加题目
      </Button>
    </div>
  )
}
