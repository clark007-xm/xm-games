"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useLocale } from "@/lib/locale-context"
import { LanguageSwitcher } from "@/components/language-switcher"
import Link from "next/link"
import { ArrowLeft, Play, Pause, RotateCcw, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react"

const BOARD_SIZE = 20
const INITIAL_SNAKE = [{ x: 10, y: 10 }]
const INITIAL_DIRECTION = { x: 1, y: 0 }
const INITIAL_SPEED = 150

interface Position {
  x: number
  y: number
}

function getRandomFood(snake: Position[]): Position {
  let food: Position
  do {
    food = {
      x: Math.floor(Math.random() * BOARD_SIZE),
      y: Math.floor(Math.random() * BOARD_SIZE),
    }
  } while (snake.some((segment) => segment.x === food.x && segment.y === food.y))
  return food
}

export function SnakeGame() {
  const { t } = useLocale()
  const [snake, setSnake] = useState<Position[]>(INITIAL_SNAKE)
  const [food, setFood] = useState<Position>({ x: 15, y: 10 })
  const [direction, setDirection] = useState<Position>(INITIAL_DIRECTION)
  const [nextDirection, setNextDirection] = useState<Position>(INITIAL_DIRECTION)
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isGameOver, setIsGameOver] = useState(false)
  const [speed, setSpeed] = useState(INITIAL_SPEED)
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null)
  const directionRef = useRef(direction)
  const nextDirectionRef = useRef(nextDirection)

  // Load high score from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("snakeHighScore")
    if (saved) setHighScore(parseInt(saved, 10))
  }, [])

  // Update refs when state changes
  useEffect(() => {
    directionRef.current = direction
  }, [direction])

  useEffect(() => {
    nextDirectionRef.current = nextDirection
  }, [nextDirection])

  const moveSnake = useCallback(() => {
    setDirection(nextDirectionRef.current)
    
    setSnake((prevSnake) => {
      const head = prevSnake[0]
      const newHead = {
        x: (head.x + nextDirectionRef.current.x + BOARD_SIZE) % BOARD_SIZE,
        y: (head.y + nextDirectionRef.current.y + BOARD_SIZE) % BOARD_SIZE,
      }

      // Check self collision
      if (prevSnake.some((segment) => segment.x === newHead.x && segment.y === newHead.y)) {
        setIsGameOver(true)
        setIsPlaying(false)
        return prevSnake
      }

      const newSnake = [newHead, ...prevSnake]

      // Check food collision
      setFood((currentFood) => {
        if (newHead.x === currentFood.x && newHead.y === currentFood.y) {
          setScore((prev) => {
            const newScore = prev + 10
            setHighScore((hs) => {
              const newHs = Math.max(hs, newScore)
              localStorage.setItem("snakeHighScore", newHs.toString())
              return newHs
            })
            // Increase speed every 50 points
            if (newScore % 50 === 0) {
              setSpeed((s) => Math.max(50, s - 10))
            }
            return newScore
          })
          return getRandomFood(newSnake)
        }
        // Remove tail if no food eaten
        newSnake.pop()
        return currentFood
      })

      return newSnake
    })
  }, [])

  // Game loop
  useEffect(() => {
    if (!isPlaying || isGameOver) {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
      }
      return
    }

    gameLoopRef.current = setInterval(moveSnake, speed)

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
      }
    }
  }, [isPlaying, isGameOver, speed, moveSnake])

  const changeDirection = useCallback((newDir: Position) => {
    setNextDirection((prev) => {
      // Prevent 180 degree turns
      if (
        (newDir.x !== 0 && newDir.x === -directionRef.current.x) ||
        (newDir.y !== 0 && newDir.y === -directionRef.current.y)
      ) {
        return prev
      }
      return newDir
    })
  }, [])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying || isGameOver) return

      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          e.preventDefault()
          changeDirection({ x: 0, y: -1 })
          break
        case "ArrowDown":
        case "s":
        case "S":
          e.preventDefault()
          changeDirection({ x: 0, y: 1 })
          break
        case "ArrowLeft":
        case "a":
        case "A":
          e.preventDefault()
          changeDirection({ x: -1, y: 0 })
          break
        case "ArrowRight":
        case "d":
        case "D":
          e.preventDefault()
          changeDirection({ x: 1, y: 0 })
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isPlaying, isGameOver, changeDirection])

  const startGame = () => {
    setSnake(INITIAL_SNAKE)
    setDirection(INITIAL_DIRECTION)
    setNextDirection(INITIAL_DIRECTION)
    directionRef.current = INITIAL_DIRECTION
    nextDirectionRef.current = INITIAL_DIRECTION
    setFood(getRandomFood(INITIAL_SNAKE))
    setScore(0)
    setSpeed(INITIAL_SPEED)
    setIsGameOver(false)
    setIsPlaying(true)
  }

  const togglePause = () => {
    setIsPlaying((prev) => !prev)
  }

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
        <h1 className="text-3xl font-bold text-white">{t("snake")}</h1>

        {/* Score Display */}
        <div className="flex gap-8 text-center">
          <div>
            <div className="text-sm text-slate-400">{t("score")}</div>
            <div className="text-2xl font-bold text-green-400">{score}</div>
          </div>
          <div>
            <div className="text-sm text-slate-400">{t("highScore")}</div>
            <div className="text-2xl font-bold text-yellow-400">{highScore}</div>
          </div>
        </div>

        {/* Game Board */}
        <Card className="border-slate-700 bg-slate-800/50">
          <CardContent className="p-2">
            <div
              className="grid gap-[1px] rounded bg-slate-900 p-1"
              style={{
                gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
              }}
            >
              {Array(BOARD_SIZE)
                .fill(null)
                .map((_, y) =>
                  Array(BOARD_SIZE)
                    .fill(null)
                    .map((_, x) => {
                      const isSnakeHead = snake[0]?.x === x && snake[0]?.y === y
                      const isSnakeBody = snake.slice(1).some((s) => s.x === x && s.y === y)
                      const isFood = food.x === x && food.y === y

                      let cellClass = "bg-slate-800"
                      if (isSnakeHead) cellClass = "bg-green-400 rounded-sm"
                      else if (isSnakeBody) cellClass = "bg-green-600 rounded-sm"
                      else if (isFood) cellClass = "bg-red-500 rounded-full"

                      return (
                        <div
                          key={`${y}-${x}`}
                          className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${cellClass}`}
                        />
                      )
                    })
                )}
            </div>
          </CardContent>
        </Card>

        {/* Game Over */}
        {isGameOver && (
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500">{t("gameOver")}</div>
            <div className="text-slate-400">
              {t("finalScore")}: {score}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-2">
          {!isPlaying && !isGameOver && score === 0 && (
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
          {!isPlaying && !isGameOver && score > 0 && (
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

        {/* Mobile Controls */}
        <div className="flex flex-col items-center gap-2 md:hidden">
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12"
            onTouchStart={(e) => {
              e.preventDefault()
              changeDirection({ x: 0, y: -1 })
            }}
          >
            <ChevronUp className="h-6 w-6" />
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12"
              onTouchStart={(e) => {
                e.preventDefault()
                changeDirection({ x: -1, y: 0 })
              }}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <div className="h-12 w-12" />
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12"
              onTouchStart={(e) => {
                e.preventDefault()
                changeDirection({ x: 1, y: 0 })
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
              changeDirection({ x: 0, y: 1 })
            }}
          >
            <ChevronDown className="h-6 w-6" />
          </Button>
        </div>

        {/* Instructions */}
        <div className="text-center text-sm text-slate-500">
          <span className="hidden md:inline">{t("snakeControls")}</span>
          <span className="md:hidden">{t("snakeControlsMobile")}</span>
        </div>
      </main>
    </div>
  )
}
