export const SESSION_BACKGROUNDS = [
  {
    "key": "background-01",
    "label": "Black Grey Simple Illustration Chalkboard",
    "src": "/media/session-backgrounds/background-01.png"
  },
  {
    "key": "background-02",
    "label": "Blue Beige School Cute Blank Note A4",
    "src": "/media/session-backgrounds/background-02.png"
  },
  {
    "key": "background-03",
    "label": "Blue Green Colorful Daycare Center",
    "src": "/media/session-backgrounds/background-03.png"
  },
  {
    "key": "background-04",
    "label": "Blue Green Colorful Daycare Center",
    "src": "/media/session-backgrounds/background-04.png"
  },
  {
    "key": "background-05",
    "label": "Blue and Green Illustrated Hot Weather",
    "src": "/media/session-backgrounds/background-05.png"
  },
  {
    "key": "background-06",
    "label": "Blue and Yellow Handwritten Classroom Rules Blank Education",
    "src": "/media/session-backgrounds/background-06.png"
  },
  {
    "key": "background-07",
    "label": "Blue and Yellow Handwritten Classroom Rules Blank Education",
    "src": "/media/session-backgrounds/background-07.png"
  },
  {
    "key": "background-08",
    "label": "Blue and Yellow Handwritten Classroom Rules Blank Education",
    "src": "/media/session-backgrounds/background-08.png"
  },
  {
    "key": "background-09",
    "label": "Blue and Yellow Handwritten Classroom Rules Blank Education",
    "src": "/media/session-backgrounds/background-09.png"
  },
  {
    "key": "background-10",
    "label": "Blue and Yellow Handwritten Classroom Rules Blank Education",
    "src": "/media/session-backgrounds/background-10.png"
  },
  {
    "key": "background-11",
    "label": "Blue and Yellow Handwritten Classroom Rules Blank Education",
    "src": "/media/session-backgrounds/background-11.png"
  },
  {
    "key": "background-12",
    "label": "Blue and Yellow Handwritten Classroom Rules Blank Education",
    "src": "/media/session-backgrounds/background-12.png"
  },
  {
    "key": "background-13",
    "label": "Blue and Yellow Handwritten Classroom Rules Blank Education",
    "src": "/media/session-backgrounds/background-13.png"
  },
  {
    "key": "background-14",
    "label": "Blue and Yellow Handwritten Classroom Rules Blank Education",
    "src": "/media/session-backgrounds/background-14.png"
  },
  {
    "key": "background-15",
    "label": "Colorful Illustrated Creative Project",
    "src": "/media/session-backgrounds/background-15.png"
  },
  {
    "key": "background-16",
    "label": "Cute Colorful Welcome Back to School Intro",
    "src": "/media/session-backgrounds/background-16.png"
  },
  {
    "key": "background-17",
    "label": "Green and Blue Illustrated Emotional Development in Childhood",
    "src": "/media/session-backgrounds/background-17.png"
  },
  {
    "key": "background-18",
    "label": "Multicolor Playful Emotions",
    "src": "/media/session-backgrounds/background-18.png"
  },
  {
    "key": "background-19",
    "label": "Pastel Aesthetic Group Project",
    "src": "/media/session-backgrounds/background-19.png"
  },
  {
    "key": "background-20",
    "label": "Pink and Yellow Illustrative Class Syllabus",
    "src": "/media/session-backgrounds/background-20.png"
  },
  {
    "key": "background-21",
    "label": "Welcome Back to School in Blue, Peach and Gray Hand Drawn Illustrativ",
    "src": "/media/session-backgrounds/background-21.png"
  },
  {
    "key": "background-22",
    "label": "White and Colorful Cute Blank Page Border",
    "src": "/media/session-backgrounds/background-22.png"
  }
];

export const DEFAULT_SESSION_BACKGROUND = SESSION_BACKGROUNDS[0]?.key || "";
export function getSessionBackground(key) { return SESSION_BACKGROUNDS.find((item) => item.key === key) || SESSION_BACKGROUNDS[0] || null; }
