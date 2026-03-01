"use client"

import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useVoteStore } from "@/hooks/useVoteStore"

export function Nickname() {
  const { school, setNickname, goTo } = useVoteStore()
  const [nickname, setLocal] = useState("")
  const [error, setError] = useState("")

  function handleContinue() {
    const trimmed = nickname.trim()
    if (!trimmed) {
      setError("请输入昵称")
      return
    }
    setNickname(trimmed)
    goTo("verify")
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goTo("select-school")}
            className="-ml-2 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <CardTitle>设置昵称</CardTitle>
            <CardDescription>{school?.name}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">昵称</label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="设置你的唯一昵称"
            value={nickname}
            onChange={(e) => { setLocal(e.target.value); setError("") }}
            onKeyDown={(e) => e.key === "Enter" && handleContinue()}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <Button className="w-full" onClick={handleContinue}>
          继续
        </Button>
      </CardContent>
    </Card>
  )
}
