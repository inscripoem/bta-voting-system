"use client"

import { useEffect, useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search } from "lucide-react"
import { api, School } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useVoteStore } from "@/hooks/useVoteStore"

export function SelectSchool() {
  const [schools, setSchools] = useState<School[]>([])
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<School | null>(null)
  const [loading, setLoading] = useState(false)
  const { setSchool, setSession, goTo } = useVoteStore()
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.schools.list().then(setSchools).catch(console.error)
    setTimeout(() => {
      searchInputRef.current?.focus()
    }, 100)
  }, [])

  const filteredSchools = schools.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase())
  )

  async function handleNext() {
    if (!selected) return
    setLoading(true)
    try {
      const [detail, session] = await Promise.all([
        api.schools.get(selected.code),
        api.sessions.current(),
      ])
      setSchool(selected, detail)
      setSession(session)
      goTo("nickname")
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>选择你的学校</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="搜索学校名称或缩写..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
          <AnimatePresence>
            {filteredSchools.map((s) => (
              <motion.button
                key={s.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={() => setSelected(s)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                  selected?.id === s.id
                    ? "border-primary bg-primary/10 text-primary shadow-sm"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {s.name}
              </motion.button>
            ))}
          </AnimatePresence>
          {filteredSchools.length === 0 && schools.length > 0 && (
            <p className="text-center py-8 text-muted-foreground text-sm">
              没有找到相关学校
            </p>
          )}
        </div>

        <Button
          className="w-full"
          disabled={!selected || loading}
          onClick={handleNext}
        >
          {loading ? "加载中…" : "下一步"}
        </Button>
      </CardContent>
    </Card>
  )
}
