/** Keep game shortcuts out of navigation, dialogs, and editable controls. */
export function shouldIgnoreGameKey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return true
  const target = event.target
  if (!(target instanceof Element)) return false
  if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="combobox"], [role="listbox"], [role="menu"]')) return true
  // Space must still activate a focused pause/restart button.
  return event.key === " " && target.closest('button, a, [role="button"]') !== null
}
