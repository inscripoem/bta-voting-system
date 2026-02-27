import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function HomePage() {
  return (
    <div className="container py-20 max-w-3xl mx-auto px-4 text-center space-y-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">大二杯</h1>
        <p className="text-xl text-muted-foreground">高校二次元年度人气动画评选</p>
      </div>
      <div className="flex gap-4 justify-center">
        <Button asChild size="lg">
          <Link href="/vote">参与投票</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/about">了解更多</Link>
        </Button>
      </div>
    </div>
  )
}
