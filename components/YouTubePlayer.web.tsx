/**
 * YouTubePlayer — WEB
 * Plain <iframe> embed — no react-native-webview on web.
 * Platform file resolution: Metro/bundler picks this file on web,
 * and YouTubePlayer.tsx on iOS/Android.
 */
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";

interface Props {
  videoId: string;
  style?: object;
}

export function YouTubePlayer({ videoId, style }: Props) {
  const [iframeError, setIframeError] = useState(false);

  if (!videoId) {
    return (
      <View style={[styles.center, style]}>
        <Text style={styles.errorText}>Video ID topilmadi</Text>
      </View>
    );
  }

  const params = [
    "autoplay=1",
    "rel=0",
    "modestbranding=1",
    "controls=1",
    "playsinline=1",
    "iv_load_policy=3",
    "cc_load_policy=0",
  ].join("&");

  const src = `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;

  if (iframeError) {
    return (
      <View style={[styles.center, style]}>
        <Text style={styles.errorText}>Video yuklab bo'lmadi</Text>
        <Pressable
          style={styles.fallbackBtn}
          onPress={() =>
            window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank")
          }
        >
          <Text style={styles.fallbackBtnText}>YouTube'da ochish ↗</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {/* @ts-ignore — iframe is valid HTML in a web context */}
      <iframe
        src={src}
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        onError={() => setIframeError(true)}
        title="YouTube video"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  errorText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 16,
    fontFamily: Fonts.serif,
    fontWeight: "700",
    textAlign: "center",
  },
  fallbackBtn: {
    marginTop: 8,
    backgroundColor: "#FF0000",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  fallbackBtnText: {
    color: Palette.white,
    fontWeight: "700",
    fontSize: 14,
  },
});
