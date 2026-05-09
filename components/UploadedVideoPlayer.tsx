import { Image } from "expo-image";
import { ResizeMode, Video } from "expo-av";
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Palette } from "@/constants/colors";

type Props = {
  uri: string;
  posterUri?: string | null;
  shouldPlay?: boolean;
  isLooping?: boolean;
  isMuted?: boolean;
  playbackRate?: number;
  useNativeControls?: boolean;
  resizeMode?: ResizeMode;
  style?: StyleProp<ViewStyle>;
  webUseContainedMedia?: boolean;
  onReady?: () => void;
};

export type UploadedVideoPlayerHandle = {
  pauseAsync: () => Promise<void>;
  playAsync: () => Promise<void>;
  unloadAsync: () => Promise<void>;
};

export const UploadedVideoPlayer = forwardRef<UploadedVideoPlayerHandle, Props>(function UploadedVideoPlayer({
  uri,
  posterUri,
  shouldPlay = false,
  isLooping = false,
  isMuted = false,
  playbackRate = 1,
  useNativeControls = false,
  resizeMode = ResizeMode.COVER,
  style,
  webUseContainedMedia = false,
  onReady,
}, ref) {
  const [isReady, setIsReady] = useState(false);
  const videoRef = useRef<Video>(null);
  const shouldUseWebContainedMedia = Platform.OS === "web" && webUseContainedMedia;
  const mediaStyle = shouldUseWebContainedMedia ? styles.webContainedMedia : StyleSheet.absoluteFillObject;
  const posterContentFit = shouldUseWebContainedMedia || resizeMode === ResizeMode.CONTAIN ? "contain" : "cover";

  useImperativeHandle(ref, () => ({
    pauseAsync: async () => {
      await videoRef.current?.pauseAsync();
    },
    playAsync: async () => {
      await videoRef.current?.playAsync();
    },
    unloadAsync: async () => {
      await videoRef.current?.unloadAsync();
    },
  }), []);

  useEffect(() => {
    setIsReady(false);
  }, [uri]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    void videoRef.current?.setRateAsync(playbackRate, true).catch(() => {});
  }, [isReady, playbackRate]);

  useEffect(() => {
    const player = videoRef.current;

    return () => {
      void player?.pauseAsync().catch(() => {});
      void player?.unloadAsync().catch(() => {});
    };
  }, []);

  return (
    <View style={[styles.root, shouldUseWebContainedMedia && styles.webContainedRoot, style]}>
      {!!posterUri && !isReady && (
        <Image
          source={{ uri: posterUri }}
          style={mediaStyle}
          contentFit={posterContentFit}
        />
      )}

      <Video
        ref={videoRef}
        source={{ uri }}
        style={mediaStyle}
        shouldPlay={shouldPlay}
        isLooping={isLooping}
        isMuted={isMuted}
        useNativeControls={useNativeControls}
        resizeMode={resizeMode}
        onReadyForDisplay={() => {
          setIsReady(true);
          onReady?.();
        }}
      />

      {!isReady && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={Palette.white} />
        </View>
      )}
    </View>
  );
});

UploadedVideoPlayer.displayName = "UploadedVideoPlayer";

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    backgroundColor: Palette.black,
  },
  webContainedRoot: {
    alignItems: "center",
    justifyContent: "center",
  },
  webContainedMedia: {
    width: "100%",
    height: "100%",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,17,17,0.16)",
  },
});