// @vitest-environment jsdom

vi.mock("@/lib/storage-lock", () => ({
  runWithStorageLock: (_name: string, operation: () => void) => Promise.resolve(operation()),
}))

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { translations } from "@/lib/i18n"
import { Game2048 } from "./game-2048"
import { GomokuGame } from "./gomoku-game"
import { BingoGame } from "./bingo-game"
import { BingoCards } from "./bingo-cards"
import { GoGame } from "./go-game"
import { ChessGame } from "./chess-game"
import { ChineseChessGame } from "./chinese-chess-game"
import { ReversiGame } from "./reversi-game"
import { SudokuGame } from "./sudoku-game"
import { generateSudoku } from "@/features/sudoku/engine"
import { AnimeTracker } from "./anime-tracker"
import { SnakeGame } from "./snake-game"
import { TetrisGame } from "./tetris-game"
import { MinesweeperGame } from "./minesweeper-game"
import { createEmptyBoard as createMineBoard, populateMines } from "@/features/minesweeper/engine"
import { createInitialSnakeState } from "@/features/snake/engine"

const fixture = vi.hoisted(() => ({ board: null as unknown[][] | null, locale: "en" as "en" | "zh" | "th", listeners: new Set<() => void>() }))
vi.mock("@/features/sudoku/engine", async importOriginal => {
  const actual = await importOriginal<typeof import("@/features/sudoku/engine")>()
  return { ...actual, generateSudoku: vi.fn(actual.generateSudoku) }
})
vi.mock("@/features/snake/engine", async importOriginal => {
  const actual = await importOriginal<typeof import("@/features/snake/engine")>()
  return { ...actual, createInitialSnakeState: vi.fn(actual.createInitialSnakeState) }
})
vi.mock("@/features/minesweeper/engine", async importOriginal => {
  const actual = await importOriginal<typeof import("@/features/minesweeper/engine")>()
  return { ...actual, populateMines: vi.fn(actual.populateMines) }
})

// Only replace the starting position, leaving the component's moves and result
// handling real. No test state or debug route is exposed by the application.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  return {
    ...actual,
    useState: (initial: unknown) => actual.useState(
      fixture.board && typeof initial === "function" && initial.name === "createInitialBoard"
        ? () => structuredClone(fixture.board)
        : initial,
    ),
  }
})

describe("arcade terminal states", () => {
  it("ends Snake on collision, freezes controls and restarts", () => {
    vi.useFakeTimers()
    const stopLoop = vi.spyOn(window, "clearInterval")
    vi.mocked(createInitialSnakeState).mockReturnValueOnce({
      ...createInitialSnakeState(), phase:"playing", food:{x:9,y:9},
      snake:[{x:1,y:1},{x:2,y:1},{x:2,y:2},{x:1,y:2}],
    })
    render(<SnakeGame />)
    act(()=>{vi.advanceTimersByTime(150)})
    expect(screen.getByText(translations.en.gameOver)).toBeTruthy()
    expect(stopLoop).toHaveBeenCalled()
    capture("snake-loss")
    fireEvent.click(screen.getByRole("button", {name:translations.en.restart}))
    expect(screen.queryByText(translations.en.gameOver)).toBeNull()
    expect(screen.getByRole("button", {name:translations.en.pause})).toBeTruthy()
  })

  it("shows a full 20 by 20 Snake board win and final score", () => {
    vi.useFakeTimers()
    const stopLoop = vi.spyOn(window, "clearInterval")
    const snake = [{x:0,y:0}]
    for(let x=0;x<20;x++) for(let offset=1;offset<20;offset++) snake.push({x,y:x%2===0?offset:20-offset})
    for(let x=19;x>=2;x--) snake.push({x,y:0})
    vi.mocked(createInitialSnakeState).mockReturnValueOnce({
      ...createInitialSnakeState(), snake, food:{x:1,y:0}, score:3980, highScore:3980, phase:"playing",
    })
    render(<SnakeGame />)
    act(()=>{vi.advanceTimersByTime(150)})
    expect(screen.getByText(translations.en.youWin)).toBeTruthy()
    expect(screen.getByText("Final Score: 3990")).toBeTruthy()
    expect(stopLoop).toHaveBeenCalled()
    capture("snake-win")
  })

  it("shows Tetris game over, final score and a working restart", () => {
    vi.useFakeTimers()
    const stopLoop = vi.spyOn(window, "clearInterval")
    vi.spyOn(Math,"random").mockReturnValue(0)
    render(<TetrisGame />)
    fireEvent.click(screen.getByRole("button", {name:translations.en.start}))
    for(let i=0;i<40 && !screen.queryByText(translations.en.gameOver);i++) fireEvent.keyDown(window,{key:" "})
    expect(screen.getByText(translations.en.gameOver)).toBeTruthy()
    expect(screen.getByText(/Final Score:/)).toBeTruthy()
    expect((screen.getByRole("button",{name:"Hard drop piece"}) as HTMLButtonElement).disabled).toBe(true)
    expect(stopLoop).toHaveBeenCalled()
    capture("tetris-loss")
    fireEvent.click(screen.getByRole("button", {name:translations.en.restart}))
    expect(screen.queryByText(translations.en.gameOver)).toBeNull()
    expect((screen.getByRole("button",{name:"Hard drop piece"}) as HTMLButtonElement).disabled).toBe(false)
  })

  it.each(["won", "lost"])("stops Minesweeper's timer and controls when %s", ending => {
    vi.useFakeTimers()
    const position = populateMines(createMineBoard(9,9),10,{row:4,col:4},()=>0)
    vi.mocked(populateMines).mockReturnValueOnce(position)
    render(<MinesweeperGame />)
    fireEvent.click(screen.getByRole("button",{name:"row 5, column 5, hidden"}))
    act(()=>{vi.advanceTimersByTime(2000)})
    for(let r=0;r<9;r++) for(let c=0;c<9;c++) {
      if (position[r][c].isMine !== (ending === "lost")) continue
      fireEvent.click(screen.getByRole("button",{name:new RegExp(`^row ${r+1}, column ${c+1},`)}))
    }
    expect(screen.getByText(translations.en[ending === "won" ? "youWin" : "gameOver"])).toBeTruthy()
    expect((screen.getByRole("button",{name:"Flag mode"}) as HTMLButtonElement).disabled).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    capture(`minesweeper-${ending}`)
    fireEvent.click(screen.getByRole("button", {name:translations.en.restart}))
    expect(screen.getByText("00:00")).toBeTruthy()
    expect((screen.getByRole("button",{name:"Flag mode"}) as HTMLButtonElement).disabled).toBe(false)
  })
})

function boardClick(name: string, prefix: string) {
  fireEvent.click(within(screen.getByRole("group", { name })).getByRole("button", { name: new RegExp(`^${prefix},`) }))
}

describe("board game end controls", () => {
  it("explains an immediate ko recapture and clears the warning after a legal move", () => {
    render(<GoGame />)
    for(const cell of ["1, 2","2, 2","2, 1","1, 3","3, 2","3, 3","9, 9","2, 4","2, 3","2, 2"]) boardClick(translations.en.go,cell)
    expect(screen.getByRole("alert").textContent).toBe(translations.en.goRule4)
    capture("go-ko-error")
    boardClick(translations.en.go,"9, 8")
    expect(screen.queryByRole("alert")).toBeNull()
  })
  it("shows a black Go win with the final totals", () => {
    render(<GoGame />)
    boardClick(translations.en.go,"5, 5")
    fireEvent.click(screen.getByRole("button",{name:translations.en.pass}))
    fireEvent.click(screen.getByRole("button",{name:translations.en.pass}))
    expect(screen.getByText(translations.en.blackWinsGo)).toBeTruthy()
    capture("go-black-win")
  })
  it("explains a suicide move and ends Go after two passes", () => {
    render(<GoGame />)
    for (const cell of ["1, 2", "9, 9", "2, 1", "1, 1"]) boardClick(translations.en.go, cell)
    expect(screen.getByRole("alert").textContent).toBe(translations.en.goRule3)
    capture("go-illegal-move")
    const pass = screen.getByRole("button", { name: translations.en.pass })
    fireEvent.click(pass)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByText(translations.en.passRecorded)).toBeTruthy()
    fireEvent.click(pass)
    expect((pass as HTMLButtonElement).disabled).toBe(true)
    expect(within(screen.getByRole("group", { name: translations.en.go })).getAllByRole("button").every(cell => (cell as HTMLButtonElement).disabled)).toBe(true)
    capture("go-final-score")
    fireEvent.click(screen.getByRole("button", { name: translations.en.restart }))
    expect((pass as HTMLButtonElement).disabled).toBe(false)
  })

  it("locks the chess board after Fool's Mate and reopens it on restart", () => {
    render(<ChessGame />)
    for (const square of ["f2", "f3", "e7", "e5", "g2", "g4", "d8", "h4"]) boardClick(translations.en.chess, square)
    expect(screen.getByText(translations.en.blackWinsChess)).toBeTruthy()
    expect(within(screen.getByRole("group", { name: translations.en.chess })).getAllByRole("button").every(cell => (cell as HTMLButtonElement).disabled)).toBe(true)
    capture("chess-checkmate")
    fireEvent.click(screen.getByRole("button", { name: translations.en.restart }))
    expect(screen.queryByText(translations.en.blackWinsChess)).toBeNull()
  })

  it("announces chess stalemate", () => {
    fixture.board = Array.from({length: 8}, () => Array(8).fill(null))
    fixture.board[0][0] = {color:"black",type:"king"}
    fixture.board[2][2] = {color:"white",type:"king"}
    fixture.board[3][1] = {color:"white",type:"queen"}
    render(<ChessGame />)
    boardClick(translations.en.chess, "b5")
    boardClick(translations.en.chess, "b6")
    expect(screen.getByText(translations.en.stalemate)).toBeTruthy()
    capture("chess-stalemate")
  })

  it("announces a white chess win after Scholar's Mate", () => {
    render(<ChessGame />)
    for (const square of ["e2","e4","e7","e5","f1","c4","b8","c6","d1","h5","g8","f6","h5","f7"]) boardClick(translations.en.chess,square)
    expect(screen.getByText(translations.en.whiteWinsChess)).toBeTruthy()
    capture("chess-white-win")
  })

  it.each(["red","black"])("locks Chinese chess after a %s checkmate and restarts", winner => {
    fixture.board = Array.from({length: 10}, () => Array(9).fill(null))
    fixture.board[0][3] = {color:"black",type:"king"}
    fixture.board[1][3] = {color:"black",type:"pawn"}
    fixture.board[9][4] = {color:"red",type:"king"}
    fixture.board[2][3] = {color:"red",type:"chariot"}
    fixture.board[1][0] = {color:"red",type:"chariot"}
    if(winner === "black") {
      fixture.board = fixture.board.reverse().map(row=>row.reverse().map(cell=>cell ? {...cell as {type:string;color:string},color:(cell as {color:string}).color === "red" ? "black" : "red"} : null))
      fixture.board[6][0] = {color:"red",type:"pawn"}
    }
    render(<ChineseChessGame />)
    const moves = winner === "red" ? ["2, 1","2, 4"] : ["7, 1","6, 1","9, 9","9, 6"]
    moves.forEach(cell=>boardClick(translations.en.chineseChess,cell))
    const result = translations.en[winner === "red" ? "redWins" : "blackWins"]
    expect(screen.getByText(result)).toBeTruthy()
    expect(within(screen.getByRole("group", { name: translations.en.chineseChess })).getAllByRole("button").every(cell => (cell as HTMLButtonElement).disabled)).toBe(true)
    capture(`chinese-chess-${winner}-win`)
    fireEvent.click(screen.getByRole("button", { name: translations.en.restart }))
    expect(screen.queryByText(result)).toBeNull()
  })
})

describe("Reversi states", () => {
  it.each(["black", "white", "tie"])("shows the %s ending", winner => {
    fixture.board = Array.from({length: 8}, (_,r) => Array(8).fill(winner === "tie" ? (r < 4 ? "black" : "white") : winner))
    render(<ReversiGame />)
    expect(screen.getByText(translations.en[winner === "tie" ? "tie" : winner === "black" ? "blackWinsGo" : "whiteWinsGo"])).toBeTruthy()
    capture(`reversi-${winner}`)
    fireEvent.click(screen.getByRole("button", { name: translations.en.restart }))
    expect(screen.getAllByRole("button", { name: /valid move/ })).toHaveLength(4)
  })

  it("explains a forced pass and finishes the next move", () => {
    fixture.board = Array.from({length: 8}, () => Array(8).fill("white"))
    fixture.board[0][0] = null
    fixture.board[0][1] = "black"
    render(<ReversiGame />)
    expect(screen.getByText(new RegExp(translations.en.turnPassed.replaceAll(".", "\\.")))).toBeTruthy()
    capture("reversi-pass")
    boardClick(translations.en.reversi, "1, 1")
    expect(screen.getByText(translations.en.whiteWinsGo)).toBeTruthy()
  })
})

describe("Sudoku recovery and completion", () => {
  const solution = Array.from({length:9}, (_,r) => Array.from({length:9}, (_,c) => (r*3+Math.floor(r/3)+c)%9+1))
  const puzzle = solution.map(row => [...row] as (number|null)[])
  puzzle[0][0] = null

  it("recovers from generation failure and can finish with a hint", () => {
    vi.mocked(generateSudoku).mockImplementationOnce(() => { throw new Error("Unable to generate") }).mockReturnValueOnce({puzzle,solution})
    render(<SudokuGame />)
    expect(screen.getByRole("alert").textContent).toBe(translations.en.sudokuGenerationError)
    expect((screen.getByRole("button",{name:"1"}) as HTMLButtonElement).disabled).toBe(true)
    capture("sudoku-generation-error")
    fireEvent.click(screen.getByRole("button", {name:translations.en.restart}))
    expect(screen.queryByRole("alert")).toBeNull()
    fireEvent.click(screen.getByRole("button", {name:"2"}))
    expect(screen.getByRole("alert").textContent).toBe(translations.en.sudokuInputError)
    capture("sudoku-wrong-number")
    fireEvent.click(screen.getByRole("button", {name:"Hint (3)"}))
    expect(screen.getByText(translations.en.youWin)).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
    expect((screen.getByRole("button",{name:"1"}) as HTMLButtonElement).disabled).toBe(true)
    capture("sudoku-win")
  })
})

describe("tracker exception recovery", () => {
  it("renders all five record statuses", () => {
    localStorage.setItem("xm-games-anime-tracker",JSON.stringify(["watching","completed","planned","paused","dropped"].map((status,index)=>({
      id:String(index),title:`Status fixture ${index+1}`,totalEpisodes:12,currentEpisode:status === "completed" ? 12 : 1,status,type:"anime",rating:null,notes:"",imageUrl:"",addedAt:1,updatedAt:index+1,
    }))))
    render(<AnimeTracker />)
    fireEvent.mouseDown(screen.getByRole("tab",{name:/^All/}))
    fireEvent.click(screen.getByRole("tab",{name:/^All/}))
    expect(screen.getByText("Status fixture 2")).toBeTruthy()
    capture("anime-record-statuses")
  })
  it("preserves damaged saved data and explains why auto-save stopped", () => {
    localStorage.setItem("xm-games-anime-tracker", "{broken")
    render(<AnimeTracker />)
    expect(screen.getByRole("alert").textContent).toContain(translations.en.storageReadError)
    expect(localStorage.getItem("xm-games-anime-tracker")).toBe("{broken")
    capture("anime-storage-read-error")
  })

  it("shows failed saving and retries the same data after storage recovers", () => {
    const save = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {throw new Error("Quota")})
    render(<AnimeTracker />)
    expect(screen.queryByRole("alert")).toBeNull()
    fireEvent.click(screen.getByRole("button", {name:translations.en.addAnime}))
    fireEvent.change(screen.getByLabelText(/^Title/), {target:{value:"Saved after recovery"}})
    fireEvent.click(screen.getByRole("button", {name:translations.en.save}))
    expect(screen.getByRole("alert").textContent).toContain(translations.en.storageWriteError)
    expect(screen.getByRole("dialog")).toBeTruthy()
    capture("anime-storage-write-error")
    save.mockRestore()
    fireEvent.click(screen.getByRole("button", {name:translations.en.retry}))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(JSON.parse(localStorage.getItem("xm-games-anime-tracker")!)[0].title).toBe("Saved after recovery")
  })

  it("recovers a failed search, explains empty results, and validates form ranges", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ok:false}).mockResolvedValueOnce({ok:true,json:async()=>({data:[]})}))
    render(<AnimeTracker />)
    fireEvent.click(screen.getByRole("button", {name:translations.en.addAnime}))
    fireEvent.change(screen.getByLabelText(/^Title/), {target:{value:"Audit fixture"}})
    await act(async()=>{vi.advanceTimersByTime(500)})
    expect(screen.getByRole("alert").textContent).toContain(translations.en.animeSearchError)
    capture("anime-search-error")
    fireEvent.click(screen.getByRole("button", {name:translations.en.retry}))
    await act(async()=>{vi.advanceTimersByTime(500)})
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByText(translations.en.animeSearchEmpty)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(translations.en.currentEpisode), {target:{value:"-1"}})
    fireEvent.click(screen.getByRole("button", {name:translations.en.save}))
    expect(screen.getByRole("alert").textContent).toBe(translations.en.animeFormError)
    capture("anime-form-error")
    fireEvent.change(screen.getByLabelText(translations.en.currentEpisode), {target:{value:"0"}})
    fireEvent.click(screen.getByRole("button", {name:translations.en.save}))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(JSON.parse(localStorage.getItem("xm-games-anime-tracker")!)[0].currentEpisode).toBe(0)
  })
})
vi.mock("@/lib/locale-context", async () => {
  const { useSyncExternalStore } = await import("react")
  return { useLocale: () => {
    const locale = useSyncExternalStore(callback => {
      fixture.listeners.add(callback)
      return () => { fixture.listeners.delete(callback) }
    }, () => fixture.locale)
    return { locale, setLocale: vi.fn(), t: (key: keyof typeof translations.en) => translations[locale][key] }
  } }
})

// Optional local visual evidence from the actual rendered component DOM.
// Set both variables explicitly; ordinary test runs never write artifacts.
function capture(name: string) {
  const directory = process.env.XM_UI_EVIDENCE_DIR
  const stylesheet = process.env.XM_UI_CSS_URL
  if (!directory || !stylesheet) return
  mkdirSync(directory, { recursive: true })
  for (const locale of ["zh", "th", "en"] as const) {
    act(() => { fixture.locale = locale; fixture.listeners.forEach(notify => notify()) })
    writeFileSync(join(directory, `${name}-${locale}.html`), `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} — test position (${locale})</title><link rel="stylesheet" href="${stylesheet}"><body style="font-family:Arial,sans-serif">${document.body.innerHTML}</body></html>`)
  }
}

afterEach(() => {
  cleanup()
  fixture.board = null
  fixture.locale = "en"
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  localStorage.clear()
})

describe("Bingo ending and errors", () => {
  it("keeps every winning card visible and clears wins on reset", () => {
    vi.spyOn(Math,"random").mockReturnValue(0)
    render(<BingoCards />)
    for(let i=0;i<2;i++) fireEvent.click(screen.getByRole("button",{name:translations.en.addCard}))
    for(const number of [1,16,31,46,61]) {
      fireEvent.change(screen.getByRole("spinbutton"),{target:{value:String(number)}})
      fireEvent.click(screen.getByRole("button",{name:translations.en.confirm}))
    }
    expect(screen.getAllByText("BINGO!")).toHaveLength(2)
    capture("bingo-cards-win")
    fireEvent.click(screen.getByRole("button",{name:translations.en.resetMarks}))
    expect(screen.queryByText("BINGO!")).toBeNull()
  })
  it("stops auto draw at 75 and can reset without speech synthesis", () => {
    vi.useFakeTimers()
    vi.stubGlobal("speechSynthesis", undefined)
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
    render(<BingoGame />)
    fireEvent.click(screen.getByRole("switch", { name: translations.en.autoDrawMode }))
    fireEvent.click(screen.getByRole("button", { name: translations.en.start }))
    for (let i = 0; i < 75; i++) act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getAllByText(translations.en.allDrawn).length).toBeGreaterThan(0)
    expect((screen.getByRole("button", { name: translations.en.allDrawn }) as HTMLButtonElement).disabled).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    capture("bingo-all-drawn")
    fireEvent.click(screen.getByRole("button", { name: translations.en.reset }))
    expect(screen.queryByText(translations.en.allDrawn)).toBeNull()
    expect((screen.getByRole("button", { name: translations.en.start }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("explains invalid and duplicate card numbers and clears errors after correction", () => {
    render(<BingoCards />)
    const input = screen.getByRole("spinbutton")
    const confirm = screen.getByRole("button", { name: translations.en.confirm })
    for (const value of ["", "0", "76", "1.5"]) {
      fireEvent.change(input, { target: { value } })
      fireEvent.click(confirm)
      expect(screen.getByRole("alert").textContent).toBe(translations.en.bingoInvalidNumber)
    }
    capture("bingo-input-error")
    fireEvent.change(input, { target: { value: "75" } })
    fireEvent.click(confirm)
    expect(screen.queryByRole("alert")).toBeNull()
    fireEvent.change(input, { target: { value: "75" } })
    fireEvent.click(confirm)
    expect(screen.getByRole("alert").textContent).toBe(translations.en.bingoDuplicateNumber)
  })

  it.each(["not-allowed", "network"])("shows %s speech failures without a restart loop", (error) => {
    vi.useFakeTimers()
    const recognizers: { onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null }[] = []
    const start = vi.fn()
    vi.stubGlobal("SpeechRecognition", class {
      onerror = null
      onend = null
      start = start
      stop = vi.fn()
      abort = vi.fn()
      constructor() { recognizers.push(this) }
    })
    render(<BingoCards />)
    fireEvent.click(screen.getByRole("button", { name: translations.en.startListening }))
    act(() => { recognizers[0].onerror?.({ error }); recognizers[0].onend?.() })
    expect(screen.getByRole("alert").textContent).toBe(error === "not-allowed" ? translations.en.speechPermissionDenied : translations.en.speechUnavailable)
    expect(screen.getByRole("button", { name: translations.en.startListening })).toBeTruthy()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(start).toHaveBeenCalledTimes(1)
    capture(`bingo-speech-${error}`)
  })
})

describe("2048 terminal states", () => {
  it("shows game over even when the last merge also reaches 2048", () => {
    fixture.board = [[1024, 1024, 4, 8], [16, 32, 64, 128], [256, 512, 1024, 2], [4, 8, 16, 32]]
    vi.spyOn(Math, "random").mockReturnValue(0)
    render(<Game2048 />)
    fireEvent.keyDown(window, { key: "ArrowLeft" })
    expect(screen.getByText("Game Over", { exact: true })).toBeTruthy()
    expect(screen.queryByText("You Win!", { exact: true })).toBeNull()
    expect((screen.getByRole("button", { name: "Move up" }) as HTMLButtonElement).disabled).toBe(true)
    capture("2048-ended-after-win")
    fireEvent.click(screen.getByRole("button", { name: "Restart" }))
    expect(screen.queryByText("Game Over", { exact: true })).toBeNull()
    expect((screen.getByRole("button", { name: "Move up" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("allows further play after reaching 2048 while moves remain", () => {
    fixture.board = [[1024, 1024, null, null], ...Array.from({ length: 3 }, () => Array(4).fill(null))]
    vi.spyOn(Math, "random").mockReturnValue(0)
    render(<Game2048 />)
    fireEvent.keyDown(window, { key: "ArrowLeft" })
    expect(screen.getByText(translations.en.youWin)).toBeTruthy()
    capture("2048-win-continue")
    fireEvent.keyDown(window, { key: "ArrowDown" })
    expect(screen.getByRole("img", { name: "4, 1, 2048" })).toBeTruthy()
  })
})

describe("Gomoku endings", () => {
  it.each(["black", "white"])("announces a %s win and clears it on restart", winner => {
    render(<GomokuGame />)
    const moves = winner === "black" ? ["1, 1","2, 1","1, 2","2, 2","1, 3","2, 3","1, 4","2, 4","1, 5"] : ["1, 1","2, 1","1, 3","2, 2","1, 5","2, 3","1, 7","2, 4","1, 9","2, 5"]
    moves.forEach(cell=>boardClick(translations.en.gomoku,cell))
    const result = translations.en[winner === "black" ? "blackWinsGo" : "whiteWinsGo"]
    expect(screen.getByText(result)).toBeTruthy()
    capture(`gomoku-${winner}-win`)
    fireEvent.click(screen.getByRole("button",{name:translations.en.restart}))
    expect(screen.queryByText(result)).toBeNull()
  })
  it("announces a full-board draw and resets it", () => {
    render(<GomokuGame />)
    const board = within(screen.getByRole("group", { name: "Gomoku" }))
    const cells = board.getAllByRole("button")
    const black: number[][] = [], white: number[][] = []
    for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) {
      ;((Math.floor(c / 2) + r) % 2 === 0 ? black : white).push([r + 1, c + 1])
    }
    for (let i = 0; i < black.length; i++) {
      for (const cell of [black[i], white[i]].filter(Boolean)) {
        fireEvent.click(cells[(cell[0] - 1) * 15 + cell[1] - 1])
      }
    }
    expect(screen.getByText("Tie", { exact: true })).toBeTruthy()
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true)
    capture("gomoku-draw")
    fireEvent.click(screen.getByRole("button", { name: "Restart" }))
    expect(screen.queryByText("Tie", { exact: true })).toBeNull()
    expect(board.getByRole("button", { name: "1, 1, empty" })).toBeTruthy()
  })
})
