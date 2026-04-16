"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useLocale } from "@/lib/locale-context"
import { LanguageSwitcher } from "@/components/language-switcher"
import { Home, RotateCcw, Flag, Bomb, HelpCircle, X } from "lucide-react"
import Link from "next/link"

type CellState = {
  isMine: boolean
  isRevealed: boolean
  isFlagged: boolean
  adjacentMines: number
}

type GameStatus = "playing" | "won" | "lost"
type Difficulty = "easy" | "medium" | "hard"

const DIFFICULTIES = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard: { rows: 16, cols: 30, mines: 99 },
}

function createBoard(rows: number, cols: number, mines: number, firstClickRow?: number, firstClickCol?: number): CellState[][] {
  const board: CellState[][] = Array(rows).fill(null).map(() =>
    Array(cols).fill(null).map(() => ({
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      adjacentMines: 0,
    }))
  )

  // Place mines randomly, avoiding first click area
  let placedMines = 0
  while (placedMines < mines) {
    const row = Math.floor(Math.random() * rows)
    const col = Math.floor(Math.random() * cols)
    
    // Skip if already a mine or too close to first click
    if (board[row][col].isMine) continue
    if (firstClickRow !== undefined && firstClickCol !== undefined) {
      if (Math.abs(row - firstClickRow) <= 1 && Math.abs(col - firstClickCol) <= 1) continue
    }
    
    board[row][col].isMine = true
    placedMines++
  }

  // Calculate adjacent mines
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].isMine) continue
      let count = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr
          const nc = c + dc
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].isMine) {
            count++
          }
        }
      }
      board[r][c].adjacentMines = count
    }
  }

  return board
}

export function MinesweeperGame() {
  const { t, locale } = useLocale()
  const [difficulty, setDifficulty] = useState<Difficulty>("easy")
  const [board, setBoard] = useState<CellState[][]>([])
  const [gameStatus, setGameStatus] = useState<GameStatus>("playing")
  const [flagCount, setFlagCount] = useState(0)
  const [firstClick, setFirstClick] = useState(true)
  const [showRules, setShowRules] = useState(false)
  const [timer, setTimer] = useState(0)
  const [timerActive, setTimerActive] = useState(false)

  const { rows, cols, mines } = DIFFICULTIES[difficulty]

  const initGame = useCallback(() => {
    setBoard(Array(rows).fill(null).map(() =>
      Array(cols).fill(null).map(() => ({
        isMine: false,
        isRevealed: false,
        isFlagged: false,
        adjacentMines: 0,
      }))
    ))
    setGameStatus("playing")
    setFlagCount(0)
    setFirstClick(true)
    setTimer(0)
    setTimerActive(false)
  }, [rows, cols])

  useEffect(() => {
    initGame()
  }, [initGame])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (timerActive && gameStatus === "playing") {
      interval = setInterval(() => {
        setTimer(t => t + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [timerActive, gameStatus])

  const revealCell = useCallback((row: number, col: number, currentBoard: CellState[][]) => {
    const newBoard = currentBoard.map(r => r.map(c => ({ ...c })))
    
    const reveal = (r: number, c: number) => {
      if (r < 0 || r >= rows || c < 0 || c >= cols) return
      if (newBoard[r][c].isRevealed || newBoard[r][c].isFlagged) return
      
      newBoard[r][c].isRevealed = true
      
      if (newBoard[r][c].adjacentMines === 0 && !newBoard[r][c].isMine) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            reveal(r + dr, c + dc)
          }
        }
      }
    }
    
    reveal(row, col)
    return newBoard
  }, [rows, cols])

  const handleCellClick = useCallback((row: number, col: number) => {
    if (gameStatus !== "playing") return
    if (board[row]?.[col]?.isFlagged) return

    let currentBoard = board

    if (firstClick) {
      currentBoard = createBoard(rows, cols, mines, row, col)
      setFirstClick(false)
      setTimerActive(true)
    }

    if (currentBoard[row][col].isMine) {
      // Game over - reveal all mines
      const newBoard = currentBoard.map(r => r.map(c => ({
        ...c,
        isRevealed: c.isMine ? true : c.isRevealed,
      })))
      setBoard(newBoard)
      setGameStatus("lost")
      setTimerActive(false)
      return
    }

    const newBoard = revealCell(row, col, currentBoard)
    if (!newBoard) return
    setBoard(newBoard)

    // Check win condition
    const unrevealed = newBoard.flat().filter(c => !c.isRevealed && !c.isMine).length
    if (unrevealed === 0) {
      setGameStatus("won")
      setTimerActive(false)
    }
  }, [board, gameStatus, firstClick, rows, cols, mines, revealCell])

  const handleRightClick = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault()
    if (gameStatus !== "playing") return
    if (board[row][col].isRevealed) return

    const newBoard = board.map(r => r.map(c => ({ ...c })))
    newBoard[row][col].isFlagged = !newBoard[row][col].isFlagged
    setBoard(newBoard)
    setFlagCount(prev => newBoard[row][col].isFlagged ? prev + 1 : prev - 1)
  }, [board, gameStatus])

  const getNumberColor = (num: number) => {
    const colors = [
      "", "text-blue-600", "text-green-600", "text-red-600",
      "text-purple-800", "text-red-800", "text-cyan-600",
      "text-black", "text-gray-600"
    ]
    return colors[num] || ""
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
            <Home className="mr-2 h-4 w-4" />
            {t("appName")}
          </Button>
        </Link>
        <LanguageSwitcher />
      </div>

      <main className="flex flex-1 flex-col items-center gap-4 py-4">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">{t("minesweeper")}</h1>

        {/* Difficulty selector */}
        <div className="flex gap-2">
          {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
            <Button
              key={d}
              variant={difficulty === d ? "default" : "outline"}
              size="sm"
              onClick={() => { setDifficulty(d) }}
              className={difficulty === d 
                ? "bg-slate-600" 
                : "border-slate-600 bg-transparent text-slate-300 hover:bg-slate-700"
              }
            >
              {t(d === "easy" ? "easy" : d === "medium" ? "medium" : "hard")}
            </Button>
          ))}
        </div>

        {/* Game stats */}
        <Card className="flex items-center gap-6 border-slate-700 bg-slate-800/50 px-4 py-2">
          <div className="flex items-center gap-2">
            <Bomb className="h-4 w-4 text-red-400" />
            <span className="font-mono text-lg text-white">{mines - flagCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg text-white">{formatTime(timer)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-yellow-400" />
            <span className="font-mono text-lg text-white">{flagCount}</span>
          </div>
        </Card>

        {/* Game status */}
        {gameStatus !== "playing" && (
          <div className={`rounded-lg px-4 py-2 text-lg font-bold ${
            gameStatus === "won" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
          }`}>
            {gameStatus === "won" ? t("youWin") : t("gameOver")}
          </div>
        )}

        {/* Game board */}
        <div 
          className="overflow-auto rounded-lg border-2 border-slate-600 bg-slate-300 p-1"
          style={{ maxWidth: "100%", maxHeight: "60vh" }}
        >
          <div 
            className="grid gap-px"
            style={{ 
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            }}
          >
            {board.map((row, rowIndex) =>
              row.map((cell, colIndex) => (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  onClick={() => handleCellClick(rowIndex, colIndex)}
                  onContextMenu={(e) => handleRightClick(e, rowIndex, colIndex)}
                  disabled={gameStatus !== "playing"}
                  className={`
                    flex items-center justify-center font-bold transition-all
                    ${difficulty === "hard" ? "h-5 w-5 text-xs sm:h-6 sm:w-6" : "h-7 w-7 text-sm sm:h-8 sm:w-8"}
                    ${cell.isRevealed
                      ? cell.isMine
                        ? "bg-red-500"
                        : "bg-slate-200"
                      : "bg-slate-400 hover:bg-slate-350 active:bg-slate-300 shadow-[inset_2px_2px_0_#94a3b8,inset_-2px_-2px_0_#475569]"
                    }
                  `}
                >
                  {cell.isRevealed ? (
                    cell.isMine ? (
                      <Bomb className="h-4 w-4 text-black" />
                    ) : cell.adjacentMines > 0 ? (
                      <span className={getNumberColor(cell.adjacentMines)}>{cell.adjacentMines}</span>
                    ) : null
                  ) : cell.isFlagged ? (
                    <Flag className="h-4 w-4 text-red-600" />
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-2">
          <Button
            onClick={initGame}
            variant="outline"
            className="border-slate-600 bg-slate-800/50 text-slate-100 hover:bg-slate-700"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {t("restart")}
          </Button>
          <Button
            onClick={() => setShowRules(true)}
            variant="outline"
            className="border-slate-600 bg-slate-800/50 text-slate-100 hover:bg-slate-700"
          >
            <HelpCircle className="mr-2 h-4 w-4" />
            {t("howToPlay")}
          </Button>
        </div>

        <p className="max-w-md text-center text-xs text-slate-400">
          {t("minesweeperInstructions")}
        </p>

        {/* Rules Modal */}
        {showRules && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowRules(false)}>
            <Card 
              className="max-h-[80vh] w-full max-w-md overflow-y-auto border-slate-600 bg-slate-800 p-4 sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">{t("howToPlay")}</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowRules(false)} className="text-slate-400 hover:text-white">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>{t("minesweeperRule1")}</li>
                <li>{t("minesweeperRule2")}</li>
                <li>{t("minesweeperRule3")}</li>
                <li>{t("minesweeperRule4")}</li>
              </ul>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
