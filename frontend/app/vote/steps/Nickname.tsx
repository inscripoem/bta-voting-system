"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/navigation"
import { ArrowLeft, AlertCircle } from "lucide-react"
import { api, APIError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useVoteStore } from "@/hooks/useVoteStore"

export function Nickname() {
  const { school, setNickname, setConflict, goTo } = useVoteStore()
  const [nickname, setLocal] = useState("")
  const [error, setError] = useState("")
  const [formalConflict, setFormalConflict] = useState(false)
  const [guestConflict, setGuestConflict] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus()
    }, 100)
  }, [])

  async function handleContinue() {
    const trimmed = nickname.trim()
    if (!trimmed) {
      setError("请输入昵称")
      return
    }
    if (!school) return
    setLoading(true)
    setError("")
    setFormalConflict(false)
    setGuestConflict(false)
    try {
      const result = await api.auth.checkNickname(trimmed, school.code)
      if (result.available) {
        setNickname(trimmed)
        goTo("verify")
      } else if (result.conflict === "same_school") {
        if (result.is_guest) {
          setGuestConflict(true)
          setError("该昵称在当前学校已被使用（游客身份）")
        } else {
          setFormalConflict(true)
          setError("该昵称已被正式用户注册，请登录或换一个昵称")
        }
      }
    } catch (err) {
      setError(err instanceof APIError ? err.message : "检查昵称失败，请重试")
    } finally {
      setLoading(false)
    }
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
            disabled={loading}
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
        <div className="space-y-2">
          <label htmlFor="nickname-input" className="text-sm font-medium">昵称</label>
          <input
            id="nickname-input"
            ref={inputRef}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            placeholder="设置你的唯一昵称"
            value={nickname}
            onChange={(e) => { setLocal(e.target.value); setError(""); setFormalConflict(false); setGuestConflict(false) }}
            onKeyDown={(e) => e.key === "Enter" && handleContinue()}
            disabled={loading}
          />
          
          {error && (
            <Alert variant="destructive" className="py-2 px-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {formalConflict && (
            <div className="bg-muted/50 p-3 rounded-md border space-y-2">
              <p className="text-xs text-muted-foreground">如果您是该昵称的主人，请直接登录：</p>
              <Button asChild variant="outline" size="sm" className="w-full">
                <a href="/auth/login">前往登录</a>
              </Button>
            </div>
          )}

          {guestConflict && (
            <div className="bg-muted/50 p-3 rounded-md border space-y-2">
              <p className="text-xs text-muted-foreground">该昵称尚未被注册为正式账号，您可以：</p>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => {
                    setNickname(nickname.trim())
                    setConflict("same_school", nickname.trim(), true)
                  }}
                >
                  继续并认领
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => { setLocal(""); inputRef.current?.focus() }}
                >
                  更换昵称
                </Button>
              </div>
            </div>
          )}
        </div>
        <Button className="w-full" onClick={handleContinue} disabled={loading || !!error}>
          {loading ? "检查中…" : "继续"}
        </Button>
      </CardContent>
    </Card>
  )
}
