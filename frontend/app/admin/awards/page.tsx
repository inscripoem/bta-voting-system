"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function AwardsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">奖项管理</h1>
      <Card>
        <CardHeader><CardTitle>功能开发中</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">奖项管理功能即将上线。</p>
        </CardContent>
      </Card>
    </div>
  )
}
