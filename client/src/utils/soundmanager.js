/* FILE GUIDE:
 * client/src/utils/soundmanager.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import correctSound from "../assets/sounds/Correct.mp3";
import wrongSound from "../assets/sounds/Wrong.mp3";
import bgMusic from "../assets/sounds/Playing.mp3";

class SoundManager {
  constructor() {
    this.unlocked = false;
    this.sounds = {
      bg: new Audio(bgMusic),
      correct: new Audio(correctSound),
      wrong: new Audio(wrongSound),
    };

    this.sounds.bg.loop = true;
    this.sounds.bg.volume = 0.3;

    Object.values(this.sounds).forEach((audio) => {
      audio.preload = "auto";
    });
  }

  async unlock() {
    if (this.unlocked) return true;

    try {
      for (const audio of Object.values(this.sounds)) {
        audio.muted = true;
        audio.currentTime = 0;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      }

      this.unlocked = true;
      return true;
    } catch (err) {
      console.warn("Audio unlock failed:", err);
      return false;
    }
  }

  async play(sound) {
    const audio = this.sounds[sound];
    if (!audio) return;

    try {
      audio.currentTime = 0;
      await audio.play();
    } catch (err) {
      console.warn(`Failed to play ${sound}:`, err);
    }
  }

  async startBGM() {
    try {
      const bg = this.sounds.bg;
      if (bg.paused) {
        await bg.play();
      }
    } catch (err) {
      console.warn("Failed to start background music:", err);
    }
  }

  stopBGM() {
    const bg = this.sounds.bg;
    bg.pause();
    bg.currentTime = 0;
  }
}

export default new SoundManager();