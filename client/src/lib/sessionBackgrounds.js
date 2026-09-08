export const SESSION_BACKGROUNDS = [
  {
    "key": "background-01",
    "label": "K-12 Background 1",
    "src": "/media/session-backgrounds/background-01.webp",
    "category": "K12"
  },
  {
    "key": "background-02",
    "label": "K-12 Background 2",
    "src": "/media/session-backgrounds/background-02.webp",
    "category": "K12"
  },
  {
    "key": "background-03",
    "label": "K-12 Background 3",
    "src": "/media/session-backgrounds/background-03.webp",
    "category": "K12"
  },
  {
    "key": "background-04",
    "label": "K-12 Background 4",
    "src": "/media/session-backgrounds/background-04.webp",
    "category": "K12"
  },
  {
    "key": "background-05",
    "label": "K-12 Background 5",
    "src": "/media/session-backgrounds/background-05.webp",
    "category": "K12"
  },
  {
    "key": "background-06",
    "label": "K-12 Background 6",
    "src": "/media/session-backgrounds/background-06.webp",
    "category": "K12"
  },
  {
    "key": "background-07",
    "label": "K-12 Background 7",
    "src": "/media/session-backgrounds/background-07.webp",
    "category": "K12"
  },
  {
    "key": "background-08",
    "label": "K-12 Background 8",
    "src": "/media/session-backgrounds/background-08.webp",
    "category": "K12"
  },
  {
    "key": "background-09",
    "label": "K-12 Background 9",
    "src": "/media/session-backgrounds/background-09.webp",
    "category": "K12"
  },
  {
    "key": "background-10",
    "label": "K-12 Background 10",
    "src": "/media/session-backgrounds/background-10.webp",
    "category": "K12"
  },
  {
    "key": "background-11",
    "label": "K-12 Background 11",
    "src": "/media/session-backgrounds/background-11.webp",
    "category": "K12"
  },
  {
    "key": "background-12",
    "label": "K-12 Background 12",
    "src": "/media/session-backgrounds/background-12.webp",
    "category": "K12"
  },
  {
    "key": "background-13",
    "label": "K-12 Background 13",
    "src": "/media/session-backgrounds/background-13.webp",
    "category": "K12"
  },
  {
    "key": "background-14",
    "label": "K-12 Background 14",
    "src": "/media/session-backgrounds/background-14.webp",
    "category": "K12"
  },
  {
    "key": "background-15",
    "label": "K-12 Background 15",
    "src": "/media/session-backgrounds/background-15.webp",
    "category": "K12"
  },
  {
    "key": "background-16",
    "label": "K-12 Background 16",
    "src": "/media/session-backgrounds/background-16.webp",
    "category": "K12"
  },
  {
    "key": "background-17",
    "label": "College Background 1",
    "src": "/media/session-backgrounds/background-17.webp",
    "category": "COLLEGE"
  },
  {
    "key": "background-18",
    "label": "College Background 2",
    "src": "/media/session-backgrounds/background-18.webp",
    "category": "COLLEGE"
  },
  {
    "key": "background-19",
    "label": "College Background 3",
    "src": "/media/session-backgrounds/background-19.webp",
    "category": "COLLEGE"
  },
  {
    "key": "background-20",
    "label": "College Background 4",
    "src": "/media/session-backgrounds/background-20.webp",
    "category": "COLLEGE"
  },
  {
    "key": "background-21",
    "label": "College Background 5",
    "src": "/media/session-backgrounds/background-21.webp",
    "category": "COLLEGE"
  },
  {
    "key": "background-22",
    "label": "College Background 6",
    "src": "/media/session-backgrounds/background-22.webp",
    "category": "COLLEGE"
  },
  {
    "key": "background-23",
    "label": "College Background 7",
    "src": "/media/session-backgrounds/background-23.webp",
    "category": "COLLEGE"
  },
  {
    "key": "background-24",
    "label": "College Background 8",
    "src": "/media/session-backgrounds/background-24.webp",
    "category": "COLLEGE"
  },
  {
    "key": "background-25",
    "label": "College Background 9",
    "src": "/media/session-backgrounds/background-25.webp",
    "category": "COLLEGE"
  },
  {
    "key": "background-26",
    "label": "College Background 10",
    "src": "/media/session-backgrounds/background-26.webp",
    "category": "COLLEGE"
  },
  {
    "key": "background-27",
    "label": "College Background 11",
    "src": "/media/session-backgrounds/background-27.webp",
    "category": "COLLEGE"
  },
  {
    "key": "background-28",
    "label": "College Background 12",
    "src": "/media/session-backgrounds/background-28.webp",
    "category": "COLLEGE"
  },
  {
    "key": "background-29",
    "label": "College Background 13",
    "src": "/media/session-backgrounds/background-29.webp",
    "category": "COLLEGE"
  },
  {
    "key": "background-30",
    "label": "College Background 14",
    "src": "/media/session-backgrounds/background-30.webp",
    "category": "COLLEGE"
  },
  {
    "key": "background-31",
    "label": "College Background 15",
    "src": "/media/session-backgrounds/background-31.webp",
    "category": "COLLEGE"
  },
  {
    "key": "background-32",
    "label": "College Background 16",
    "src": "/media/session-backgrounds/background-32.webp",
    "category": "COLLEGE"
  }
];

export const DEFAULT_SESSION_BACKGROUND = SESSION_BACKGROUNDS[0]?.key || "";
export function getSessionBackground(key) { return SESSION_BACKGROUNDS.find((item) => item.key === key) || SESSION_BACKGROUNDS[0] || null; }

// Splits the shared background pool by the quiz's category (K-12 vs College)
// so the picker only shows options that fit the audience. Falls back to the
// full pool when the quiz has no category set (e.g. older quizzes, guest
// mode) so nothing ever comes up empty.
export function getSessionBackgroundsForCategory(category) {
  const normalized = String(category || "").trim().toUpperCase();
  if (normalized !== "K12" && normalized !== "COLLEGE") return SESSION_BACKGROUNDS;
  const filtered = SESSION_BACKGROUNDS.filter((item) => item.category === normalized);
  return filtered.length ? filtered : SESSION_BACKGROUNDS;
}
