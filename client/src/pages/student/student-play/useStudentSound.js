import { useEffect, useState } from "react";
import soundManager from "../../../utils/soundmanager";

export function useStudentSound({ currentSoundMode }) {
  const [isMuted, setIsMuted] = useState(() => soundManager.isMuted());

  function handleToggleMute() {
    const nextMuted = soundManager.toggleMute();
    setIsMuted(nextMuted);
    if (!nextMuted && currentSoundMode) {
      void soundManager.startBGM(currentSoundMode);
    }
  }

  useEffect(() => {
    function unlockAudio() {
      void soundManager.unlock().then(() => {
        if (currentSoundMode) {
          void soundManager.startBGM(currentSoundMode);
        }
      });
    }

    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [currentSoundMode]);

  useEffect(() => {
    if (!currentSoundMode) {
      soundManager.stopBGM();
      return;
    }
    void soundManager.startBGM(currentSoundMode);
  }, [currentSoundMode, isMuted]);

  return { isMuted, handleToggleMute };
}
