import Link from "next/link"

export default function AboutPage() {
  return (
    <div className="container py-16 max-w-3xl mx-auto px-4 space-y-12">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">关于大二杯</h1>
        <p className="text-xl text-muted-foreground">高校二次元年度人气动画评选</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">什么是大二杯？</h2>
        <p className="text-muted-foreground leading-relaxed">
          大二杯是由高校二次元社团联合举办的一年一度的人气动画评选活动。
          每年我们会回顾过去一年的动画作品，由来自各高校的同学投票选出
          自己心中的年度最佳。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">如何参与？</h2>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground leading-relaxed">
          <li>选择你所在的学校</li>
          <li>输入你的昵称</li>
          <li>通过学校邮箱验证身份</li>
          <li>为喜欢的作品投出你的一票</li>
        </ol>
        <p className="text-muted-foreground leading-relaxed">
          你也可以使用访客身份快速体验投票流程，投票截止后结果将统一公布。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">评选规则</h2>
        <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed">
          <li>每位注册用户在每个奖项中只能投票一次</li>
          <li>投票需通过学校邮箱验证，确保投票来自在校学生</li>
          <li>投票结束后，各奖项得票最高的作品当选</li>
        </ul>
      </section>

      <div className="text-center pt-4">
        <Link href="/vote" className="text-primary underline-offset-4 hover:underline">
          去参与投票 →
        </Link>
      </div>
    </div>
  )
}
