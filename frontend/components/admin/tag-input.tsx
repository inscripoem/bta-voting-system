"use client"

import * as React from "react"
import { X } from "lucide-react"

interface TagInputProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  prefix?: string
}

export function TagInput({ value, onChange, placeholder = "Add tag...", prefix }: TagInputProps) {
  const [inputValue, setInputValue] = React.useState("")

  const displayTag = (tag: string) =>
    prefix && tag.startsWith(prefix) ? tag.slice(prefix.length) : tag

  const storeTag = (raw: string) => {
    const stripped = prefix && raw.startsWith(prefix) ? raw.slice(prefix.length) : raw
    return prefix ? prefix + stripped : stripped
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      const raw = inputValue.trim().replace(/,$/, "")
      if (!raw) return
      const stored = storeTag(raw)
      if (!value.includes(stored)) {
        onChange([...value, stored])
      }
      setInputValue("")
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((tag) => (
          <span
            key={tag}
            className="bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-sm flex items-center gap-1"
          >
            {displayTag(tag)}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:text-destructive focus:outline-none"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center rounded-md border border-input bg-background overflow-hidden">
        {prefix && (
          <span className="pl-3 pr-1 text-sm text-muted-foreground select-none">{prefix}</span>
        )}
        <input
          className="flex-1 py-2 pr-3 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <p className="text-[0.8rem] text-muted-foreground">
        按回车或逗号添加标签。
      </p>
    </div>
  )
}
