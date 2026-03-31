import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 font-sans">
      <main className="flex w-full max-w-3xl flex-col items-center gap-8 px-6 py-16 text-center">
        <div className="flex flex-col gap-4">
          <h1 className="text-5xl font-bold tracking-tight text-white">
            XM-Games
          </h1>
          <p className="max-w-md text-lg text-slate-400">
            选择一个游戏开始玩吧
          </p>
        </div>

        <div className="grid w-full gap-4 md:grid-cols-2">
          <Link href="/bingo" className="block">
            <Card className="h-full border-slate-700 bg-slate-800/50 transition-all hover:border-slate-500 hover:bg-slate-800">
              <CardHeader>
                <CardTitle className="text-white">
                  <span className="text-red-500">B</span>
                  <span className="text-orange-500">I</span>
                  <span className="text-yellow-500">N</span>
                  <span className="text-green-500">G</span>
                  <span className="text-blue-500">O</span>
                </CardTitle>
                <CardDescription className="text-slate-400">
                  抽数字游戏
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-400">
                  支持自动抽取和泰语语音播报的 Bingo 抽数字游戏
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </main>
    </div>
  )
}
