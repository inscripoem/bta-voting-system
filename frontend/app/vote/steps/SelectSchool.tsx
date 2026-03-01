"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { api, School } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useVoteStore } from "@/hooks/useVoteStore"

export function SelectSchool() {
  const [schools, setSchools] = useState<School[]>([])
  const [selected, setSelected] = useState<School | null>(null)
  const [loading, setLoading] = useState(false)
  const { setSchool, setSession, goTo } = useVoteStore()

  useEffect(() => {
    api.schools.list().then(setSchools).catch(console.error)
  }, [])

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
      <CardContent className="space-y-3">
        {schools.map((s) => (
          <motion.button
            key={s.id}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setSelected(s)}
            className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
              selected?.id === s.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-primary/50"
            }`}
          >
            {s.name}
          </motion.button>
        ))}
        <Button
          className="w-full mt-2"
          disabled={!selected || loading}
          onClick={handleNext}
        >
          {loading ? "加载中…" : "下一步"}
        </Button>
      </CardContent>
    </Card>
  )
}
