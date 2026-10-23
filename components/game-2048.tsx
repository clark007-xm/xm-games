"use client"

import { useState, useCallback, useEffect, useRef, type TouchEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useLocale } from "@/lib/locale-context"
import { GameHeader } from "@/components/game-header"
import { InlineNotice } from "@/components/inline-notice"
import { GameRulesDialog } from "@/components/game-rules-dialog"
import { shouldIgnoreGameKey } from "@/lib/game-input"
import { useHighScore } from "@/lib/use-high-score"
import { RotateCcw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"

type Board = (number | null)[][]

function createEmptyBoard(): Board {
  return Array(4).fill(null).map(() => Array(4).fill(null))
}

function addRandomTile(board: Board): Board {
  const newBoard = board.map(row => [...row])
  const emptyCells: [number, number][] = []
  
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (newBoard[r][c] === null) {
        emptyCells.push([r, c])
      }
    }
  }
  
  if (emptyCells.length === 0) return newBoard
  
  const [row, col] = emptyCells[Math.floor(Math.random() * emptyCells.length)]
  newBoard[row][col] = Math.random() < 0.9 ? 2 : 4
  
  return newBoard
}

function createRandomBoard(): Board {
  let board = createEmptyBoard()
  board = addRandomTile(board)
  board = addRandomTile(board)
  return board
}

function createInitialBoard(): Board {
  const board = createEmptyBoard()
  board[1][1] = 2
  board[2][2] = 2
  return board
}

function slideRow(row: (number | null)[]): { newRow: (number | null)[]; score: number } {
  // Remove nulls
  const tiles = row.filter(x => x !== null) as number[]
  const newRow: (number | null)[] = []
  let score = 0
  
  let i = 0
  while (i < tiles.length) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const merged = tiles[i] * 2
      newRow.push(merged)
      score += merged
      i += 2
    } else {
      newRow.push(tiles[i])
      i++
    }
  }
  
  while (newRow.length < 4) {
    newRow.push(null)
  }
  
  return { newRow, score }
}

function moveLeft(board: Board): { newBoard: Board; score: number; moved: boolean } {
  const newBoard: Board = []
  let totalScore = 0
  let moved = false
  
  for (let r = 0; r < 4; r++) {
    const { newRow, score } = slideRow(board[r])
    newBoard.push(newRow)
    totalScore += score
    if (JSON.stringify(newRow) !== JSON.stringify(board[r])) {
      moved = true
    }
  }
  
  return { newBoard, score: totalScore, moved }
}

function rotateBoard(board: Board): Board {
  const newBoard: Board = createEmptyBoard()
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      newBoard[c][3 - r] = board[r][c]
    }
  }
  return newBoard
}

function moveInDirection(board: Board, direction: "left" | "right" | "up" | "down"): { newBoard: Board; score: number; moved: boolean } {
  let rotated = board
  const rotations = { left: 0, up: 3, right: 2, down: 1 }
  
  for (let i = 0; i < rotations[direction]; i++) {
    rotated = rotateBoard(rotated)
  }
  
  const { newBoard, score, moved } = moveLeft(rotated)
  
  let result = newBoard
  for (let i = 0; i < (4 - rotations[direction]) % 4; i++) {
    result = rotateBoard(result)
  }
  
  return { newBoard: result, score, moved }
}

function canMove(board: Board): boolean {
  // Check for empty cells
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (board[r][c] === null) return true
    }
  }
  
  // Check for adjacent equal cells
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const val = board[r][c]
      if (c < 3 && board[r][c + 1] === val) return true
      if (r < 3 && board[r + 1][c] === val) return true
    }
  }
  
  return false
}

function hasWon(board: Board): boolean {
  return board.some(row => row.some(cell => cell === 2048))
}

const TILE_COLORS: Record<number, string> = {
  2: "bg-amber-100 text-amber-900",
  4: "bg-amber-200 text-amber-900",
  8: "bg-orange-300 text-slate-900",
  16: "bg-orange-400 text-slate-900",
  32: "bg-orange-500 text-slate-900",
  64: "bg-orange-600 text-white",
  128: "bg-yellow-400 text-slate-900",
  256: "bg-yellow-500 text-slate-900",
  512: "bg-yellow-600 text-slate-900",
  1024: "bg-yellow-700 text-white",
  2048: "bg-yellow-500 text-slate-900",
  4096: "bg-red-500 text-slate-900",
  8192: "bg-red-600 text-white",
}

export function Game2048() {
  const { t, locale } = useLocale()
  const directionLabels = locale === "zh"
    ? { up: "向上移动", down: "向下移动", left: "向左移动", right: "向右移动", empty: "空白" }
    : locale === "th"
      ? { up: "เลื่อนขึ้น", down: "เลื่อนลง", left: "เลื่อนไปซ้าย", right: "เลื่อนไปขวา", empty: "ว่าง" }
      : { up: "Move up", down: "Move down", left: "Move left", right: "Move right", empty: "empty" }
  const [board, setBoard] = useState<Board>(createInitialBoard)
  const [score, setScore] = useState(0)
  const { highScore: bestScore, storageUnavailable, recordScore } = useHighScore("2048-best")
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  // Native keyboard and touch events can arrive before React commits a render.
  const liveGame = useRef({ board, score, gameOver, won })
  const swipeStart = useRef<{ id: number; x: number; y: number } | null>(null)

  const handleMove = useCallback((direction: "left" | "right" | "up" | "down") => {
    const { board, score, gameOver, won } = liveGame.current
    if (gameOver) return

    const { newBoard, score: addedScore, moved } = moveInDirection(board, direction)
    
    if (!moved) return
    
    const boardWithNewTile = addRandomTile(newBoard)
    const newScore = score + addedScore
    const nextWon = won || hasWon(boardWithNewTile)
    const nextGameOver = !canMove(boardWithNewTile)
    liveGame.current = {
      board: boardWithNewTile, score: newScore,
      won: nextWon, gameOver: nextGameOver,
    }
    setBoard(boardWithNewTile)
    
    setScore(newScore)
    
    if (addedScore > 0) recordScore(newScore)
    
    setWon(nextWon)
    setGameOver(nextGameOver)
  }, [recordScore])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreGameKey(e)) return
      const directionMap: Record<string, "left" | "right" | "up" | "down"> = {
        ArrowUp: "up", w: "up", W: "up",
        ArrowDown: "down", s: "down", S: "down",
        ArrowLeft: "left", a: "left", A: "left",
        ArrowRight: "right", d: "right", D: "right",
      }
      const direction = directionMap[e.key]
      if (direction) {
        e.preventDefault()
        handleMove(direction)
      }
    }
    
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleMove])

  const resetGame = () => {
    swipeStart.current = null
    const nextBoard = createRandomBoard()
    liveGame.current = { ...liveGame.current, board: nextBoard, score: 0, gameOver: false, won: false }
    setBoard(nextBoard)
    setScore(0)
    setGameOver(false)
    setWon(false)
  }

  const startSwipe = (event: TouchEvent<HTMLDivElement>) => {
    if (gameOver || event.touches.length !== 1) {
      swipeStart.current = null
      return
    }
    const touch = event.touches[0]
    swipeStart.current = { id: touch.identifier, x: touch.clientX, y: touch.clientY }
  }

  const finishSwipe = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current
    swipeStart.current = null
    const touch = event.changedTouches[0]
    if (!start || !touch || start.id !== touch.identifier) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    handleMove(Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? "right" : "left")
      : (dy > 0 ? "down" : "up"))
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-amber-900 via-amber-800 to-orange-900 p-4">
      <GameHeader
        homeLabel={t("appName")}
        homeButtonClassName="text-amber-200 hover:text-white"
      />

      <main className="flex flex-1 flex-col items-center gap-4 py-4">
        <h1 className="text-4xl font-bold text-white">2048</h1>

        {/* Score cards */}
        <div className="flex gap-4" role="status" aria-live="polite">
          <Card className="border-amber-600 bg-amber-700/50 px-4 py-2 text-center">
            <div className="text-xs text-amber-200">{t("score")}</div>
            <div className="text-2xl font-bold text-white">{score}</div>
          </Card>
          <Card className="border-amber-600 bg-amber-700/50 px-4 py-2 text-center">
            <div className="text-xs text-amber-200">{t("highScore")}</div>
            <div className="text-2xl font-bold text-white">{bestScore}</div>
          </Card>
        </div>

        {storageUnavailable && <InlineNotice className="max-w-md">{t("highScoreStorageError")}</InlineNotice>}
        {/* Game status */}
        {(gameOver || won) && (
          <div role="status" aria-live="assertive" className={`rounded-lg px-4 py-2 text-lg font-bold ${
            gameOver ? "bg-red-950 text-red-100" : "bg-amber-950 text-amber-100"
          }`}>
            {gameOver ? t("gameOver") : t("youWin")}
          </div>
        )}

        {/* Game board */}
        <div className="rounded-lg bg-amber-700 p-3">
          <div
            className="grid touch-none select-none grid-cols-4 gap-2"
            role="group"
            aria-label="2048"
            onTouchStart={startSwipe}
            onTouchEnd={finishSwipe}
            onTouchCancel={() => { swipeStart.current = null }}
          >
            {board.map((row, rowIndex) =>
              row.map((cell, colIndex) => (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  role="img"
                  aria-label={`${rowIndex + 1}, ${colIndex + 1}, ${cell || directionLabels.empty}`}
                  className={`
                    flex h-16 w-16 items-center justify-center rounded-md font-bold transition-all
                    sm:h-20 sm:w-20
                    ${cell ? TILE_COLORS[cell] || "bg-amber-800 text-white" : "bg-amber-600/50"}
                    ${cell && cell >= 100 ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl"}
                    ${cell && cell >= 1000 ? "text-lg sm:text-xl" : ""}
                  `}
                >
                  {cell}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Mobile controls */}
        <div className="grid grid-cols-3 gap-2 sm:hidden [@media(pointer:coarse)]:grid [&>button]:h-12 [&>button]:w-12 [&>button]:p-0">
          <div />
          <Button
            onClick={() => handleMove("up")}
            aria-label={directionLabels.up}
            disabled={gameOver}
            variant="outline"
            size="lg"
            className="border-amber-600 bg-amber-700/50 text-white"
          >
            <ChevronUp className="h-6 w-6" aria-hidden="true" />
          </Button>
          <div />
          <Button
            onClick={() => handleMove("left")}
            aria-label={directionLabels.left}
            disabled={gameOver}
            variant="outline"
            size="lg"
            className="border-amber-600 bg-amber-700/50 text-white"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </Button>
          <Button
            onClick={() => handleMove("down")}
            aria-label={directionLabels.down}
            disabled={gameOver}
            variant="outline"
            size="lg"
            className="border-amber-600 bg-amber-700/50 text-white"
          >
            <ChevronDown className="h-6 w-6" aria-hidden="true" />
          </Button>
          <Button
            onClick={() => handleMove("right")}
            aria-label={directionLabels.right}
            disabled={gameOver}
            variant="outline"
            size="lg"
            className="border-amber-600 bg-amber-700/50 text-white"
          >
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </Button>
        </div>

        {/* Controls */}
        <div className="flex gap-2">
          <Button
            onClick={resetGame}
            variant="outline"
            className="border-amber-600 bg-amber-700/50 text-amber-100 hover:bg-amber-600"
          >
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("restart")}
          </Button>
          <GameRulesDialog
            triggerLabel={t("howToPlay")}
            closeLabel={t("close")}
            triggerClassName="border-amber-600 bg-amber-700/50 text-amber-100 hover:bg-amber-600"
            contentClassName="border-amber-600 bg-amber-800 p-4 text-white sm:p-6"
            titleClassName="text-lg font-bold text-white"
            closeButtonClassName="text-amber-200 hover:text-white"
          >
            <ul className="space-y-2 text-sm text-amber-100">
              <li>{t("game2048Rule1")}</li>
              <li>{t("game2048Rule2")}</li>
              <li>{t("game2048Rule3")}</li>
            </ul>
          </GameRulesDialog>
        </div>

        <p className="max-w-md text-center text-xs text-amber-200/70">
          {t("game2048Instructions")}
        </p>

      </main>
    </div>
  )
}
