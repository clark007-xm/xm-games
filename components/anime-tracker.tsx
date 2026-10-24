"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useLocale } from "@/lib/locale-context"
import type { TranslationKey } from "@/lib/i18n"
import { GameHeader } from "@/components/game-header"
import { InlineNotice } from "@/components/inline-notice"
import { runWithStorageLock } from "@/lib/storage-lock"
import { 
  Plus, 
  Minus, 
  Play, 
  CheckCircle2, 
  Clock, 
  Pause, 
  Trash2, 
  Edit, 
  MoreVertical,
  Tv,
  Film,
  Star,
  Calendar,
  Search,
  Loader2,
  ImageIcon
} from "lucide-react"

// Types
type AnimeStatus = "watching" | "completed" | "planned" | "paused" | "dropped"

interface Anime {
  id: string
  title: string
  totalEpisodes: number | null // null for ongoing series
  currentEpisode: number
  status: AnimeStatus
  type: "anime" | "drama" | "movie"
  rating: number | null
  notes: string
  imageUrl: string
  addedAt: number
  updatedAt: number
}

const STATUS_TRANSLATION_KEYS: Record<AnimeStatus, TranslationKey> = {
  watching: "statusWatching",
  completed: "statusCompleted",
  planned: "statusPlanned",
  paused: "statusPaused",
  dropped: "statusDropped",
}

const TYPE_TRANSLATION_KEYS: Record<Anime["type"], TranslationKey> = {
  anime: "typeAnime",
  drama: "typeDrama",
  movie: "typeMovie",
}

interface JikanAnime {
  mal_id: number
  title: string
  images: {
    jpg: {
      image_url: string
      large_image_url: string
    }
  }
  episodes: number | null
  score: number | null
}

const STORAGE_KEY = "xm-games-anime-tracker"
const IMAGE_CACHE_KEY = "xm-games-anime-images"

class AnimeStorageError extends Error {
  constructor(public readonly translationKey: "storageReadError" | "storageWriteError" | "animeEditConflict") {
    super(translationKey)
  }
}

type AnimeMutation = (latest: Anime[]) => Anime[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isAnime(value: unknown): value is Anime {
  if (!isRecord(value)) return false

  return (
    typeof value.id === "string" && value.id.length > 0 &&
    typeof value.title === "string" && value.title.trim().length > 0 &&
    (value.totalEpisodes === null || (typeof value.totalEpisodes === "number" && Number.isSafeInteger(value.totalEpisodes) && value.totalEpisodes >= 1)) &&
    typeof value.currentEpisode === "number" && Number.isSafeInteger(value.currentEpisode) && value.currentEpisode >= 0 &&
    (value.totalEpisodes === null || value.currentEpisode <= value.totalEpisodes) &&
    ["watching", "completed", "planned", "paused", "dropped"].includes(
      String(value.status)
    ) &&
    ["anime", "drama", "movie"].includes(String(value.type)) &&
    (value.rating === null || (typeof value.rating === "number" && Number.isFinite(value.rating) && value.rating >= 0 && value.rating <= 10)) &&
    typeof value.notes === "string" &&
    typeof value.imageUrl === "string" &&
    typeof value.addedAt === "number" && Number.isFinite(value.addedAt) &&
    typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
  )
}

function isAnimeList(value: unknown): value is Anime[] {
  return Array.isArray(value) && value.every(isAnime) && new Set(value.map(anime => anime.id)).size === value.length
}

function isImageCache(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(item => typeof item === "string")
}

function parseStoredValue<T>(
  rawValue: string | null,
  fallback: T,
  isValid: (value: unknown) => value is T,
  label: string
): T {
  if (rawValue === null) return fallback

  try {
    const parsed: unknown = JSON.parse(rawValue)
    if (isValid(parsed)) return parsed
  } catch {
    // Invalid JSON falls through to the safe default below.
  }

  throw new Error(`Failed to parse ${label}`)
}

export function AnimeTracker() {
  const { t } = useLocale()
  const [animeList, setAnimeList] = useState<Anime[]>([])
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const saveCommitted = useRef(false)
  const [editingAnime, setEditingAnime] = useState<Anime | null>(null)
  const [activeTab, setActiveTab] = useState<AnimeStatus | "all">("watching")

  // Form state
  const [formTitle, setFormTitle] = useState("")
  const [formTotalEpisodes, setFormTotalEpisodes] = useState("")
  const [formCurrentEpisode, setFormCurrentEpisode] = useState("0")
  const [formStatus, setFormStatus] = useState<AnimeStatus>("watching")
  const [formType, setFormType] = useState<"anime" | "drama" | "movie">("anime")
  const [formRating, setFormRating] = useState("")
  const [formNotes, setFormNotes] = useState("")
  const [formImageUrl, setFormImageUrl] = useState("")

  // Search state
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<JikanAnime[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [selectedSearchTitle, setSelectedSearchTitle] = useState<string | null>(null)
  const [imageCache, setImageCache] = useState<Record<string, string>>({})
  const [storageError, setStorageError] = useState<"storageReadError" | "storageWriteError" | null>(null)
  const [editConflict, setEditConflict] = useState(false)
  const mounted = useRef(false)
  const outstandingWrites = useRef(0)
  const failedWrites = useRef<AnimeMutation[]>([])
  const formSession = useRef(0)
  const [searchError, setSearchError] = useState(false)
  const [searchEmpty, setSearchEmpty] = useState(false)
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [formError, setFormError] = useState(false)

  const refreshSavedList = useCallback(() => {
    try {
      const savedAnimeList = parseStoredValue(
        localStorage.getItem(STORAGE_KEY),
        [],
        isAnimeList,
        "saved anime list"
      )
      setAnimeList(savedAnimeList)
      if (failedWrites.current.length === 0) {
        setStorageError(error => error === "storageReadError" ? null : error)
      }
    } catch {
      setStorageError("storageReadError")
    }
  }, [])

  // Reading is never a write. Every mutation below reads the latest saved list
  // while holding a cross-tab lock, including when storage events are delayed.
  useEffect(() => {
    mounted.current = true
    refreshSavedList()
    try {
      setImageCache(parseStoredValue(localStorage.getItem(IMAGE_CACHE_KEY), {}, isImageCache, "image cache"))
    } catch { /* The optional cover cache can be rebuilt by later searches. */ }

    const onStorage = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== localStorage) return
      if (event.key === STORAGE_KEY || event.key === null) refreshSavedList()
    }
    const onVisible = () => { if (document.visibilityState === "visible") refreshSavedList() }
    window.addEventListener("storage", onStorage)
    window.addEventListener("pageshow", refreshSavedList)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      mounted.current = false
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("pageshow", refreshSavedList)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refreshSavedList])

  const persistMutation = (mutation: AnimeMutation, onSuccess?: () => void) => {
    outstandingWrites.current++
    let settled = false
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      outstandingWrites.current--
      // Form edits stay in the open dialog; Retry uses its current values.
      // Button operations retain their deltas, not a stale list snapshot.
      if (!onSuccess) failedWrites.current.push(mutation)
      if (!mounted.current) return
      if (onSuccess) {
        saveCommitted.current = false
        setIsSaving(false)
      }
      if (error instanceof AnimeStorageError && error.translationKey === "animeEditConflict") {
        setEditConflict(true)
        if (failedWrites.current.length === 0) setStorageError(null)
        return
      }
      setStorageError(error instanceof AnimeStorageError && error.translationKey === "storageReadError"
        ? "storageReadError" : "storageWriteError")
    }
    try {
      void runWithStorageLock(STORAGE_KEY, () => {
        try {
          let latest: Anime[]
          try {
            latest = parseStoredValue(localStorage.getItem(STORAGE_KEY), [], isAnimeList, "saved anime list")
          } catch { throw new AnimeStorageError("storageReadError") }
          if (mounted.current) setAnimeList(latest)
          const next = mutation(latest)
          if (next !== latest) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) }
            catch { throw new AnimeStorageError("storageWriteError") }
          }
          settled = true
          outstandingWrites.current--
          if (!mounted.current) return
          setAnimeList(next)
          if (failedWrites.current.length === 0) setStorageError(null)
          onSuccess?.()
        } catch (error) { fail(error) }
      }).catch(fail)
    } catch (error) { fail(error) }
  }

  // Explicitly saved records survive refresh. Warn before dropping a draft or
  // a write that is still waiting for storage; never auto-save an unfinished form.
  useEffect(() => {
    const hasDraft = isAddDialogOpen && (
      formTitle !== (editingAnime?.title ?? "") ||
      formTotalEpisodes !== (editingAnime?.totalEpisodes?.toString() ?? "") ||
      formCurrentEpisode !== (editingAnime?.currentEpisode.toString() ?? "0") ||
      formStatus !== (editingAnime?.status ?? "watching") || formType !== (editingAnime?.type ?? "anime") ||
      formRating !== (editingAnime?.rating?.toString() ?? "") ||
      formNotes !== (editingAnime?.notes ?? "") || formImageUrl !== (editingAnime?.imageUrl ?? "")
    )
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDraft && outstandingWrites.current === 0 && failedWrites.current.length === 0) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [isAddDialogOpen, editingAnime, formTitle, formTotalEpisodes, formCurrentEpisode, formStatus, formType, formRating, formNotes, formImageUrl])

  // Each query owns its timer and request. Cleanup also guards responses whose
  // fetch/JSON promises finish after the query or dialog has changed.
  useEffect(() => {
    setSearchResults([])
    setShowSearchResults(false)
    setIsSearching(false)
    setSearchError(false)
    setSearchEmpty(false)

    const query = formTitle.trim()
    if (
      !isAddDialogOpen || formType !== "anime" || editingAnime ||
      query.length < 2 || formTitle === selectedSearchTitle
    ) return

    const controller = new AbortController()
    let requestTimeout: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(async () => {
      const cachedImage = imageCache[query.toLowerCase()]
      if (cachedImage) setFormImageUrl(cachedImage)
      setIsSearching(true)
      requestTimeout = setTimeout(() => {
        setSearchError(true)
        setIsSearching(false)
        controller.abort()
      }, 10_000)

      try {
        const response = await fetch(
          `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`,
          { signal: controller.signal },
        )
        if (response.ok) {
          const data = await response.json()
          if (controller.signal.aborted) return
          setSearchResults(data.data || [])
          setShowSearchResults(true)
          setSearchEmpty(!data.data?.length)
        } else if (!controller.signal.aborted) setSearchError(true)
      } catch {
        if (!controller.signal.aborted) setSearchError(true)
      } finally {
        clearTimeout(requestTimeout)
        if (!controller.signal.aborted) setIsSearching(false)
      }
    }, 500)
    return () => {
      clearTimeout(timer)
      clearTimeout(requestTimeout)
      controller.abort()
    }
  }, [formTitle, formType, editingAnime, isAddDialogOpen, imageCache, selectedSearchTitle, searchAttempt])

  const selectSearchResult = (anime: JikanAnime) => {
    setSelectedSearchTitle(anime.title)
    setFormTitle(anime.title)
    const imageUrl = anime.images?.jpg?.large_image_url || ""
    setFormImageUrl(imageUrl)
    if (imageUrl) {
      // Cache the image URL
      setImageCache(prev => ({
        ...prev,
        [anime.title.toLowerCase().trim()]: imageUrl
      }))
      // The optional image cache must not cause the anime list to be rewritten.
      void runWithStorageLock(IMAGE_CACHE_KEY, () => {
        let latest: Record<string, string> = {}
        try { latest = parseStoredValue(localStorage.getItem(IMAGE_CACHE_KEY), {}, isImageCache, "image cache") }
        catch { /* Cover cache entries can be rebuilt. */ }
        localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify({ ...latest, [anime.title.toLowerCase().trim()]: imageUrl }))
      }).catch(() => { /* A missing cache never invalidates a saved record. */ })
    }
    setFormTotalEpisodes(anime.episodes?.toString() ?? "")
    setFormRating(anime.score?.toString() ?? "")
    setShowSearchResults(false)
  }

  const resetForm = useCallback(() => {
    formSession.current++
    setIsSaving(false)
    setEditConflict(false)
    if (failedWrites.current.length === 0 && outstandingWrites.current === 0) {
      setStorageError(error => error === "storageWriteError" ? null : error)
    }
    setFormError(false)
    setSelectedSearchTitle(null)
    setFormTitle("")
    setFormTotalEpisodes("")
    setFormCurrentEpisode("0")
    setFormStatus("watching")
    setFormType("anime")
    setFormRating("")
    setFormNotes("")
    setFormImageUrl("")
    setEditingAnime(null)
    setSearchResults([])
    setShowSearchResults(false)
  }, [])

  const openEditDialog = (anime: Anime) => {
    formSession.current++
    setEditConflict(false)
    saveCommitted.current = false
    setFormError(false)
    setEditingAnime(anime)
    setFormTitle(anime.title)
    setFormTotalEpisodes(anime.totalEpisodes?.toString() || "")
    setFormCurrentEpisode(anime.currentEpisode.toString())
    setFormStatus(anime.status)
    setFormType(anime.type)
    setFormRating(anime.rating?.toString() || "")
    setFormNotes(anime.notes)
    setFormImageUrl(anime.imageUrl)
    setIsAddDialogOpen(true)
  }

  const handleSave = () => {
    if (saveCommitted.current || !formTitle.trim()) return

    const now = Date.now()
    const totalEps = formTotalEpisodes ? Number(formTotalEpisodes) : null
    const currentEp = Number(formCurrentEpisode)
    const rating = formRating ? Number(formRating) : null
    if (!Number.isSafeInteger(currentEp) || currentEp < 0 ||
        (totalEps !== null && (!Number.isSafeInteger(totalEps) || totalEps < 1 || currentEp > totalEps)) ||
        (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 10))) {
      setFormError(true)
      return
    }

    saveCommitted.current = true
    setIsSaving(true)
    setEditConflict(false)
    const session = formSession.current
    const saved = () => {
      if (session !== formSession.current) return
      resetForm()
      setIsAddDialogOpen(false)
    }
    if (editingAnime) {
      persistMutation(list => {
        const current = list.find(a => a.id === editingAnime.id)
        if (!current || JSON.stringify(current) !== JSON.stringify(editingAnime)) {
          throw new AnimeStorageError("animeEditConflict")
        }
        return list.map(a =>
        a.id === editingAnime.id 
          ? {
              ...a,
              title: formTitle.trim(),
              totalEpisodes: totalEps,
              currentEpisode: currentEp,
              status: formStatus,
              type: formType,
              rating,
              notes: formNotes,
              imageUrl: formImageUrl,
              updatedAt: now,
            }
          : a
        )
      }, saved)
    } else {
      // Add new
      const newAnime: Anime = {
        id: crypto.randomUUID(),
        title: formTitle.trim(),
        totalEpisodes: totalEps,
        currentEpisode: currentEp,
        status: formStatus,
        type: formType,
        rating,
        notes: formNotes,
        imageUrl: formImageUrl,
        addedAt: now,
        updatedAt: now,
      }
      persistMutation(list => list.some(a => a.id === newAnime.id) ? list : [newAnime, ...list], saved)
    }
  }

  const retryStorage = () => {
    const pending = failedWrites.current.splice(0)
    if (pending.length > 0) pending.forEach(mutation => persistMutation(mutation))
    else if (isAddDialogOpen && !editConflict && formTitle.trim()) handleSave()
    else refreshSavedList()
  }

  const handleDelete = (id: string) => {
    persistMutation(list => list.filter(a => a.id !== id))
  }

  const incrementEpisode = (id: string) => {
    persistMutation(list => list.map(a => {
      if (a.id !== id) return a
      if (a.currentEpisode >= Number.MAX_SAFE_INTEGER) return a
      if (a.totalEpisodes !== null && a.currentEpisode >= a.totalEpisodes) return a
      const newEp = a.currentEpisode + 1
      const isCompleted = a.totalEpisodes && newEp >= a.totalEpisodes
      return {
        ...a,
        currentEpisode: newEp,
        status: isCompleted ? "completed" : a.status,
        updatedAt: Date.now(),
      }
    }))
  }

  const decrementEpisode = (id: string) => {
    persistMutation(list => list.map(a => {
      if (a.id !== id) return a
      const newEp = Math.max(0, a.currentEpisode - 1)
      return {
        ...a,
        currentEpisode: newEp,
        status: a.status === "completed" && a.totalEpisodes && newEp < a.totalEpisodes ? "watching" : a.status,
        updatedAt: Date.now(),
      }
    }))
  }

  const getStatusColor = (status: AnimeStatus) => {
    switch (status) {
      case "watching": return "bg-blue-700"
      case "completed": return "bg-green-700"
      case "planned": return "bg-yellow-700"
      case "paused": return "bg-orange-700"
      case "dropped": return "bg-red-700"
    }
  }

  const getStatusIcon = (status: AnimeStatus) => {
    switch (status) {
      case "watching": return <Play className="h-3 w-3" />
      case "completed": return <CheckCircle2 className="h-3 w-3" />
      case "planned": return <Clock className="h-3 w-3" />
      case "paused": return <Pause className="h-3 w-3" />
      case "dropped": return <Trash2 className="h-3 w-3" />
    }
  }

  const getTypeIcon = (type: "anime" | "drama" | "movie") => {
    switch (type) {
      case "anime": return <Tv className="h-4 w-4" />
      case "drama": return <Film className="h-4 w-4" />
      case "movie": return <Film className="h-4 w-4" />
    }
  }

  const filteredList = activeTab === "all" 
    ? animeList 
    : animeList.filter(a => a.status === activeTab)

  const sortedList = [...filteredList].sort((a, b) => b.updatedAt - a.updatedAt)

  const statusCounts = {
    all: animeList.length,
    watching: animeList.filter(a => a.status === "watching").length,
    completed: animeList.filter(a => a.status === "completed").length,
    planned: animeList.filter(a => a.status === "planned").length,
    paused: animeList.filter(a => a.status === "paused").length,
    dropped: animeList.filter(a => a.status === "dropped").length,
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-2 sm:p-4">
      <div className="mx-auto max-w-6xl">
        {storageError && !isAddDialogOpen && <InlineNotice className="mb-4">{t(storageError)} <Button size="sm" variant="outline" className="mt-2" onClick={retryStorage}>{t("retry")}</Button></InlineNotice>}
        <GameHeader
          layout="tool"
          homeIcon="back"
          homeLabel={t("appName")}
          homeLabelMode="sr-only"
          title={t("animeTracker")}
          description={t("animeTrackerDescription")}
          className="mb-4 sm:mb-6"
          homeButtonClassName="h-8 w-8 text-slate-400 hover:text-white sm:h-10 sm:w-10"
          titleClassName="text-lg font-bold text-white sm:text-2xl"
          descriptionClassName="hidden text-sm text-slate-400 sm:block"
          actions={
              <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
                if (!open && isSaving) return
                if (open) { saveCommitted.current = false; formSession.current++ }
                setIsAddDialogOpen(open)
                if (!open) resetForm()
              }}>
                <DialogTrigger asChild>
                  <Button size="sm" aria-label={t("addAnime")} className="gap-1 px-2 sm:gap-2 sm:px-4">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">{t("addAnime")}</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] w-[95vw] max-w-md overflow-y-auto border-slate-700 bg-slate-800 text-white">
                  <DialogHeader>
                    <DialogTitle>
                      {editingAnime ? t("editAnime") : t("addAnime")}
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                      {editingAnime ? t("editAnimeDescription") : t("addAnimeDescription")}
                    </DialogDescription>
                  </DialogHeader>
                  <fieldset disabled={isSaving} className="grid min-w-0 gap-4 py-4">
                    {formError && <InlineNotice>{t("animeFormError")}</InlineNotice>}
                    {editConflict && <InlineNotice>{t("animeEditConflict")}</InlineNotice>}
                    {storageError && <InlineNotice>{t(storageError)} <Button size="sm" variant="outline" className="mt-2" onClick={retryStorage}>{t("retry")}</Button></InlineNotice>}
{/* Title with Search */}
                                    <div className="relative grid gap-2" onBlur={(event) => {
                                      if (!event.currentTarget.contains(event.relatedTarget)) setShowSearchResults(false)
                                    }}>
                                      <Label htmlFor="title">{t("animeTitle")} *</Label>
                                      <div className="relative">
                                        <Input
                                          id="title"
                                          value={formTitle}
                                          onChange={(e) => {
                                            setSelectedSearchTitle(null)
                                            setFormTitle(e.target.value)
                                            if (e.target.value.length >= 2 && formType === "anime") {
                                              setShowSearchResults(true)
                                            }
                                          }}
                                          onFocus={() => {
                                            if (searchResults.length > 0 && formType === "anime") {
                                              setShowSearchResults(true)
                                            }
                                          }}
                                          placeholder={t("animeTitlePlaceholder")}
                                          className="border-slate-600 bg-slate-700 pr-10"
                                        />
                                        {isSearching && (
                                          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
                                        )}
                                        {!isSearching && formType === "anime" && (
                                          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        )}
                                      </div>
                                      {searchError && <InlineNotice>{t("animeSearchError")} <Button size="sm" variant="outline" className="mt-2" onClick={() => setSearchAttempt(attempt => attempt + 1)}>{t("retry")}</Button></InlineNotice>}
                                      {searchEmpty && <p role="status" className="text-sm text-slate-300">{t("animeSearchEmpty")}</p>}
                                      {/* Search Results Dropdown */}
                                      {showSearchResults && searchResults.length > 0 && (
                                        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-slate-600 bg-slate-700 shadow-lg">
                                          {searchResults.map((anime) => (
                                            <button
                                              key={anime.mal_id}
                                              type="button"
                                              onMouseDown={(e) => {
                                                e.preventDefault()
                                              }}
                                              onClick={() => selectSearchResult(anime)}
                                              className="flex w-full items-center gap-3 p-2 text-left hover:bg-slate-600"
                                            >
                                              {anime.images?.jpg?.image_url ? (
                                                // Search results are short-lived third-party URLs from Jikan.
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img 
                                                  src={anime.images.jpg.image_url} 
                                                  alt={anime.title}
                                                  className="h-12 w-9 rounded object-cover"
                                                />
                                              ) : (
                                                <div className="flex h-12 w-9 items-center justify-center rounded bg-slate-600">
                                                  <ImageIcon className="h-4 w-4 text-slate-400" />
                                                </div>
                                              )}
                                              <div className="flex-1 overflow-hidden">
                                                <p className="truncate text-sm font-medium text-white">{anime.title}</p>
                                                <p className="text-xs text-slate-400">
                                                  {anime.episodes ? `${anime.episodes} ${t("episodesUnit")}` : t("ongoing")}
                                                  {anime.score && ` · ${anime.score}`}
                                                </p>
                                              </div>
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                      <div className="grid min-w-0 gap-2">
                        <Label htmlFor="type">{t("animeType")}</Label>
                        <Select value={formType} onValueChange={(v) => setFormType(v as "anime" | "drama" | "movie")}>
                          <SelectTrigger id="type" className="min-h-9 w-full min-w-0 whitespace-normal border-slate-600 bg-slate-700 text-left data-[size=default]:h-auto *:data-[slot=select-value]:line-clamp-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-slate-600 bg-slate-700">
                            <SelectItem value="anime">{t("typeAnime")}</SelectItem>
                            <SelectItem value="drama">{t("typeDrama")}</SelectItem>
                            <SelectItem value="movie">{t("typeMovie")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid min-w-0 gap-2">
                        <Label htmlFor="status">{t("animeStatus")}</Label>
                        <Select value={formStatus} onValueChange={(v) => setFormStatus(v as AnimeStatus)}>
                          <SelectTrigger id="status" className="min-h-9 w-full min-w-0 whitespace-normal border-slate-600 bg-slate-700 text-left data-[size=default]:h-auto *:data-[slot=select-value]:line-clamp-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-slate-600 bg-slate-700">
                            <SelectItem value="watching">{t("statusWatching")}</SelectItem>
                            <SelectItem value="completed">{t("statusCompleted")}</SelectItem>
                            <SelectItem value="planned">{t("statusPlanned")}</SelectItem>
                            <SelectItem value="paused">{t("statusPaused")}</SelectItem>
                            <SelectItem value="dropped">{t("statusDropped")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="currentEp">{t("currentEpisode")}</Label>
                        <Input
                          id="currentEp"
                          type="number"
                          min="0"
                          max={Number.MAX_SAFE_INTEGER}
                          value={formCurrentEpisode}
                          onChange={(e) => setFormCurrentEpisode(e.target.value)}
                          className="border-slate-600 bg-slate-700"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="totalEp">{t("totalEpisodes")}</Label>
                        <Input
                          id="totalEp"
                          type="number"
                          min="1"
                          max={Number.MAX_SAFE_INTEGER}
                          value={formTotalEpisodes}
                          onChange={(e) => setFormTotalEpisodes(e.target.value)}
                          placeholder={t("ongoing")}
                          className="border-slate-600 bg-slate-700"
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="rating">{t("rating")} (0-10)</Label>
                      <Input
                        id="rating"
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        value={formRating}
                        onChange={(e) => setFormRating(e.target.value)}
                        placeholder={t("ratingPlaceholder")}
                        className="border-slate-600 bg-slate-700"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="imageUrl">{t("coverImage")}</Label>
                      <div className="flex gap-2">
                        <Input
                          id="imageUrl"
                          value={formImageUrl}
                          onChange={(e) => setFormImageUrl(e.target.value)}
                          placeholder="https://..."
                          className="flex-1 border-slate-600 bg-slate-700"
                        />
                        {formImageUrl && (
                          <div className="h-10 w-8 overflow-hidden rounded border border-slate-600">
                            {/* User-entered URLs can use any host, so they cannot use a fixed Next Image allowlist. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                              src={formImageUrl} 
                              alt="Preview" 
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                          </div>
                        )}
                      </div>
                      {formType === "anime" && (
                        <p className="text-xs text-slate-500">{t("autoSearchHint")}</p>
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="notes">{t("notes")}</Label>
                      <Input
                        id="notes"
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        placeholder={t("notesPlaceholder")}
                        className="border-slate-600 bg-slate-700"
                      />
                    </div>
                  </fieldset>
                  <DialogFooter className="gap-2 sm:gap-0">
                    <DialogClose asChild>
                      <Button variant="outline" className="border-slate-600" disabled={isSaving}>
                        {t("cancel")}
                      </Button>
                    </DialogClose>
                    <Button onClick={handleSave} disabled={!formTitle.trim() || isSaving}>
                      {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {t("save")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
          }
        />

        {/* Tabs - Mobile Optimized with horizontal scroll */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AnimeStatus | "all")} className="w-full">
          <div className="-mx-2 mb-4 overflow-x-auto px-2 sm:mx-0 sm:mb-6 sm:px-0">
            <TabsList className="inline-flex h-auto min-w-max gap-1.5 bg-transparent p-0 sm:flex-wrap sm:gap-2">
              <TabsTrigger 
                value="all" 
                className="whitespace-nowrap rounded-full border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs data-[state=active]:border-white data-[state=active]:bg-white data-[state=active]:text-slate-900 sm:px-4 sm:py-2 sm:text-sm"
              >
                {t("all")} ({statusCounts.all})
              </TabsTrigger>
              <TabsTrigger 
                value="watching" 
                className="whitespace-nowrap rounded-full border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs data-[state=active]:border-blue-500 data-[state=active]:bg-blue-700 data-[state=active]:text-white sm:px-4 sm:py-2 sm:text-sm"
              >
                <Play className="mr-1 h-3 w-3" />
                {t("statusWatching")} ({statusCounts.watching})
              </TabsTrigger>
              <TabsTrigger 
                value="planned" 
                className="whitespace-nowrap rounded-full border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs data-[state=active]:border-yellow-500 data-[state=active]:bg-yellow-700 data-[state=active]:text-white sm:px-4 sm:py-2 sm:text-sm"
              >
                <Clock className="mr-1 h-3 w-3" />
                {t("statusPlanned")} ({statusCounts.planned})
              </TabsTrigger>
              <TabsTrigger 
                value="completed" 
                className="whitespace-nowrap rounded-full border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs data-[state=active]:border-green-500 data-[state=active]:bg-green-700 data-[state=active]:text-white sm:px-4 sm:py-2 sm:text-sm"
              >
                <CheckCircle2 className="mr-1 h-3 w-3" />
                {t("statusCompleted")} ({statusCounts.completed})
              </TabsTrigger>
              <TabsTrigger 
                value="paused" 
                className="whitespace-nowrap rounded-full border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs data-[state=active]:border-orange-500 data-[state=active]:bg-orange-700 data-[state=active]:text-white sm:px-4 sm:py-2 sm:text-sm"
              >
                <Pause className="mr-1 h-3 w-3" />
                {t("statusPaused")} ({statusCounts.paused})
              </TabsTrigger>
              <TabsTrigger 
                value="dropped" 
                className="whitespace-nowrap rounded-full border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs data-[state=active]:border-red-500 data-[state=active]:bg-red-700 data-[state=active]:text-white sm:px-4 sm:py-2 sm:text-sm"
              >
                <Trash2 className="mr-1 h-3 w-3" />
                {t("statusDropped")} ({statusCounts.dropped})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={activeTab} className="mt-0">
            {sortedList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 sm:py-16">
                <Tv className="mb-4 h-12 w-12 opacity-50 sm:h-16 sm:w-16" />
                <p className="mb-4 text-base sm:text-lg">{t("noAnime")}</p>
                <Button onClick={() => { saveCommitted.current = false; formSession.current++; setIsAddDialogOpen(true) }} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t("addFirstAnime")}
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {sortedList.map((anime) => (
                  <Card 
                    key={anime.id} 
                    className="min-w-0 overflow-hidden border-slate-700 bg-slate-800/50 transition-all hover:border-slate-500"
                  >
                    {/* Card with horizontal layout on mobile */}
                    <div className="flex sm:block">
                      {/* Image - smaller on mobile, side by side */}
                      <div className="relative w-24 flex-shrink-0 sm:w-full">
                        {anime.imageUrl ? (
                          <div 
                            className="h-full min-h-[120px] bg-cover bg-center sm:h-40" 
                            style={{ backgroundImage: `url(${anime.imageUrl})` }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-slate-800 sm:bg-gradient-to-t sm:from-slate-800 sm:to-transparent" />
                          </div>
                        ) : (
                          <div className="flex h-full min-h-[120px] items-center justify-center bg-slate-700 sm:h-40">
                            {getTypeIcon(anime.type)}
                          </div>
                        )}
                        {/* Status badge - desktop only on image */}
                        <div className="absolute right-1 top-1 hidden sm:right-2 sm:top-2 sm:flex">
                          <Badge className={`${getStatusColor(anime.status)} text-xs text-white`}>
                            {getStatusIcon(anime.status)}
                            <span className="ml-1">{t(STATUS_TRANSLATION_KEYS[anime.status])}</span>
                          </Badge>
                        </div>
                      </div>

                      {/* Content area */}
                      <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-0">
                        <CardHeader className="p-0 pb-2 sm:p-4 sm:pb-2">
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0 flex-1">
                              <CardTitle className="line-clamp-2 text-sm font-bold text-white sm:text-lg">
                                {anime.title}
                              </CardTitle>
                              {/* Mobile status badge */}
                              <div className="mt-1 sm:hidden">
                                <Badge className={`${getStatusColor(anime.status)} text-xs text-white`}>
                                  {getStatusIcon(anime.status)}
                                  <span className="ml-1">{t(STATUS_TRANSLATION_KEYS[anime.status])}</span>
                                </Badge>
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`${t("animeActions")}: ${anime.title}`} className="h-9 w-9 flex-shrink-0 text-slate-400">
                                  <MoreVertical className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="border-slate-600 bg-slate-700">
                                <DropdownMenuItem onClick={() => openEditDialog(anime)} className="text-white">
                                  <Edit className="mr-2 h-4 w-4" />
                                  {t("edit")}
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleDelete(anime.id)} 
                                  className="text-red-400 focus:text-red-400"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {t("delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <div className="flex flex-wrap items-center gap-1 text-xs text-slate-400 sm:gap-2 sm:text-sm">
                            {getTypeIcon(anime.type)}
                            <span>{t(TYPE_TRANSLATION_KEYS[anime.type])}</span>
                            {anime.rating && (
                              <>
                                <Star className="ml-1 h-3 w-3 fill-yellow-500 text-yellow-500 sm:ml-2 sm:h-4 sm:w-4" />
                                <span>{anime.rating}</span>
                              </>
                            )}
                          </div>
                        </CardHeader>

                        <CardContent className="flex-1 p-0 sm:p-4 sm:pt-0">
                          {/* Episode Progress */}
                          <div className="mb-2 sm:mb-3">
                            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs sm:text-sm">
                              <span className="text-slate-400">{t("progress")}</span>
                              <span className="min-w-0 max-w-full text-white [overflow-wrap:anywhere]">
                                {anime.currentEpisode} / {anime.totalEpisodes || "?"}
                              </span>
                            </div>
                            {anime.totalEpisodes && (
                              <Progress 
                                value={(anime.currentEpisode / anime.totalEpisodes) * 100} 
                                className="h-1.5 bg-slate-700 sm:h-2"
                              />
                            )}
                          </div>

                          {/* Episode Controls */}
                          <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => decrementEpisode(anime.id)}
                              aria-label={`${t("decreaseEpisode")}: ${anime.title}`}
                              disabled={anime.currentEpisode === 0}
                              className="h-9 w-9 border-slate-600 bg-slate-700 p-0 text-white hover:bg-slate-600"
                            >
                              <Minus className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <span className="min-w-0 text-center text-sm font-bold text-white [overflow-wrap:anywhere] sm:text-lg">
                              {t("episode")} {anime.currentEpisode}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => incrementEpisode(anime.id)}
                              aria-label={`${t("increaseEpisode")}: ${anime.title}`}
                              disabled={anime.currentEpisode >= Number.MAX_SAFE_INTEGER || (anime.totalEpisodes !== null && anime.currentEpisode >= anime.totalEpisodes)}
                              className="h-9 w-9 border-slate-600 bg-slate-700 p-0 text-white hover:bg-slate-600"
                            >
                              <Plus className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>

                          {anime.notes && (
                            <p className="mt-2 line-clamp-2 text-xs text-slate-400 sm:mt-3 sm:text-sm">
                              {anime.notes}
                            </p>
                          )}

                          <div className="mt-2 flex items-center gap-1 text-xs text-slate-500 sm:mt-3">
                            <Calendar className="h-3 w-3" />
                            {new Date(anime.updatedAt).toLocaleDateString()}
                          </div>
                        </CardContent>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
