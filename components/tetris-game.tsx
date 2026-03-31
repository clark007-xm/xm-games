"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLocale } from "@/lib/locale-context"
import { LanguageSwitcher } from "@/components/language-switcher"
import Link from "next/link"
import { ArrowLeft, Play, Pause, RotateCcw, ChevronDown, ChevronLeft, ChevronRight, ChevronsDown } from "lucide-react"

const BOARD_WIDTH = 10
const BOARD_HEIGHT = 20
const EMPTY_CELL = 0

// Tetromino shapes
const TETROMINOES = {
  I: {
    shape: [[1, 1, 1, 1]],
    color: "bg-cyan-500",
  },
  O: {
    shape: [
      [1, 1],
      [1, 1],
    ],
    color: "bg-yellow-500",
  },
  T: {
    shape: [
      [0, 1, 0],
      [1, 1, 1],
    ],
    color: "bg-purple-500",
  },
  S: {
    shape: [
      [0, 1, 1],
      [1, 1, 0],
    ],
    color: "bg-green-500",
  },
  Z: {
    shape: [
      [1, 1, 0],
      [0, 1, 1],
    ],
    color: "bg-red-500",
  },
  J: {
    shape: [
      [1, 0, 0],
      [1, 1, 1],
    ],
    color: "bg-blue-500",
  },
  L: {
    shape: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    color: "bg-orange-500",
  },
}

type TetrominoType = keyof typeof TETROMINOES

interface Piece {
  type: TetrominoType
  shape: number[][]
  x: number
  y: number
}

function createEmptyBoard(): number[][] {
  return Array(BOARD_HEIGHT)
    .fill(null)
    .map(() => Array(BOARD_WIDTH).fill(EMPTY_CELL))
}

function getRandomTetromino(): TetrominoType {
  const types = Object.keys(TETROMINOES) as TetrominoType[]
  return types[Math.floor(Math.random() * types.length)]
}

function rotateMatrix(matrix: number[][]): number[][] {
  const rows = matrix.length
  const cols = matrix[0].length
  const rotated: number[][] = []
  for (let col = 0; col < cols; col++) {
    rotated.push([])
    for (let row = rows - 1; row >= 0; row--) {
      rotated[col].push(matrix[row][col])
    }
  }
  return rotated
}

export function TetrisGame() {
  const { t } = useLocale()
  const [board, setBoard] = useState<number[][]>(createEmptyBoard())
  const [currentPiece, setCurrentPiece] = useState<Piece | null>(null)
  const [nextPiece, setNextPiece] = useState<TetrominoType>(getRandomTetromino())
  const [score, setScore] = useState(0)
  const [lines, setLines] = useState(0)
  const [level, setLevel] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isGameOver, setIsGameOver] = useState(false)
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null)
  const boardRef = useRef<number[][]>(board)

  // Update boardRef when board changes
  useEffect(() => {
    boardRef.current = board
  }, [board])

  const spawnPiece = useCallback(() => {
    const type = nextPiece
    const shape = TETROMINOES[type].shape
    const x = Math.floor((BOARD_WIDTH - shape[0].length) / 2)
    const y = 0

    const newPiece: Piece = { type, shape, x, y }

    // Check if can spawn (game over check)
    if (!isValidPosition(newPiece, boardRef.current)) {
      setIsGameOver(true)
      setIsPlaying(false)
      return null
    }

    setNextPiece(getRandomTetromino())
    return newPiece
  }, [nextPiece])

  const isValidPosition = (piece: Piece, board: number[][]): boolean => {
    for (let row = 0; row < piece.shape.length; row++) {
      for (let col = 0; col < piece.shape[row].length; col++) {
        if (piece.shape[row][col]) {
          const newX = piece.x + col
          const newY = piece.y + row
          if (newX < 0 || newX >= BOARD_WIDTH || newY >= BOARD_HEIGHT) {
            return false
          }
          if (newY >= 0 && board[newY][newX] !== EMPTY_CELL) {
            return false
          }
        }
      }
    }
    return true
  }

  const lockPiece = useCallback((piece: Piece) => {
    const newBoard = boardRef.current.map((row) => [...row])
    const typeIndex = Object.keys(TETROMINOES).indexOf(piece.type) + 1

    for (let row = 0; row < piece.shape.length; row++) {
      for (let col = 0; col < piece.shape[row].length; col++) {
        if (piece.shape[row][col]) {
          const y = piece.y + row
          const x = piece.x + col
          if (y >= 0) {
            newBoard[y][x] = typeIndex
          }
        }
      }
    }

    // Check for completed lines
    let linesCleared = 0
    const filteredBoard = newBoard.filter((row) => {
      const isFull = row.every((cell) => cell !== EMPTY_CELL)
      if (isFull) linesCleared++
      return !isFull
    })

    // Add empty lines at top
    while (filteredBoard.length < BOARD_HEIGHT) {
      filteredBoard.unshift(Array(BOARD_WIDTH).fill(EMPTY_CELL))
    }

    if (linesCleared > 0) {
      const points = [0, 100, 300, 500, 800][linesCleared] * level
      setScore((prev) => prev + points)
      setLines((prev) => {
        const newLines = prev + linesCleared
        setLevel(Math.floor(newLines / 10) + 1)
        return newLines
      })
    }

    setBoard(filteredBoard)
    boardRef.current = filteredBoard
  }, [level])

  const movePiece = useCallback(
    (dx: number, dy: number): boolean => {
      if (!currentPiece) return false
      const newPiece = { ...currentPiece, x: currentPiece.x + dx, y: currentPiece.y + dy }
      if (isValidPosition(newPiece, boardRef.current)) {
        setCurrentPiece(newPiece)
        return true
      }
      return false
    },
    [currentPiece]
  )

  const rotatePiece = useCallback(() => {
    if (!currentPiece) return
    const rotatedShape = rotateMatrix(currentPiece.shape)
    const newPiece = { ...currentPiece, shape: rotatedShape }

    // Try original position
    if (isValidPosition(newPiece, boardRef.current)) {
      setCurrentPiece(newPiece)
      return
    }

    // Wall kick attempts
    const kicks = [-1, 1, -2, 2]
    for (const kick of kicks) {
      const kickedPiece = { ...newPiece, x: newPiece.x + kick }
      if (isValidPosition(kickedPiece, boardRef.current)) {
        setCurrentPiece(kickedPiece)
        return
      }
    }
  }, [currentPiece])

  const hardDrop = useCallback(() => {
    if (!currentPiece) return
    let newY = currentPiece.y
    while (isValidPosition({ ...currentPiece, y: newY + 1 }, boardRef.current)) {
      newY++
    }
    const droppedPiece = { ...currentPiece, y: newY }
    lockPiece(droppedPiece)
    setCurrentPiece(null)
  }, [currentPiece, lockPiece])

  // Game loop
  useEffect(() => {
    if (!isPlaying || isGameOver) {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
      }
      return
    }

    const speed = Math.max(100, 1000 - (level - 1) * 100)

    gameLoopRef.current = setInterval(() => {
      setCurrentPiece((prev) => {
        if (!prev) {
          const newPiece = spawnPiece()
          return newPiece
        }

        const newPiece = { ...prev, y: prev.y + 1 }
        if (isValidPosition(newPiece, boardRef.current)) {
          return newPiece
        } else {
          lockPiece(prev)
          return null
        }
      })
    }, speed)

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
      }
    }
  }, [isPlaying, isGameOver, level, spawnPiece, lockPiece])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying || isGameOver) return

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault()
          movePiece(-1, 0)
          break
        case "ArrowRight":
          e.preventDefault()
          movePiece(1, 0)
          break
        case "ArrowDown":
          e.preventDefault()
          movePiece(0, 1)
          break
        case "ArrowUp":
          e.preventDefault()
          rotatePiece()
          break
        case " ":
          e.preventDefault()
          hardDrop()
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isPlaying, isGameOver, movePiece, rotatePiece, hardDrop])

  const startGame = () => {
    setBoard(createEmptyBoard())
    boardRef.current = createEmptyBoard()
    setCurrentPiece(null)
    setNextPiece(getRandomTetromino())
    setScore(0)
    setLines(0)
    setLevel(1)
    setIsGameOver(false)
    setIsPlaying(true)
  }

  const togglePause = () => {
    setIsPlaying((prev) => !prev)
  }

  // Render board with current piece
  const renderBoard = () => {
    const displayBoard = board.map((row) => [...row])

    if (currentPiece) {
      for (let row = 0; row < currentPiece.shape.length; row++) {
        for (let col = 0; col < currentPiece.shape[row].length; col++) {
          if (currentPiece.shape[row][col]) {
            const y = currentPiece.y + row
            const x = currentPiece.x + col
            if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
              displayBoard[y][x] = Object.keys(TETROMINOES).indexOf(currentPiece.type) + 1
            }
          }
        }
      }
    }

    return displayBoard
  }

  const getCellColor = (value: number): string => {
    if (value === 0) return "bg-slate-800"
    const types = Object.values(TETROMINOES)
    return types[value - 1]?.color || "bg-slate-800"
  }

  const displayBoard = renderBoard()

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("appName")}
          </Button>
        </Link>
        <LanguageSwitcher />
      </div>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 py-4">
        <h1 className="text-3xl font-bold text-white">{t("tetris")}</h1>

        <div className="flex gap-4">
          {/* Game Board */}
          <Card className="border-slate-700 bg-slate-800/50">
            <CardContent className="p-2">
              <div
                className="grid gap-[1px] rounded bg-slate-900 p-1"
                style={{
                  gridTemplateColumns: `repeat(${BOARD_WIDTH}, 1fr)`,
                }}
              >
                {displayBoard.map((row, y) =>
                  row.map((cell, x) => (
                    <div
                      key={`${y}-${x}`}
                      className={`h-5 w-5 rounded-sm ${getCellColor(cell)} sm:h-6 sm:w-6`}
                    />
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Side Panel */}
          <div className="flex flex-col gap-4">
            {/* Next Piece */}
            <Card className="border-slate-700 bg-slate-800/50">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm text-slate-400">{t("nextPiece")}</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-1">
                <div className="grid h-16 w-16 place-items-center rounded bg-slate-900 p-2">
                  <div className="grid gap-[1px]">
                    {TETROMINOES[nextPiece].shape.map((row, y) => (
                      <div key={y} className="flex gap-[1px]">
                        {row.map((cell, x) => (
                          <div
                            key={x}
                            className={`h-3 w-3 rounded-sm ${
                              cell ? TETROMINOES[nextPiece].color : "bg-transparent"
                            }`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stats */}
            <Card className="border-slate-700 bg-slate-800/50">
              <CardContent className="space-y-2 p-3">
                <div className="text-center">
                  <div className="text-xs text-slate-400">{t("score")}</div>
                  <div className="text-xl font-bold text-white">{score}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400">{t("lines")}</div>
                  <div className="text-lg font-semibold text-cyan-400">{lines}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400">{t("level")}</div>
                  <div className="text-lg font-semibold text-green-400">{level}</div>
                </div>
              </CardContent>
            </Card>

            {/* Controls */}
            <div className="flex flex-col gap-2">
              {!isPlaying && !isGameOver && (
                <Button onClick={startGame} className="gap-2 bg-green-600 hover:bg-green-700">
                  <Play className="h-4 w-4" />
                  {t("start")}
                </Button>
              )}
              {isPlaying && (
                <Button onClick={togglePause} variant="secondary" className="gap-2">
                  <Pause className="h-4 w-4" />
                  {t("pause")}
                </Button>
              )}
              {!isPlaying && currentPiece && !isGameOver && (
                <Button onClick={togglePause} className="gap-2 bg-green-600 hover:bg-green-700">
                  <Play className="h-4 w-4" />
                  {t("resume")}
                </Button>
              )}
              {(isGameOver || score > 0) && (
                <Button onClick={startGame} variant="outline" className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  {t("restart")}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Game Over */}
        {isGameOver && (
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500">{t("gameOver")}</div>
            <div className="text-slate-400">
              {t("finalScore")}: {score}
            </div>
          </div>
        )}

        {/* Mobile Controls */}
        <div className="flex flex-col items-center gap-2 md:hidden">
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12"
            onTouchStart={(e) => {
              e.preventDefault()
              rotatePiece()
            }}
          >
            <RotateCcw className="h-6 w-6" />
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12"
              onTouchStart={(e) => {
                e.preventDefault()
                movePiece(-1, 0)
              }}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12"
              onTouchStart={(e) => {
                e.preventDefault()
                hardDrop()
              }}
            >
              <ChevronsDown className="h-6 w-6" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12"
              onTouchStart={(e) => {
                e.preventDefault()
                movePiece(1, 0)
              }}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12"
            onTouchStart={(e) => {
              e.preventDefault()
              movePiece(0, 1)
            }}
          >
            <ChevronDown className="h-6 w-6" />
          </Button>
        </div>

        {/* Instructions */}
        <div className="text-center text-sm text-slate-500">
          <span className="hidden md:inline">{t("tetrisControls")}</span>
          <span className="md:hidden">{t("tetrisControlsMobile")}</span>
        </div>
      </main>
    </div>
  )
}
