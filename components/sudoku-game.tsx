"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useLocale } from "@/lib/locale-context"
import { LanguageSwitcher } from "@/components/language-switcher"
import { Home, RotateCcw, HelpCircle, X, Eraser, Lightbulb } from "lucide-react"
import Link from "next/link"

type Board = (number | null)[][]
type Difficulty = "easy" | "medium" | "hard"

const DIFFICULTIES = {
  easy: 38,    // cells to remove
  medium: 46,
  hard: 54,
}

function isValid(board: Board, row: number, col: number, num: number): boolean {
  // Check row
  for (let c = 0; c < 9; c++) {
    if (board[row][c] === num) return false
  }
  
  // Check column
  for (let r = 0; r < 9; r++) {
    if (board[r][col] === num) return false
  }
  
  // Check 3x3 box
  const boxRow = Math.floor(row / 3) * 3
  const boxCol = Math.floor(col / 3) * 3
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      if (board[r][c] === num) return false
    }
  }
  
  return true
}

function solveSudoku(board: Board): boolean {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === null) {
        for (let num = 1; num <= 9; num++) {
          if (isValid(board, row, col, num)) {
            board[row][col] = num
            if (solveSudoku(board)) return true
            board[row][col] = null
          }
        }
        return false
      }
    }
  }
  return true
}

function generateSudoku(difficulty: Difficulty): { puzzle: Board; solution: Board } {
  // Create a solved board
  const solution: Board = Array(9).fill(null).map(() => Array(9).fill(null))
  
  // Fill diagonal 3x3 boxes first (they don't affect each other)
  for (let box = 0; box < 9; box += 3) {
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5)
    let idx = 0
    for (let r = box; r < box + 3; r++) {
      for (let c = box; c < box + 3; c++) {
        solution[r][c] = nums[idx++]
      }
    }
  }
  
  // Solve the rest
  solveSudoku(solution)
  
  // Create puzzle by removing numbers
  const puzzle = solution.map(row => [...row])
  const cellsToRemove = DIFFICULTIES[difficulty]
  const positions = Array.from({ length: 81 }, (_, i) => i).sort(() => Math.random() - 0.5)
  
  for (let i = 0; i < cellsToRemove; i++) {
    const pos = positions[i]
    const row = Math.floor(pos / 9)
    const col = pos % 9
    puzzle[row][col] = null
  }
  
  return { puzzle, solution }
}

export function SudokuGame() {
  const { t } = useLocale()
  const [difficulty, setDifficulty] = useState<Difficulty>("easy")
  const [puzzle, setPuzzle] = useState<Board>([])
  const [solution, setSolution] = useState<Board>([])
  const [board, setBoard] = useState<Board>([])
  const [initialCells, setInitialCells] = useState<boolean[][]>([])
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null)
  const [errors, setErrors] = useState<boolean[][]>(Array(9).fill(null).map(() => Array(9).fill(false)))
  const [completed, setCompleted] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [hints, setHints] = useState(3)

  const initGame = useCallback(() => {
    const { puzzle: newPuzzle, solution: newSolution } = generateSudoku(difficulty)
    setPuzzle(newPuzzle)
    setSolution(newSolution)
    setBoard(newPuzzle.map(row => [...row]))
    setInitialCells(newPuzzle.map(row => row.map(cell => cell !== null)))
    setSelectedCell(null)
    setErrors(Array(9).fill(null).map(() => Array(9).fill(false)))
    setCompleted(false)
    setHints(3)
  }, [difficulty])

  useEffect(() => {
    initGame()
  }, [initGame])

  const handleCellClick = (row: number, col: number) => {
    if (completed) return
    if (initialCells[row]?.[col]) return
    setSelectedCell([row, col])
  }

  const handleNumberInput = useCallback((num: number | null) => {
    if (!selectedCell || completed) return
    const [row, col] = selectedCell
    if (initialCells[row][col]) return

    const newBoard = board.map(r => [...r])
    newBoard[row][col] = num
    setBoard(newBoard)

    // Check for errors
    const newErrors = Array(9).fill(null).map(() => Array(9).fill(false))
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const val = newBoard[r][c]
        if (val !== null && val !== solution[r][c]) {
          newErrors[r][c] = true
        }
      }
    }
    setErrors(newErrors)

    // Check completion
    const isComplete = newBoard.every((row, r) => 
      row.every((cell, c) => cell === solution[r][c])
    )
    if (isComplete) {
      setCompleted(true)
    }
  }, [selectedCell, board, solution, initialCells, completed])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedCell) return
      
      if (e.key >= "1" && e.key <= "9") {
        handleNumberInput(parseInt(e.key))
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        handleNumberInput(null)
      } else if (e.key === "ArrowUp" && selectedCell[0] > 0) {
        setSelectedCell([selectedCell[0] - 1, selectedCell[1]])
      } else if (e.key === "ArrowDown" && selectedCell[0] < 8) {
        setSelectedCell([selectedCell[0] + 1, selectedCell[1]])
      } else if (e.key === "ArrowLeft" && selectedCell[1] > 0) {
        setSelectedCell([selectedCell[0], selectedCell[1] - 1])
      } else if (e.key === "ArrowRight" && selectedCell[1] < 8) {
        setSelectedCell([selectedCell[0], selectedCell[1] + 1])
      }
    }
    
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedCell, handleNumberInput])

  const useHint = () => {
    if (hints <= 0 || !selectedCell || completed) return
    const [row, col] = selectedCell
    if (initialCells[row][col]) return
    
    const newBoard = board.map(r => [...r])
    newBoard[row][col] = solution[row][col]
    setBoard(newBoard)
    setHints(h => h - 1)
    
    // Clear error for this cell
    const newErrors = errors.map(r => [...r])
    newErrors[row][col] = false
    setErrors(newErrors)

    // Check completion
    const isComplete = newBoard.every((row, r) => 
      row.every((cell, c) => cell === solution[r][c])
    )
    if (isComplete) setCompleted(true)
  }

  const getCellStyle = (row: number, col: number) => {
    const isSelected = selectedCell?.[0] === row && selectedCell?.[1] === col
    const isInitial = initialCells[row]?.[col]
    const hasError = errors[row]?.[col]
    const isSameRow = selectedCell?.[0] === row
    const isSameCol = selectedCell?.[1] === col
    const isSameBox = selectedCell && 
      Math.floor(selectedCell[0] / 3) === Math.floor(row / 3) &&
      Math.floor(selectedCell[1] / 3) === Math.floor(col / 3)
    
    let bg = "bg-white"
    if (isSelected) bg = "bg-blue-200"
    else if (isSameRow || isSameCol || isSameBox) bg = "bg-blue-50"
    if (hasError) bg = "bg-red-100"
    
    let text = "text-blue-600"
    if (isInitial) text = "text-slate-900"
    if (hasError) text = "text-red-600"
    
    return `${bg} ${text}`
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 p-4">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-blue-200 hover:text-white">
            <Home className="mr-2 h-4 w-4" />
            {t("appName")}
          </Button>
        </Link>
        <LanguageSwitcher />
      </div>

      <main className="flex flex-1 flex-col items-center gap-4 py-4">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">{t("sudoku")}</h1>

        {/* Difficulty selector */}
        <div className="flex gap-2">
          {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
            <Button
              key={d}
              variant={difficulty === d ? "default" : "outline"}
              size="sm"
              onClick={() => setDifficulty(d)}
              className={difficulty === d 
                ? "bg-blue-600" 
                : "border-blue-600 bg-transparent text-blue-200 hover:bg-blue-700"
              }
            >
              {t(d === "easy" ? "easy" : d === "medium" ? "medium" : "hard")}
            </Button>
          ))}
        </div>

        {/* Game status */}
        {completed && (
          <div className="rounded-lg bg-green-500/20 px-4 py-2 text-lg font-bold text-green-300">
            {t("youWin")}
          </div>
        )}

        {/* Game board */}
        <div className="rounded-lg border-2 border-blue-300 bg-white p-1">
          <div className="grid grid-cols-9">
            {board.map((row, rowIndex) =>
              row.map((cell, colIndex) => (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  onClick={() => handleCellClick(rowIndex, colIndex)}
                  className={`
                    flex h-9 w-9 items-center justify-center text-lg font-semibold transition-colors
                    sm:h-10 sm:w-10 sm:text-xl
                    ${getCellStyle(rowIndex, colIndex)}
                    ${colIndex % 3 === 2 && colIndex !== 8 ? "border-r-2 border-blue-400" : "border-r border-blue-200"}
                    ${rowIndex % 3 === 2 && rowIndex !== 8 ? "border-b-2 border-blue-400" : "border-b border-blue-200"}
                    ${initialCells[rowIndex]?.[colIndex] ? "cursor-default" : "cursor-pointer hover:bg-blue-100"}
                  `}
                >
                  {cell}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Number input buttons */}
        <div className="flex flex-wrap justify-center gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <Button
              key={num}
              onClick={() => handleNumberInput(num)}
              variant="outline"
              className="h-10 w-10 border-blue-500 bg-blue-700/50 text-lg font-bold text-white hover:bg-blue-600"
            >
              {num}
            </Button>
          ))}
          <Button
            onClick={() => handleNumberInput(null)}
            variant="outline"
            className="h-10 w-10 border-blue-500 bg-blue-700/50 text-white hover:bg-blue-600"
          >
            <Eraser className="h-5 w-5" />
          </Button>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            onClick={initGame}
            variant="outline"
            className="border-blue-500 bg-blue-700/50 text-blue-100 hover:bg-blue-600"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {t("restart")}
          </Button>
          <Button
            onClick={useHint}
            variant="outline"
            disabled={hints <= 0 || !selectedCell}
            className="border-blue-500 bg-blue-700/50 text-blue-100 hover:bg-blue-600 disabled:opacity-50"
          >
            <Lightbulb className="mr-2 h-4 w-4" />
            {t("hint")} ({hints})
          </Button>
          <Button
            onClick={() => setShowRules(true)}
            variant="outline"
            className="border-blue-500 bg-blue-700/50 text-blue-100 hover:bg-blue-600"
          >
            <HelpCircle className="mr-2 h-4 w-4" />
            {t("howToPlay")}
          </Button>
        </div>

        <p className="max-w-md text-center text-xs text-blue-200/70">
          {t("sudokuInstructions")}
        </p>

        {/* Rules Modal */}
        {showRules && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowRules(false)}>
            <Card 
              className="max-h-[80vh] w-full max-w-md overflow-y-auto border-blue-500 bg-blue-800 p-4 sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">{t("howToPlay")}</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowRules(false)} className="text-blue-200 hover:text-white">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <ul className="space-y-2 text-sm text-blue-100">
                <li>{t("sudokuRule1")}</li>
                <li>{t("sudokuRule2")}</li>
                <li>{t("sudokuRule3")}</li>
              </ul>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
