"use client"

import { useState, Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api, School } from "@/lib/api"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") ?? "/"

  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [schoolCode, setSchoolCode] = useState("")
  const [schools, setSchools] = useState<School[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const looksLikeEmail = identifier.includes("@")

  useEffect(() => {
    api.schools.list().then(setSchools).catch(console.error)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!looksLikeEmail && !schoolCode) {
      setError("使用昵称登录时请选择学校")
      return
    }

    setLoading(true)

    try {
      await api.auth.login(identifier, password, looksLikeEmail ? undefined : schoolCode)
      window.location.href = next
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold">登录</CardTitle>
        <CardDescription>
          请输入您的邮箱或昵称和密码进行登录
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="identifier">邮箱或昵称</Label>
            <Input
              id="identifier"
              type="text"
              placeholder="请输入邮箱或昵称"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>
          {!looksLikeEmail && identifier && (
            <div className="space-y-2">
              <Label htmlFor="school">学校</Label>
              <Select value={schoolCode} onValueChange={setSchoolCode} required>
                <SelectTrigger id="school">
                  <SelectValue placeholder="请选择学校" />
                </SelectTrigger>
                <SelectContent>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.code}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "登录中..." : "登录"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
         <div className="text-sm text-center text-muted-foreground">
           还没有正式账号？ <Button variant="link" className="p-0 h-auto" onClick={() => router.push('/vote')}>去投票并升级</Button>
         </div>
      </CardFooter>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
      <Suspense fallback={<div>Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
