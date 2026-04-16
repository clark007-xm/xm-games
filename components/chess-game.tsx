"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useLocale } from "@/lib/locale-context"
import { RotateCcw, Home, Undo2, HelpCircle, X, Flag } from "lucide-react"

type PieceType = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn"
type Color = "white" | "black"
type Piece = { type: PieceType; color: Color } | null
type Position = { row: number; col: number }

const pieceSymbols: Record<Color, Record<PieceType, string>> = {
  white: { king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙" },
  black: { king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟" }
}

function createInitialBoard(): Piece[][] {
  const board: Piece[][] = Array(8).fill(null).map(() => Array(8).fill(null))
  
  // Black pieces (top)
  board[0] = [
    { type: "rook", color: "black" }, { type: "knight", color: "black" },
    { type: "bishop", color: "black" }, { type: "queen", color: "black" },
    { type: "king", color: "black" }, { type: "bishop", color: "black" },
    { type: "knight", color: "black" }, { type: "rook", color: "black" }
  ]
  board[1] = Array(8).fill(null).map(() => ({ type: "pawn" as PieceType, color: "black" as Color }))
  
  // White pieces (bottom)
  board[6] = Array(8).fill(null).map(() => ({ type: "pawn" as PieceType, color: "white" as Color }))
  board[7] = [
    { type: "rook", color: "white" }, { type: "knight", color: "white" },
    { type: "bishop", color: "white" }, { type: "queen", color: "white" },
    { type: "king", color: "white" }, { type: "bishop", color: "white" },
    { type: "knight", color: "white" }, { type: "rook", color: "white" }
  ]
  
  return board
}

function isValidMove(
  board: Piece[][],
  from: Position,
  to: Position,
  piece: Piece,
  enPassantTarget: Position | null,
  castlingRights: { whiteKing: boolean; whiteQueen: boolean; blackKing: boolean; blackQueen: boolean }
): boolean {
  if (!piece) return false
  
  const dx = to.col - from.col
  const dy = to.row - from.row
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  const target = board[to.row][to.col]
  
  // Can't capture own piece
  if (target && target.color === piece.color) return false
  
  switch (piece.type) {
    case "pawn": {
      const direction = piece.color === "white" ? -1 : 1
      const startRow = piece.color === "white" ? 6 : 1
      
      // Forward move
      if (dx === 0 && !target) {
        if (dy === direction) return true
        if (from.row === startRow && dy === 2 * direction && !board[from.row + direction][from.col]) return true
      }
      
      // Capture
      if (absDx === 1 && dy === direction) {
        if (target) return true
        // En passant
        if (enPassantTarget && to.row === enPassantTarget.row && to.col === enPassantTarget.col) return true
      }
      
      return false
    }
    
    case "knight":
      return (absDx === 2 && absDy === 1) || (absDx === 1 && absDy === 2)
    
    case "bishop": {
      if (absDx !== absDy) return false
      const stepX = dx > 0 ? 1 : -1
      const stepY = dy > 0 ? 1 : -1
      for (let i = 1; i < absDx; i++) {
        if (board[from.row + i * stepY][from.col + i * stepX]) return false
      }
      return true
    }
    
    case "rook": {
      if (dx !== 0 && dy !== 0) return false
      const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1
      const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1
      const steps = Math.max(absDx, absDy)
      for (let i = 1; i < steps; i++) {
        if (board[from.row + i * stepY][from.col + i * stepX]) return false
      }
      return true
    }
    
    case "queen": {
      const isStraight = dx === 0 || dy === 0
      const isDiagonal = absDx === absDy
      if (!isStraight && !isDiagonal) return false
      
      const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1
      const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1
      const steps = Math.max(absDx, absDy)
      for (let i = 1; i < steps; i++) {
        if (board[from.row + i * stepY][from.col + i * stepX]) return false
      }
      return true
    }
    
    case "king": {
      // Normal move
      if (absDx <= 1 && absDy <= 1) return true
      
      // Castling
      if (dy === 0 && absDx === 2) {
        const row = piece.color === "white" ? 7 : 0
        if (from.row !== row || from.col !== 4) return false
        
        // Kingside
        if (dx === 2) {
          const canCastle = piece.color === "white" ? castlingRights.whiteKing : castlingRights.blackKing
          if (!canCastle) return false
          if (board[row][5] || board[row][6]) return false
          return true
        }
        
        // Queenside
        if (dx === -2) {
          const canCastle = piece.color === "white" ? castlingRights.whiteQueen : castlingRights.blackQueen
          if (!canCastle) return false
          if (board[row][1] || board[row][2] || board[row][3]) return false
          return true
        }
      }
      
      return false
    }
  }
  
  return false
}

function findKing(board: Piece[][], color: Color): Position | null {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col]
      if (piece && piece.type === "king" && piece.color === color) {
        return { row, col }
      }
    }
  }
  return null
}

function isInCheck(board: Piece[][], color: Color): boolean {
  const kingPos = findKing(board, color)
  if (!kingPos) return false
  
  const opponent = color === "white" ? "black" : "white"
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col]
      if (piece && piece.color === opponent) {
        if (isValidMove(board, { row, col }, kingPos, piece, null, { whiteKing: false, whiteQueen: false, blackKing: false, blackQueen: false })) {
          return true
        }
      }
    }
  }
  
  return false
}

function hasLegalMoves(
  board: Piece[][],
  color: Color,
  enPassantTarget: Position | null,
  castlingRights: { whiteKing: boolean; whiteQueen: boolean; blackKing: boolean; blackQueen: boolean }
): boolean {
  for (let fromRow = 0; fromRow < 8; fromRow++) {
    for (let fromCol = 0; fromCol < 8; fromCol++) {
      const piece = board[fromRow][fromCol]
      if (!piece || piece.color !== color) continue
      
      for (let toRow = 0; toRow < 8; toRow++) {
        for (let toCol = 0; toCol < 8; toCol++) {
          if (isValidMove(board, { row: fromRow, col: fromCol }, { row: toRow, col: toCol }, piece, enPassantTarget, castlingRights)) {
            // Try the move
            const newBoard = board.map(r => [...r])
            newBoard[toRow][toCol] = piece
            newBoard[fromRow][fromCol] = null
            
            // Check if still in check
            if (!isInCheck(newBoard, color)) {
              return true
            }
          }
        }
      }
    }
  }
  
  return false
}

function getValidMoves(
  board: Piece[][],
  pos: Position,
  enPassantTarget: Position | null,
  castlingRights: { whiteKing: boolean; whiteQueen: boolean; blackKing: boolean; blackQueen: boolean }
): Position[] {
  const piece = board[pos.row][pos.col]
  if (!piece) return []
  
  const moves: Position[] = []
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (isValidMove(board, pos, { row, col }, piece, enPassantTarget, castlingRights)) {
        // Try the move
        const newBoard = board.map(r => [...r])
        newBoard[row][col] = piece
        newBoard[pos.row][pos.col] = null
        
        // Check if still in check
        if (!isInCheck(newBoard, piece.color)) {
          moves.push({ row, col })
        }
      }
    }
  }
  
  return moves
}

export function ChessGame() {
  const { t } = useLocale()

  const [board, setBoard] = useState<Piece[][]>(createInitialBoard())
  const [currentTurn, setCurrentTurn] = useState<Color>("white")
  const [selectedPos, setSelectedPos] = useState<Position | null>(null)
  const [validMoves, setValidMoves] = useState<Position[]>([])
  const [gameStatus, setGameStatus] = useState<"playing" | "check" | "checkmate" | "stalemate">("playing")
  const [winner, setWinner] = useState<Color | null>(null)
  const [history, setHistory] = useState<{ board: Piece[][]; turn: Color; castling: typeof castlingRights; enPassant: Position | null }[]>([])
  const [enPassantTarget, setEnPassantTarget] = useState<Position | null>(null)
  const [castlingRights, setCastlingRights] = useState({
    whiteKing: true, whiteQueen: true, blackKing: true, blackQueen: true
  })
  const [lastMove, setLastMove] = useState<{ from: Position; to: Position } | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [whiteUndoUsed, setWhiteUndoUsed] = useState(false)
  const [blackUndoUsed, setBlackUndoUsed] = useState(false)

  const resetGame = useCallback(() => {
    setBoard(createInitialBoard())
    setCurrentTurn("white")
    setSelectedPos(null)
    setValidMoves([])
    setGameStatus("playing")
    setWinner(null)
    setHistory([])
    setEnPassantTarget(null)
    setCastlingRights({ whiteKing: true, whiteQueen: true, blackKing: true, blackQueen: true })
    setLastMove(null)
    setWhiteUndoUsed(false)
    setBlackUndoUsed(false)
  }, [])

  const handleCellClick = useCallback((row: number, col: number) => {
    if (gameStatus === "checkmate" || gameStatus === "stalemate") return

    const clickedPiece = board[row][col]

    // Select own piece
    if (clickedPiece && clickedPiece.color === currentTurn) {
      setSelectedPos({ row, col })
      setValidMoves(getValidMoves(board, { row, col }, enPassantTarget, castlingRights))
      return
    }

    // Try to move
    if (selectedPos) {
      const movingPiece = board[selectedPos.row][selectedPos.col]
      if (!movingPiece) return

      const isValid = validMoves.some(m => m.row === row && m.col === col)
      if (!isValid) {
        setSelectedPos(null)
        setValidMoves([])
        return
      }

      // Save history
      setHistory(prev => [...prev, {
        board: board.map(r => [...r]),
        turn: currentTurn,
        castling: { ...castlingRights },
        enPassant: enPassantTarget
      }])

      const newBoard = board.map(r => [...r])
      const newCastling = { ...castlingRights }
      let newEnPassant: Position | null = null

      // Handle castling
      if (movingPiece.type === "king" && Math.abs(col - selectedPos.col) === 2) {
        const rookCol = col > selectedPos.col ? 7 : 0
        const newRookCol = col > selectedPos.col ? col - 1 : col + 1
        newBoard[row][newRookCol] = newBoard[row][rookCol]
        newBoard[row][rookCol] = null
      }

      // Handle en passant capture
      if (movingPiece.type === "pawn" && enPassantTarget && row === enPassantTarget.row && col === enPassantTarget.col) {
        const capturedRow = currentTurn === "white" ? row + 1 : row - 1
        newBoard[capturedRow][col] = null
      }

      // Handle pawn double move (set en passant target)
      if (movingPiece.type === "pawn" && Math.abs(row - selectedPos.row) === 2) {
        newEnPassant = { row: (row + selectedPos.row) / 2, col }
      }

      // Handle pawn promotion
      let promotedPiece: Piece = movingPiece
      if (movingPiece.type === "pawn" && (row === 0 || row === 7)) {
        promotedPiece = { type: "queen", color: movingPiece.color }
      }

      // Update castling rights
      if (movingPiece.type === "king") {
        if (movingPiece.color === "white") {
          newCastling.whiteKing = false
          newCastling.whiteQueen = false
        } else {
          newCastling.blackKing = false
          newCastling.blackQueen = false
        }
      }
      if (movingPiece.type === "rook") {
        if (selectedPos.row === 7 && selectedPos.col === 0) newCastling.whiteQueen = false
        if (selectedPos.row === 7 && selectedPos.col === 7) newCastling.whiteKing = false
        if (selectedPos.row === 0 && selectedPos.col === 0) newCastling.blackQueen = false
        if (selectedPos.row === 0 && selectedPos.col === 7) newCastling.blackKing = false
      }

      // Move piece
      newBoard[row][col] = promotedPiece
      newBoard[selectedPos.row][selectedPos.col] = null

      setBoard(newBoard)
      setCastlingRights(newCastling)
      setEnPassantTarget(newEnPassant)
      setLastMove({ from: selectedPos, to: { row, col } })
      setSelectedPos(null)
      setValidMoves([])

      // Check game status
      const opponent = currentTurn === "white" ? "black" : "white"
      const inCheck = isInCheck(newBoard, opponent)
      const hasLegal = hasLegalMoves(newBoard, opponent, newEnPassant, newCastling)

      if (!hasLegal) {
        if (inCheck) {
          setGameStatus("checkmate")
          setWinner(currentTurn)
        } else {
          setGameStatus("stalemate")
        }
      } else if (inCheck) {
        setGameStatus("check")
      } else {
        setGameStatus("playing")
      }

      setCurrentTurn(opponent)
    }
  }, [board, selectedPos, currentTurn, validMoves, gameStatus, enPassantTarget, castlingRights])

  const handleUndo = useCallback(() => {
    if (history.length === 0) return
    if (gameStatus === "checkmate" || gameStatus === "stalemate") return

    const undoingPlayer = currentTurn === "white" ? "black" : "white"
    if (undoingPlayer === "white" && whiteUndoUsed) return
    if (undoingPlayer === "black" && blackUndoUsed) return

    const lastState = history[history.length - 1]
    setBoard(lastState.board)
    setCurrentTurn(lastState.turn)
    setCastlingRights(lastState.castling)
    setEnPassantTarget(lastState.enPassant)
    setHistory(prev => prev.slice(0, -1))
    setSelectedPos(null)
    setValidMoves([])
    setGameStatus("playing")
    setLastMove(null)

    if (undoingPlayer === "white") {
      setWhiteUndoUsed(true)
    } else {
      setBlackUndoUsed(true)
    }
  }, [history, gameStatus, currentTurn, whiteUndoUsed, blackUndoUsed])

  const isValidTarget = (row: number, col: number) => validMoves.some(m => m.row === row && m.col === col)

  return (
    <div className="flex min-h-screen flex-col items-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      {/* Header */}
      <div className="mb-4 flex w-full max-w-lg items-center justify-between">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-slate-100 hover:bg-slate-700">
            <Home className="mr-2 h-4 w-4" />
            {t("appName")}
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-slate-100 sm:text-2xl">{t("chess")}</h1>
        <LanguageSwitcher />
      </div>

      {/* Game Status */}
      <Card className="mb-4 w-full max-w-lg border-slate-600 bg-slate-800/50 p-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`text-2xl ${currentTurn === "white" ? "opacity-100" : "opacity-40"}`}>♔</span>
              <span className={`text-sm ${currentTurn === "white" ? "text-slate-100" : "text-slate-100/50"}`}>
                {t("whiteTurn")}
              </span>
            </div>
            <div className="h-4 w-px bg-slate-600" />
            <div className="flex items-center gap-2">
              <span className={`text-2xl ${currentTurn === "black" ? "opacity-100" : "opacity-40"}`}>♚</span>
              <span className={`text-sm ${currentTurn === "black" ? "text-slate-100" : "text-slate-100/50"}`}>
                {t("blackTurnChess")}
              </span>
            </div>
          </div>

          {gameStatus === "check" && (
            <div className="flex justify-center">
              <span className="animate-pulse rounded-full bg-yellow-500/20 px-3 py-1 text-sm font-bold text-yellow-400">
                {t("checkChess")}
              </span>
            </div>
          )}
          {gameStatus === "checkmate" && (
            <div className="flex justify-center">
              <span className="rounded-full bg-red-500/20 px-3 py-1 text-sm font-bold text-red-400">
                {winner === "white" ? t("whiteWinsChess") : t("blackWinsChess")}
              </span>
            </div>
          )}
          {gameStatus === "stalemate" && (
            <div className="flex justify-center">
              <span className="rounded-full bg-slate-500/20 px-3 py-1 text-sm font-bold text-slate-400">
                {t("stalemate")}
              </span>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 text-xs">
            <span className="text-amber-200">
              {whiteUndoUsed ? t("undoUsed") : `${t("undoRemaining")}: 1`}
            </span>
            <div className="h-3 w-px bg-slate-600/50" />
            <span className="text-slate-400">
              {blackUndoUsed ? t("undoUsed") : `${t("undoRemaining")}: 1`}
            </span>
          </div>
        </div>
      </Card>

      {/* Board */}
      <div className="rounded-lg border-4 border-amber-900 shadow-xl">
        <div className="grid grid-cols-8">
          {board.map((row, rowIndex) =>
            row.map((piece, colIndex) => {
              const isLight = (rowIndex + colIndex) % 2 === 0
              const isSelected = selectedPos?.row === rowIndex && selectedPos?.col === colIndex
              const isValid = isValidTarget(rowIndex, colIndex)
              const isLastFrom = lastMove?.from.row === rowIndex && lastMove?.from.col === colIndex
              const isLastTo = lastMove?.to.row === rowIndex && lastMove?.to.col === colIndex

              return (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  onClick={() => handleCellClick(rowIndex, colIndex)}
                  className={`
                    relative flex h-9 w-9 items-center justify-center text-2xl transition-all
                    sm:h-11 sm:w-11 sm:text-3xl
                    ${isLight ? "bg-amber-200" : "bg-amber-700"}
                    ${isSelected ? "ring-2 ring-yellow-400 ring-inset" : ""}
                    ${isLastFrom || isLastTo ? "bg-yellow-400/50" : ""}
                  `}
                >
                  {isValid && !piece && (
                    <div className="absolute h-3 w-3 rounded-full bg-green-500/50" />
                  )}
                  {piece && (
                    <span className={`${isValid ? "ring-2 ring-green-400 rounded-full" : ""} ${piece.color === "white" ? "text-amber-50 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" : "text-slate-900"}`}>
                      {pieceSymbols[piece.color][piece.type]}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button
          onClick={handleUndo}
          disabled={history.length === 0 || gameStatus === "checkmate" || gameStatus === "stalemate" ||
            (currentTurn === "white" && blackUndoUsed) ||
            (currentTurn === "black" && whiteUndoUsed)
          }
          variant="outline"
          className="border-slate-600 bg-slate-800/50 text-slate-100 hover:bg-slate-700"
        >
          <Undo2 className="mr-1 h-4 w-4" />
          {t("undo")}
        </Button>
        <Button
          onClick={resetGame}
          variant="outline"
          className="border-slate-600 bg-slate-800/50 text-slate-100 hover:bg-slate-700"
        >
          <RotateCcw className="mr-1 h-4 w-4" />
          {t("restart")}
        </Button>
        <Button
          onClick={() => setShowRules(true)}
          variant="outline"
          className="border-slate-600 bg-slate-800/50 text-slate-100 hover:bg-slate-700"
        >
          <HelpCircle className="mr-1 h-4 w-4" />
          {t("howToPlay")}
        </Button>
      </div>

      {/* Instructions */}
      <p className="mt-4 max-w-md text-center text-xs text-slate-400">
        {t("chessInstructionsInt")}
      </p>

      {/* Rules Modal */}
      {showRules && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowRules(false)}>
          <Card 
            className="max-h-[80vh] w-full max-w-md overflow-y-auto border-slate-600 bg-slate-900/95 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-100">{t("howToPlay")}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowRules(false)} className="text-slate-100 hover:bg-slate-800">
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="space-y-2 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <span className="text-xl">♔</span>
                <span>{t("kingRuleInt")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl">♕</span>
                <span>{t("queenRule")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl">♖</span>
                <span>{t("rookRule")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl">♗</span>
                <span>{t("bishopRule")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl">♘</span>
                <span>{t("knightRule")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl">♙</span>
                <span>{t("pawnRuleInt")}</span>
              </div>
              <div className="mt-4 border-t border-slate-700 pt-4">
                <p>{t("chessSpecialRules")}</p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
