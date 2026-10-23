"use client"

import { useCallback, useEffect, useReducer, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useLocale } from "@/lib/locale-context"
import { GameHeader } from "@/components/game-header"
import { shouldIgnoreGameKey } from "@/lib/game-input"
import { usePageVisibility } from "@/lib/use-page-visibility"
import { useHighScore } from "@/lib/use-high-score"
import { InlineNotice } from "@/components/inline-notice"
import { Play, Pause, RotateCcw, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react"
import {
  createInitialSnakeState,
  DEFAULT_BOARD_SIZE,
  snakeReducer,
  type Position,
} from "@/features/snake/engine"

export function SnakeGame() {
  const { t } = useLocale()
  const [game, dispatch] = useReducer(snakeReducer, undefined, createInitialSnakeState)
  const { highScore, storageUnavailable, recordScore } = useHighScore("snakeHighScore")
  const [round, setRound] = useState(0)
  const { food, phase, score, snake, speed } = game
  const isPlaying = phase === "playing"
  const isPaused = phase === "paused"
  const isGameOver = phase === "gameOver"
  const isWon = phase === "won"
  const [backgroundPaused, setBackgroundPaused] = useState(false)
  const { isVisible, isPageVisible } = usePageVisibility(() => {
    if (isPlaying) setBackgroundPaused(true)
    // A start/resume may already be queued even before its render commits.
    dispatch({ type: "pause" })
  })

  // Persist earned scores independently of the current round and other open tabs.
  useEffect(() => { recordScore(score) }, [score, recordScore])

  // Game loop
  useEffect(() => {
    if (!isPlaying || !isVisible || !isPageVisible()) return
    let active = true

    const gameLoop = window.setInterval(() => {
      if (active && isPageVisible()) dispatch({ type: "tick", foodRoll: Math.random() })
    }, speed)

    return () => {
      active = false
      window.clearInterval(gameLoop)
    }
  }, [isPlaying, speed, round, isVisible, isPageVisible])

  const changeDirection = useCallback((newDir: Position) => {
    dispatch({ type: "changeDirection", direction: newDir })
  }, [])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying || shouldIgnoreGameKey(e)) return

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
  }, [isPlaying, changeDirection])

  const startGame = () => {
    if (!isPageVisible()) return
    setBackgroundPaused(false)
    setRound(value => value + 1)
    dispatch({ type: "start", foodRoll: Math.random() })
  }

  const togglePause = () => {
    if (!isPageVisible()) return
    setBackgroundPaused(false)
    dispatch({ type: "togglePause" })
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <GameHeader
        homeIcon="back"
        homeLabel={t("appName")}
        homeButtonClassName="text-slate-400 hover:text-white"
      />

      <main className="flex flex-1 flex-col items-center justify-center gap-6 py-4">
        <h1 className="text-3xl font-bold text-white">{t("snake")}</h1>
        {storageUnavailable && <InlineNotice className="max-w-md">{t("highScoreStorageError")}</InlineNotice>}
        {backgroundPaused && <p role="status" className="max-w-md text-center text-sm text-slate-300">{t("backgroundPaused")}</p>}

        {/* Score Display */}
        <div className="flex gap-8 text-center" role="status" aria-live="polite">
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
        <Card className="w-full max-w-[365px] border-slate-700 bg-slate-800/50">
          <CardContent className="p-2">
            <div
              className="grid gap-[1px] rounded bg-slate-900 p-1"
              role="img"
              aria-label={`${t("snake")}. ${t("score")}: ${score}. Head: ${snake[0] ? `${snake[0].x + 1}, ${snake[0].y + 1}` : "none"}. Food: ${food ? `${food.x + 1}, ${food.y + 1}` : "none"}.`}
              style={{
                gridTemplateColumns: `repeat(${DEFAULT_BOARD_SIZE}, 1fr)`,
              }}
            >
              {Array(DEFAULT_BOARD_SIZE)
                .fill(null)
                .map((_, y) =>
                  Array(DEFAULT_BOARD_SIZE)
                    .fill(null)
                    .map((_, x) => {
                      const isSnakeHead = snake[0]?.x === x && snake[0]?.y === y
                      const isSnakeBody = snake.slice(1).some((s) => s.x === x && s.y === y)
                      const isFood = food?.x === x && food.y === y

                      let cellClass = "bg-slate-800"
                      if (isSnakeHead) cellClass = "bg-green-400 rounded-sm"
                      else if (isSnakeBody) cellClass = "bg-green-600 rounded-sm"
                      else if (isFood) cellClass = "bg-red-500 rounded-full"

                      return (
                        <div
                          key={`${y}-${x}`}
                          className={`aspect-square min-w-0 ${cellClass}`}
                          aria-hidden="true"
                        />
                      )
                    })
                )}
            </div>
          </CardContent>
        </Card>

        {/* Game Over */}
        {(isGameOver || isWon) && (
          <div className="text-center" role="status" aria-live="assertive">
            <div
              className={`text-2xl font-bold ${isWon ? "text-green-400" : "text-red-500"}`}
            >
              {isWon ? t("youWin") : t("gameOver")}
            </div>
            <div className="text-slate-400">
              {t("finalScore")}: {score}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-2">
          {phase === "idle" && (
            <Button onClick={startGame} className="gap-2 bg-green-600 hover:bg-green-700">
              <Play className="h-4 w-4" aria-hidden="true" />
              {t("start")}
            </Button>
          )}
          {isPlaying && (
            <Button onClick={togglePause} variant="secondary" className="gap-2">
              <Pause className="h-4 w-4" aria-hidden="true" />
              {t("pause")}
            </Button>
          )}
          {isPaused && (
            <Button onClick={togglePause} className="gap-2 bg-green-600 hover:bg-green-700">
              <Play className="h-4 w-4" aria-hidden="true" />
              {t("resume")}
            </Button>
          )}
          {phase !== "idle" && (
            <Button onClick={startGame} variant="outline" className="gap-2">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {t("restart")}
            </Button>
          )}
        </div>

        {/* Mobile Controls */}
        <div className="flex flex-col items-center gap-2 md:hidden [@media(pointer:coarse)]:flex">
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12"
            aria-label={`${t("snakeControlsMobile")} ↑`}
            disabled={!isPlaying}
            onClick={() => changeDirection({ x: 0, y: -1 })}
          >
            <ChevronUp className="h-6 w-6" aria-hidden="true" />
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12"
              aria-label={`${t("snakeControlsMobile")} ←`}
              disabled={!isPlaying}
              onClick={() => changeDirection({ x: -1, y: 0 })}
            >
              <ChevronLeft className="h-6 w-6" aria-hidden="true" />
            </Button>
            <div className="h-12 w-12" />
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12"
              aria-label={`${t("snakeControlsMobile")} →`}
              disabled={!isPlaying}
              onClick={() => changeDirection({ x: 1, y: 0 })}
            >
              <ChevronRight className="h-6 w-6" aria-hidden="true" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12"
            aria-label={`${t("snakeControlsMobile")} ↓`}
            disabled={!isPlaying}
            onClick={() => changeDirection({ x: 0, y: 1 })}
          >
            <ChevronDown className="h-6 w-6" aria-hidden="true" />
          </Button>
        </div>

        {/* Instructions */}
        <div className="text-center text-sm text-slate-500">
          <span className="hidden md:inline [@media(pointer:coarse)]:hidden">{t("snakeControls")}</span>
          <span className="md:hidden [@media(pointer:coarse)]:inline">{t("snakeControlsMobile")}</span>
        </div>
      </main>
    </div>
  )
}
