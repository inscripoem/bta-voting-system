"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface VerificationQuestion {
  question: string
  type: string
}

interface RepeaterFieldProps {
  value: VerificationQuestion[]
  onChange: (value: VerificationQuestion[]) => void
}

export function RepeaterField({ value, onChange }: RepeaterFieldProps) {
  const addRow = () => {
    onChange([...(value || []), { question: "", type: "input" }])
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
        <div key={index} className="flex gap-2 items-center">
          <Input
            placeholder="Question"
            value={row.question}
            onChange={(e) => updateRow(index, { question: e.target.value })}
            className="flex-1"
          />
          <Select
            value={row.type}
            onValueChange={(val) => updateRow(index, { type: val })}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="input">Input</SelectItem>
              <SelectItem value="select">Select</SelectItem>
            </SelectContent>
          </Select>
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
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="mr-2 h-4 w-4" />
        Add row
      </Button>
    </div>
  )
}
