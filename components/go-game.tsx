"use client"

import { useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useLocale } from "@/lib/locale-context"
import { RotateCcw, Home, Undo2, HelpCircle, X, Flag } from "lucide-react"

type Stone = "black" | "white" | null
type Position = { row: number; col: number }

const BOARD_SIZE = 9 // 9x9 for beginners, can be 13x13 or 19x19

function createEmptyBoard(): Stone[][] {
  return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null))
}

// Get adjacent positions
function getAdjacentPositions(row: number, col: number): Position[] {
  const adjacent: Position[] = []
  if (row > 0) adjacent.push({ row: row - 1, col })
  if (row < BOARD_SIZE - 1) adjacent.push({ row: row + 1, col })
  if (col > 0) adjacent.push({ row, col: col - 1 })
  if (col < BOARD_SIZE - 1) adjacent.push({ row, col: col + 1 })
  return adjacent
}

// Get group of connected stones
function getGroup(board: Stone[][], row: number, col: number): Position[] {
  const color = board[row][col]
  if (!color) return []

  const group: Position[] = []
  const visited = new Set<string>()
  const stack: Position[] = [{ row, col }]

  while (stack.length > 0) {
    const pos = stack.pop()!
    const key = `${pos.row},${pos.col}`
    if (visited.has(key)) continue
    visited.add(key)

    if (board[pos.row][pos.col] === color) {
      group.push(pos)
      for (const adj of getAdjacentPositions(pos.row, pos.col)) {
        if (!visited.has(`${adj.row},${adj.col}`)) {
          stack.push(adj)
        }
      }
    }
  }

  return group
}

// Count liberties of a group
function countLiberties(board: Stone[][], group: Position[]): number {
  const liberties = new Set<string>()
  for (const pos of group) {
    for (const adj of getAdjacentPositions(pos.row, pos.col)) {
      if (board[adj.row][adj.col] === null) {
        liberties.add(`${adj.row},${adj.col}`)
      }
    }
  }
  return liberties.size
}

// Remove a group from the board
function removeGroup(board: Stone[][], group: Position[]): Stone[][] {
  const newBoard = board.map(row => [...row])
  for (const pos of group) {
    newBoard[pos.row][pos.col] = null
  }
  return newBoard
}

// Check if a move would result in the same board state (Ko rule)
function isBoardSame(board1: Stone[][], board2: Stone[][]): boolean {
  for (let i = 0; i < BOARD_SIZE; i++) {
    for (let j = 0; j < BOARD_SIZE; j++) {
      if (board1[i][j] !== board2[i][j]) return false
    }
  }
  return true
}

// Calculate territory (simplified scoring)
function calculateTerritory(board: Stone[][]): { black: number; white: number } {
  const visited = new Set<string>()
  let blackTerritory = 0
  let whiteTerritory = 0

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[row][col] !== null || visited.has(`${row},${col}`)) continue

      // Flood fill to find empty region
      const region: Position[] = []
      const stack: Position[] = [{ row, col }]
      const borders = new Set<Stone>()

      while (stack.length > 0) {
        const pos = stack.pop()!
        const key = `${pos.row},${pos.col}`
        if (visited.has(key)) continue
        visited.add(key)

        if (board[pos.row][pos.col] === null) {
          region.push(pos)
          for (const adj of getAdjacentPositions(pos.row, pos.col)) {
            if (!visited.has(`${adj.row},${adj.col}`)) {
              stack.push(adj)
            }
          }
        } else {
          borders.add(board[pos.row][pos.col])
        }
      }

      // If region is surrounded by only one color, it's that color's territory
      if (borders.size === 1) {
        const color = Array.from(borders)[0]
        if (color === "black") {
          blackTerritory += region.length
        } else {
          whiteTerritory += region.length
        }
      }
    }
  }

  return { black: blackTerritory, white: whiteTerritory }
}

export function GoGame() {
  const { t, locale } = useLocale()

  const [board, setBoard] = useState<Stone[][]>(createEmptyBoard())
  const [currentTurn, setCurrentTurn] = useState<"black" | "white">("black")
  const [history, setHistory] = useState<{ board: Stone[][]; captures: { black: number; white: number } }[]>([])
  const [captures, setCaptures] = useState({ black: 0, white: 0 })
  const [previousBoard, setPreviousBoard] = useState<Stone[][] | null>(null)
  const [gameStatus, setGameStatus] = useState<"playing" | "ended">("playing")
  const [passCount, setPassCount] = useState(0)
  const [showRules, setShowRules] = useState(false)
  const [lastMove, setLastMove] = useState<Position | null>(null)
  const [blackUndoUsed, setBlackUndoUsed] = useState(false)
  const [whiteUndoUsed, setWhiteUndoUsed] = useState(false)

  const resetGame = useCallback(() => {
    setBoard(createEmptyBoard())
    setCurrentTurn("black")
    setHistory([])
    setCaptures({ black: 0, white: 0 })
    setPreviousBoard(null)
    setGameStatus("playing")
    setPassCount(0)
    setLastMove(null)
    setBlackUndoUsed(false)
    setWhiteUndoUsed(false)
  }, [])

  const handleCellClick = useCallback((row: number, col: number) => {
    if (gameStatus !== "playing") return
    if (board[row][col] !== null) return

    // Try placing the stone
    const newBoard = board.map(r => [...r])
    newBoard[row][col] = currentTurn

    // Check for captures
    let newCaptures = { ...captures }
    const opponent = currentTurn === "black" ? "white" : "black"
    
    // Check adjacent opponent groups for capture
    for (const adj of getAdjacentPositions(row, col)) {
      if (newBoard[adj.row][adj.col] === opponent) {
        const group = getGroup(newBoard, adj.row, adj.col)
        if (countLiberties(newBoard, group) === 0) {
          newBoard[row][col] = currentTurn
          const capturedBoard = removeGroup(newBoard, group)
          newCaptures[currentTurn] += group.length
          for (let i = 0; i < BOARD_SIZE; i++) {
            for (let j = 0; j < BOARD_SIZE; j++) {
              newBoard[i][j] = capturedBoard[i][j]
            }
          }
        }
      }
    }

    // Check if our own group has liberties (suicide rule)
    const ownGroup = getGroup(newBoard, row, col)
    if (countLiberties(newBoard, ownGroup) === 0) {
      return // Suicide not allowed
    }

    // Check Ko rule
    if (previousBoard && isBoardSame(newBoard, previousBoard)) {
      return // Ko violation
    }

    // Save history for undo
    setHistory(prev => [...prev, { board: board.map(r => [...r]), captures: { ...captures } }])
    setPreviousBoard(board.map(r => [...r]))
    setBoard(newBoard)
    setCaptures(newCaptures)
    setCurrentTurn(opponent)
    setPassCount(0)
    setLastMove({ row, col })
  }, [board, currentTurn, gameStatus, captures, previousBoard])

  const handlePass = useCallback(() => {
    if (gameStatus !== "playing") return

    setHistory(prev => [...prev, { board: board.map(r => [...r]), captures: { ...captures } }])
    
    const newPassCount = passCount + 1
    setPassCount(newPassCount)
    setCurrentTurn(currentTurn === "black" ? "white" : "black")
    setLastMove(null)

    // Two consecutive passes end the game
    if (newPassCount >= 2) {
      setGameStatus("ended")
    }
  }, [gameStatus, passCount, currentTurn, board, captures])

  const handleUndo = useCallback(() => {
    if (history.length === 0) return
    if (gameStatus === "ended") return

    // Check who made the last move
    const undoingPlayer = currentTurn === "black" ? "white" : "black"
    if (undoingPlayer === "black" && blackUndoUsed) return
    if (undoingPlayer === "white" && whiteUndoUsed) return

    const lastState = history[history.length - 1]
    setBoard(lastState.board)
    setCaptures(lastState.captures)
    setHistory(prev => prev.slice(0, -1))
    setCurrentTurn(undoingPlayer)
    setPassCount(0)
    setLastMove(null)

    if (undoingPlayer === "black") {
      setBlackUndoUsed(true)
    } else {
      setWhiteUndoUsed(true)
    }
  }, [history, gameStatus, currentTurn, blackUndoUsed, whiteUndoUsed])

  // Calculate final score
  const territory = gameStatus === "ended" ? calculateTerritory(board) : { black: 0, white: 0 }
  const blackTotal = captures.black + territory.black
  const whiteTotal = captures.white + territory.white + 6.5 // Komi (compensation for white)

  // Star points for 9x9 board
  const starPoints = [
    { row: 2, col: 2 }, { row: 2, col: 6 },
    { row: 4, col: 4 },
    { row: 6, col: 2 }, { row: 6, col: 6 }
  ]

  return (
    <div className="flex min-h-screen flex-col items-center bg-gradient-to-br from-amber-900 via-amber-800 to-amber-900 p-4">
      {/* Header */}
      <div className="mb-4 flex w-full max-w-lg items-center justify-between">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-amber-100 hover:bg-amber-700">
            <Home className="mr-2 h-4 w-4" />
            {t("appName")}
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-amber-100 sm:text-2xl">{t("go")}</h1>
        <LanguageSwitcher />
      </div>

      {/* Game Status */}
      <Card className="mb-4 w-full max-w-lg border-amber-600 bg-amber-800/50 p-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`h-5 w-5 rounded-full border-2 ${currentTurn === "black" ? "border-amber-300 bg-slate-900" : "border-transparent bg-slate-800"}`} />
              <span className={`text-sm ${currentTurn === "black" ? "text-amber-100" : "text-amber-100/50"}`}>
                {t("blackStone")} ({captures.black})
              </span>
            </div>
            <div className="h-4 w-px bg-amber-600" />
            <div className="flex items-center gap-2">
              <div className={`h-5 w-5 rounded-full border-2 ${currentTurn === "white" ? "border-amber-300 bg-amber-50" : "border-transparent bg-amber-100/70"}`} />
              <span className={`text-sm ${currentTurn === "white" ? "text-amber-100" : "text-amber-100/50"}`}>
                {t("whiteStone")} ({captures.white})
              </span>
            </div>
          </div>

          {gameStatus === "ended" && (
            <div className="mt-2 text-center">
              <p className="text-sm text-amber-200">
                {t("blackStone")}: {blackTotal.toFixed(1)} | {t("whiteStone")}: {whiteTotal.toFixed(1)}
              </p>
              <p className="text-lg font-bold text-amber-100">
                {blackTotal > whiteTotal ? t("blackWinsGo") : t("whiteWinsGo")}
              </p>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 text-xs">
            <span className="text-slate-300">
              {blackUndoUsed ? t("undoUsed") : `${t("undoRemaining")}: 1`}
            </span>
            <div className="h-3 w-px bg-amber-600/50" />
            <span className="text-amber-200">
              {whiteUndoUsed ? t("undoUsed") : `${t("undoRemaining")}: 1`}
            </span>
          </div>
        </div>
      </Card>

      {/* Board */}
      <div 
        className="relative rounded-lg border-4 border-amber-700 bg-[#dcb35c] p-3 shadow-xl"
        style={{
          width: `${BOARD_SIZE * 32 + 24}px`,
          height: `${BOARD_SIZE * 32 + 24}px`,
        }}
      >
        {/* Grid lines */}
        <svg
          className="absolute"
          style={{
            left: "12px",
            top: "12px",
            width: `${(BOARD_SIZE - 1) * 32}px`,
            height: `${(BOARD_SIZE - 1) * 32}px`,
          }}
          viewBox={`0 0 ${(BOARD_SIZE - 1) * 32} ${(BOARD_SIZE - 1) * 32}`}
        >
          {/* Horizontal lines */}
          {Array.from({ length: BOARD_SIZE }).map((_, i) => (
            <line
              key={`h-${i}`}
              x1={0}
              y1={i * 32}
              x2={(BOARD_SIZE - 1) * 32}
              y2={i * 32}
              stroke="#5a4a2a"
              strokeWidth="1"
            />
          ))}
          {/* Vertical lines */}
          {Array.from({ length: BOARD_SIZE }).map((_, i) => (
            <line
              key={`v-${i}`}
              x1={i * 32}
              y1={0}
              x2={i * 32}
              y2={(BOARD_SIZE - 1) * 32}
              stroke="#5a4a2a"
              strokeWidth="1"
            />
          ))}
          {/* Star points */}
          {starPoints.map((point, i) => (
            <circle
              key={`star-${i}`}
              cx={point.col * 32}
              cy={point.row * 32}
              r={4}
              fill="#5a4a2a"
            />
          ))}
        </svg>

        {/* Stones */}
        <div className="relative" style={{ width: `${(BOARD_SIZE - 1) * 32}px`, height: `${(BOARD_SIZE - 1) * 32}px` }}>
          {board.map((row, rowIndex) =>
            row.map((stone, colIndex) => (
              <button
                key={`${rowIndex}-${colIndex}`}
                onClick={() => handleCellClick(rowIndex, colIndex)}
                className="absolute flex items-center justify-center"
                style={{
                  left: `${colIndex * 32 - 16}px`,
                  top: `${rowIndex * 32 - 16}px`,
                  width: "32px",
                  height: "32px",
                }}
              >
                {/* Last move indicator */}
                {lastMove?.row === rowIndex && lastMove?.col === colIndex && (
                  <div className="absolute h-3 w-3 rounded-full bg-red-500/70" style={{ zIndex: 10 }} />
                )}
                
                {/* Stone */}
                {stone && (
                  <div
                    className={`h-7 w-7 rounded-full shadow-lg ${
                      stone === "black"
                        ? "bg-gradient-to-br from-slate-700 to-slate-900"
                        : "bg-gradient-to-br from-amber-50 to-amber-200 border border-amber-300"
                    }`}
                  />
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button
          onClick={handlePass}
          disabled={gameStatus === "ended"}
          className="bg-amber-600 text-white hover:bg-amber-500"
        >
          <Flag className="mr-1 h-4 w-4" />
          {t("pass")}
        </Button>
        <Button
          onClick={handleUndo}
          disabled={history.length === 0 || gameStatus === "ended" ||
            (currentTurn === "black" && whiteUndoUsed) ||
            (currentTurn === "white" && blackUndoUsed)
          }
          variant="outline"
          className="border-amber-600 bg-amber-800/50 text-amber-100 hover:bg-amber-700"
        >
          <Undo2 className="mr-1 h-4 w-4" />
          {t("undo")}
        </Button>
        <Button
          onClick={resetGame}
          variant="outline"
          className="border-amber-600 bg-amber-800/50 text-amber-100 hover:bg-amber-700"
        >
          <RotateCcw className="mr-1 h-4 w-4" />
          {t("restart")}
        </Button>
        <Button
          onClick={() => setShowRules(true)}
          variant="outline"
          className="border-amber-600 bg-amber-800/50 text-amber-100 hover:bg-amber-700"
        >
          <HelpCircle className="mr-1 h-4 w-4" />
          {t("howToPlay")}
        </Button>
      </div>

      {/* Instructions */}
      <p className="mt-4 max-w-md text-center text-xs text-amber-200/70">
        {t("goInstructions")}
      </p>

      {/* Rules Modal */}
      {showRules && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowRules(false)}>
          <Card 
            className="max-h-[80vh] w-full max-w-md overflow-y-auto border-amber-600 bg-amber-900/95 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-amber-100">{t("howToPlay")}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowRules(false)} className="text-amber-100 hover:bg-amber-800">
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="space-y-3 text-sm text-amber-100/90">
              <p>{t("goRule1")}</p>
              <p>{t("goRule2")}</p>
              <p>{t("goRule3")}</p>
              <p>{t("goRule4")}</p>
              <p>{t("goRule5")}</p>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
