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

    // Long-run free: keep only URLs here. Audio elements are created lazily
    // on first user gesture (unlock/play/startBGM), so landing/builder pages
    // never download 3.3MB of MP3 or pay decode cost. preload="none" until used.
    this.tracks = {
      lobby: lobbyMusic,
      playing: playingMusic,
      correct: correctSound,
      wrong: wrongSound,
    };
    this.sounds = {};

    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      this.muted = false;
    }
  }

  ensure(track) {
    let audio = this.sounds[track];
    if (!audio) {
      audio = new Audio(this.tracks[track]);
      audio.preload = "none";
      if (track === "lobby" || track === "playing") {
        audio.loop = true;
        audio.volume = track === "lobby" ? 0.35 : 0.32;
      } else {
        audio.volume = 0.95;
      }
      audio.muted = this.muted;
      this.sounds[track] = audio;
    }
    return audio;
  }

  ensureAll() {
    return Object.keys(this.tracks).map((track) => this.ensure(track));
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
      // Start every media element during the same user-activation window. Awaiting
      // each one sequentially can exhaust the browser gesture before BGM is reached.
      const entries = this.ensureAll().map((audio) => {
        const prevMuted = audio.muted;
        audio.muted = true;
        audio.currentTime = 0;
        let playPromise;
        try { playPromise = audio.play(); } catch (error) { playPromise = Promise.reject(error); }
        return { audio, prevMuted, playPromise };
      });
      const results = await Promise.allSettled(entries.map((entry) => entry.playPromise));
      entries.forEach(({ audio, prevMuted }) => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = prevMuted || this.muted;
      });
      this.unlocked = results.some((result) => result.status === "fulfilled");
      return this.unlocked;
    } catch (err) {
      console.warn("Audio unlock failed:", err);
      return false;
    }
  }

  async play(sound) {
    if (!this.tracks[sound]) return 0;
    if (this.muted) return 0;
    const audio = this.ensure(sound);

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
    for (const track of ["lobby", "playing"]) {
      const audio = this.sounds[track];
      if (!audio) continue;
      audio.pause();
      audio.currentTime = 0;
    }
  }

  async startBGM(mode = "playing") {
    const nextKey = mode === "lobby" ? "lobby" : "playing";
    if (this.currentBgm !== nextKey) {
      this.pauseBackgroundTracks();
      this.currentBgm = nextKey;
    }

    if (this.muted) return;
    const bg = this.ensure(nextKey);

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
