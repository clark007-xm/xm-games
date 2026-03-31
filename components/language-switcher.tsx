"use client"

import { useLocale } from "@/lib/locale-context"
import { Locale, locales, localeNames } from "@/lib/i18n"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Globe } from "lucide-react"

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale()

  return (
    <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
      <SelectTrigger className="w-[120px] border-slate-600 bg-slate-800 text-slate-200">
        <Globe className="mr-2 h-4 w-4" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-slate-600 bg-slate-800">
        {locales.map((loc) => (
          <SelectItem
            key={loc}
            value={loc}
            className="text-slate-200 focus:bg-slate-700 focus:text-white"
          >
            {localeNames[loc]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
