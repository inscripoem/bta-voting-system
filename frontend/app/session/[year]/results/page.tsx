"use client"

import { useParams } from "next/navigation"

export default function ResultsPage() {
  const params = useParams()
  const year = params.year

  return (
    <div className="container py-20 flex flex-col items-center justify-center min-h-[60vh]">
      <h1 className="text-4xl font-bold mb-4">{year} 年度动画评选结果</h1>
      <p className="text-xl text-muted-foreground">结果尚未公布</p>
    </div>
  )
}
