"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface KVEditorProps {
  value: Record<string, number>
  onChange: (value: Record<string, number>) => void
}

export function KVEditor({ value, onChange }: KVEditorProps) {
  const rows = Object.entries(value || {})
  const [editingKey, setEditingKey] = React.useState<string | null>(null)
  const [tempKey, setTempKey] = React.useState("")

  const addRow = () => {
    // Find a unique key for the new row
    let newKey = "new_key"
    let counter = 1
    while (newKey in (value || {})) {
      newKey = `new_key_${counter}`
      counter++
    }
    onChange({ ...(value || {}), [newKey]: 0 })
  }

  const removeRow = (key: string) => {
    const newValue = { ...(value || {}) }
    delete newValue[key]
    onChange(newValue)
  }

  const startEditKey = (oldKey: string) => {
    setEditingKey(oldKey)
    setTempKey(oldKey)
  }

  const finishEditKey = (oldKey: string) => {
    const newKey = tempKey.trim()
    if (!newKey || newKey === oldKey) {
      setEditingKey(null)
      return
    }
    if (newKey in (value || {}) && newKey !== oldKey) {
      alert("键名已存在")
      setEditingKey(null)
      return
    }
    const newValue = { ...(value || {}) }
    const val = newValue[oldKey]
    delete newValue[oldKey]
    newValue[newKey] = val
    onChange(newValue)
    setEditingKey(null)
  }

  const updateValue = (key: string, newVal: number) => {
    onChange({ ...(value || {}), [key]: newVal })
  }

  return (
    <div className="space-y-4">
      {rows.map(([key, val], index) => (
        <div key={index} className="flex gap-2 items-center">
          <Input
            placeholder="Key"
            value={editingKey === key ? tempKey : key}
            onChange={(e) => {
              if (editingKey === key) {
                setTempKey(e.target.value)
              }
            }}
            onFocus={() => startEditKey(key)}
            onBlur={() => finishEditKey(key)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur()
              }
            }}
            className="flex-1"
          />
          <Input
            type="number"
            placeholder="Value"
            value={val}
            onChange={(e) => updateValue(key, Number(e.target.value))}
            className="w-[100px]"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeRow(key)}
            className="text-destructive shrink-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="mr-2 h-4 w-4" />
        Add
      </Button>
    </div>
  )
}
