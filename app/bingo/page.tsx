import { BingoGame } from "@/components/bingo-game"

export const metadata = {
  title: "Bingo 抽数字 - XM-Games",
  description: "Bingo 抽数字游戏，支持自动抽取和泰语语音播报",
}

export default function BingoPage() {
  return <BingoGame />
}
