import { useCallback, useState } from "react";

export const PERSISTENT_TAB_KEYS = [
  "tw_teacher_tab",
  "tw_student_tab",
  "tw_admin_tab",
  "tw_superadmin_tab",
];

// Remembers the dashboard tab in this browser tab so a reload restores where
// the user currently was instead of resetting to home/overview.
// sessionStorage (per-tab) is used deliberately so two accounts open in two
// tabs never leak each other's tab into a shared localStorage key.
export function usePersistentTab(storageKey, defaultTab, validTabs) {
  const [tab, setTab] = useState(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored && (!validTabs || validTabs.includes(stored))) return stored;
    } catch {}
    return defaultTab;
  });

  const setPersistedTab = useCallback((next) => {
    const value = typeof next === "function" ? next(tab) : next;
    if (validTabs && !validTabs.includes(value)) return;
    setTab(value);
    try { sessionStorage.setItem(storageKey, value); } catch {}
  }, [storageKey, tab, validTabs]);

  return [tab, setPersistedTab];
}

export function clearPersistentTabs() {
  try { PERSISTENT_TAB_KEYS.forEach((k) => sessionStorage.removeItem(k)); } catch {}
}
