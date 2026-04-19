/* FILE GUIDE:
 * client/src/utils/soundmanager.js
 * Purpose: Central audio manager for lobby music, in-game music, and short sound effects.
 */

import correctSound from "../assets/sounds/Correct.mp3";
import wrongSound from "../assets/sounds/Wrong.mp3";
import lobbyMusic from "../assets/sounds/Lobby.mp3";
import playingMusic from "../assets/sounds/Playing.mp3";

const MUTE_KEY = "thinkwave_student_muted";

class SoundManager {
  constructor() {
    this.unlocked = false;
    this.currentBgm = "";
    this.muted = false;

    this.sounds = {
      lobby: new Audio(lobbyMusic),
      playing: new Audio(playingMusic),
      correct: new Audio(correctSound),
      wrong: new Audio(wrongSound),
    };

    this.sounds.lobby.loop = true;
    this.sounds.playing.loop = true;

    this.sounds.lobby.volume = 0.35;
    this.sounds.playing.volume = 0.32;
    this.sounds.correct.volume = 0.95;
    this.sounds.wrong.volume = 0.95;

    Object.values(this.sounds).forEach((audio) => {
      audio.preload = "auto";
    });

    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      this.muted = false;
    }

    this.applyMuteState();
  }

  applyMuteState() {
    Object.values(this.sounds).forEach((audio) => {
      audio.muted = this.muted;
    });
  }

  isMuted() {
    return this.muted;
  }

  setMuted(nextMuted) {
    this.muted = !!nextMuted;
    this.applyMuteState();
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    } catch {}
    if (this.muted) {
      this.stopBGM();
    }
    return this.muted;
  }

  toggleMute() {
    return this.setMuted(!this.muted);
  }

  async unlock() {
    if (this.unlocked) return true;

    try {
      for (const audio of Object.values(this.sounds)) {
        const prevMuted = audio.muted;
        audio.muted = true;
        audio.currentTime = 0;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audio.muted = prevMuted || this.muted;
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
    if (!audio) return 0;
    if (this.muted) return 0;

    try {
      await this.unlock();
    } catch {}

    return await new Promise((resolve) => {
      let settled = false;
      let fallback = null;

      const durationMs = Number.isFinite(audio.duration) && audio.duration > 0
        ? Math.round(audio.duration * 1000)
        : 900;

      const cleanup = () => {
        if (fallback) clearTimeout(fallback);
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
      };

      const finish = (ms = durationMs) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(ms);
      };

      const onEnded = () => finish(durationMs);
      const onError = () => finish(0);

      try {
        audio.pause();
        audio.currentTime = 0;
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("error", onError);
        audio.play().then(() => {
          fallback = setTimeout(() => finish(durationMs), durationMs + 120);
        }).catch((err) => {
          console.warn(`Failed to play ${sound}:`, err);
          finish(0);
        });
      } catch (err) {
        console.warn(`Failed to play ${sound}:`, err);
        finish(0);
      }
    });
  }

  pauseBackgroundTracks() {
    [this.sounds.lobby, this.sounds.playing].forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  }

  async startBGM(mode = "playing") {
    const nextKey = mode === "lobby" ? "lobby" : "playing";
    const bg = this.sounds[nextKey];
    if (!bg) return;

    if (this.currentBgm !== nextKey) {
      this.pauseBackgroundTracks();
      this.currentBgm = nextKey;
    }

    if (this.muted) return;

    try {
      await this.unlock();
      if (bg.paused) {
        await bg.play();
      }
    } catch (err) {
      console.warn(`Failed to start ${nextKey} background music:`, err);
    }
  }

  stopBGM() {
    this.pauseBackgroundTracks();
    this.currentBgm = "";
  }
}

export default new SoundManager();
