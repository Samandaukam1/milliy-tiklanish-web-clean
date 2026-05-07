import createContextHook from "@nkzw/create-context-hook";
import { Audio, AVPlaybackStatus } from "expo-av";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppAudioItem } from "@/lib/types";

// Re-export as AudioItem for backward compat with any remaining usages
export type AudioItem = AppAudioItem;

export type Speed = 0.8 | 1 | 1.25 | 1.5;

export const [PlayerProvider, usePlayer] = createContextHook(() => {
  const [current, setCurrent] = useState<AppAudioItem | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [position, setPosition] = useState<number>(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [loadingAudio, setLoadingAudio] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const currentIdRef = useRef<string | null>(null);

  // Configure audio session once on mount
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
  }, []);

  // Unload sound when provider unmounts
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const _unload = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    currentIdRef.current = null;
  }, []);

  const play = useCallback(
    async (item: AppAudioItem) => {
      // Guard: no audio URL → bail immediately, never fall back to a fake source
      if (!item.audio_url || item.audio_url.trim() === "") {
        console.warn(
          "[PlayerProvider] SKIP — no audio_url for item id=%s title=%s",
          item.id,
          item.title
        );
        return;
      }

      console.log(
        "[PlayerProvider] PLAY id=%s audio_url=%s",
        item.id,
        item.audio_url
      );

      // Unload previous sound if it's a different track
      if (currentIdRef.current !== item.id) {
        await _unload();
      }

      setCurrent(item);
      currentIdRef.current = item.id;
      setPosition(0);
      setIsPlaying(false);
      setAudioError(null);
      setLoadingAudio(true);

      try {
        const { sound, status } = await Audio.Sound.createAsync(
          { uri: item.audio_url },
          { shouldPlay: true, rate: speed, progressUpdateIntervalMillis: 500 },
          (s: AVPlaybackStatus) => {
            if (!s.isLoaded) {
              // s.error is set when the sound fails to load
              if ((s as any).error) {
                console.error(
                  "[PlayerProvider] playback status error:",
                  (s as any).error,
                  "audio_url=",
                  item.audio_url
                );
                setAudioError((s as any).error);
                setIsPlaying(false);
                setLoadingAudio(false);
              }
              return;
            }
            setLoadingAudio(false);
            setPosition(s.positionMillis / 1000);
            setIsPlaying(s.isPlaying);
            // Sync real duration so progress bars are accurate
            if (s.durationMillis && s.durationMillis > 0) {
              setCurrent((prev) => {
                if (!prev || prev.id !== item.id) return prev;
                const realSec = s.durationMillis! / 1000;
                if (Math.abs(prev.durationSec - realSec) > 2) {
                  if (__DEV__)
                    console.log(
                      "[PlayerProvider] updated durationSec from",
                      prev.durationSec,
                      "to",
                      realSec
                    );
                  return { ...prev, durationSec: realSec };
                }
                return prev;
              });
            }
            if (s.didJustFinish) {
              console.log("[PlayerProvider] finished playing", item.id);
              setIsPlaying(false);
              setPosition(0);
            }
          }
        );

        soundRef.current = sound;
        if (status.isLoaded) {
          setLoadingAudio(false);
          setIsPlaying(status.isPlaying);
          console.log(
            "[PlayerProvider] loaded OK isPlaying=%s duration=%sms",
            status.isPlaying,
            status.durationMillis ?? "unknown"
          );
        } else if ((status as any).error) {
          console.error(
            "[PlayerProvider] failed to load:",
            (status as any).error,
            "url=",
            item.audio_url
          );
          setAudioError((status as any).error);
          setLoadingAudio(false);
        }
      } catch (e) {
        console.error(
          "[PlayerProvider] createAsync threw:",
          e,
          "url=",
          item.audio_url
        );
        setAudioError(String(e));
        setIsPlaying(false);
        setLoadingAudio(false);
      }
    },
    [speed, _unload]
  );

  const toggle = useCallback(async () => {
    if (!soundRef.current) return;
    const status = await soundRef.current.getStatusAsync().catch(() => null);
    if (!status?.isLoaded) return;
    if (status.isPlaying) {
      await soundRef.current.pauseAsync().catch(() => {});
    } else {
      await soundRef.current.playAsync().catch(() => {});
    }
  }, []);

  const seek = useCallback(async (sec: number) => {
    setPosition(Math.max(0, sec));
    await soundRef.current
      ?.setPositionAsync(Math.max(0, sec) * 1000)
      .catch(() => {});
  }, []);

  const skip = useCallback(
    async (delta: number) => {
      if (!current) return;
      const newPos = Math.max(0, Math.min(current.durationSec, position + delta));
      setPosition(newPos);
      await soundRef.current?.setPositionAsync(newPos * 1000).catch(() => {});
    },
    [current, position]
  );

  const cycleSpeed = useCallback(async () => {
    const order: Speed[] = [1, 1.25, 1.5, 0.8];
    const newSpeed = order[(order.indexOf(speed) + 1) % order.length];
    setSpeed(newSpeed);
    await soundRef.current?.setRateAsync(newSpeed, true).catch(() => {});
  }, [speed]);

  // Intercept setCurrent(null) from MiniPlayer close button — stop + unload
  const handleSetCurrent = useCallback(
    async (item: AppAudioItem | null) => {
      if (!item) {
        await _unload();
        setIsPlaying(false);
        setPosition(0);
      }
      setCurrent(item);
    },
    [_unload]
  );

  return useMemo(
    () => ({
      current,
      isPlaying,
      position,
      speed,
      loadingAudio,
      audioError,
      play,
      toggle,
      seek,
      skip,
      cycleSpeed,
      setCurrent: handleSetCurrent,
    }),
    [
      current,
      isPlaying,
      position,
      speed,
      loadingAudio,
      audioError,
      play,
      toggle,
      seek,
      skip,
      cycleSpeed,
      handleSetCurrent,
    ]
  );
});

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}
