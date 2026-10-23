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
  const { locale, setLocale, t } = useLocale()

  return (
    <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
      <SelectTrigger aria-label={t("language")} className="w-auto min-w-[132px] shrink-0 border-slate-600 bg-slate-800 text-slate-200">
        <Globe className="h-4 w-4" aria-hidden="true" />
        <SelectValue className="shrink-0" />
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
