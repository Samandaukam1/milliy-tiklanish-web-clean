/**
 * YouTubePlayer — NATIVE (iOS / Android)
 *
 * Loads the YouTube embed URL directly as the WebView source (source.uri).
 * This avoids the `file://` origin mismatch that causes Error 153 when the
 * IFrame API is loaded inside custom inline HTML with origin= set.
 *
 * Error detection strategy:
 *  1. injectedJavaScript hooks into the IFrame API's onError event and
 *     forwards the error code to React Native via postMessage.
 *  2. onHttpError / onError handle network / HTTP failures.
 */
import React, { useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";

interface Props {
  videoId: string | null;
  style?: object;
}

/**
 * Build the embed URL.
 * NOTE: NO "origin" parameter — setting origin= when loading from a mobile
 * WebView causes YouTube to mismatch the actual request origin and reject the
 * embed with error 153 (a variant of 101/150 "embedding disabled").
 */
function buildEmbedUri(videoId: string): string {
  const params = [
    "autoplay=1",
    "controls=1",
    "playsinline=1",
    "rel=0",
    "modestbranding=1",
    "iv_load_policy=3",
    "cc_load_policy=0",
    "enablejsapi=1",   // enables IFrame API so injected JS can listen for errors
  ].join("&");
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
}

/**
 * JavaScript injected AFTER the embed page loads.
 * Hooks into the YouTube IFrame API player object that the embed page itself
 * creates, then forwards onError / onReady events back via postMessage.
 */
const INJECTED_JS = `
(function() {
  var MAX_WAIT_MS = 12000;
  var start = Date.now();

  function tryHook() {
    // The embed page creates window.player (or accessible via YT.get)
    var p = (window.YT && window.YT.get && window.YT.get(0))
          || window.player
          || (document.querySelector('iframe') && null);  // last resort: no hook

    if (p && typeof p.addEventListener === 'function') {
      p.addEventListener('onError', function(e) {
        window.ReactNativeWebView &&
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'ytError', code: e.data })
        );
      });
      p.addEventListener('onReady', function() {
        window.ReactNativeWebView &&
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'ytReady' })
        );
      });
      return;
    }

    // Also try the YT.PlayerState global hook as backup
    if (window.onYTReady) return;
    if (Date.now() - start < MAX_WAIT_MS) {
      setTimeout(tryHook, 400);
    }
  }

  // Wait for the embed page's own IFrame API to initialise
  var _orig = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = function() {
    if (_orig) _orig();
    setTimeout(tryHook, 800);
  };

  // Also poll in case the API was already ready before injection
  setTimeout(tryHook, 1500);
  true;  // required return value for injectedJavaScript
})();
`;

// ─────────────────────────────────────────────────────────────────────────────

export function YouTubePlayer({ videoId, style }: Props) {
  const [embedError, setEmbedError] = useState<number | string | null>(null);
  const webviewRef = useRef<WebView>(null);

  if (!videoId) {
    return (
      <View style={[styles.center, style]}>
        <Text style={styles.errorText}>Video ID topilmadi</Text>
      </View>
    );
  }

  if (embedError !== null) {
    const isEmbedBlocked =
      embedError === 101 ||
      embedError === 150 ||
      embedError === 153 ||
      embedError === "blocked";

    return (
      <View style={[styles.center, style]}>
        <Text style={styles.errorText}>
          {isEmbedBlocked
            ? "Videoni YouTube saytida tomosha qiling"
            : "Video yuklab bo'lmadi"}
        </Text>
        {__DEV__ && (
          <Text style={styles.errorCode}>Xato {String(embedError)}</Text>
        )}
        <Pressable
          style={styles.fallbackBtn}
          onPress={() =>
            Linking.openURL(`https://www.youtube.com/watch?v=${videoId}`)
          }
        >
          <Text style={styles.fallbackBtnText}>YouTube'da ochish ↗</Text>
        </Pressable>
      </View>
    );
  }

  if (__DEV__) {
    console.log(
      `[YouTubePlayer] loading videoId="${videoId}" uri=${buildEmbedUri(videoId)}`
    );
  }

  return (
    <WebView
      ref={webviewRef}
      source={{ uri: buildEmbedUri(videoId) }}
      style={[styles.webview, style as any]}
      // ── Playback ────────────────────────────────────────────────────────
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      allowsFullscreenVideo
      // ── JS / DOM ────────────────────────────────────────────────────────
      javaScriptEnabled
      domStorageEnabled
      originWhitelist={["*"]}
      scrollEnabled={false}
      injectedJavaScript={INJECTED_JS}
      // ── Error detection ─────────────────────────────────────────────────
      onMessage={(event) => {
        try {
          const msg = JSON.parse(event.nativeEvent.data);
          if (msg.type === "ytReady") {
            if (__DEV__)
              console.log("[YouTubePlayer] player ready, videoId=", videoId);
          } else if (msg.type === "ytError") {
            if (__DEV__)
              console.warn(
                "[YouTubePlayer] ytError code=",
                msg.code,
                "videoId=",
                videoId
              );
            setEmbedError(msg.code);
          }
        } catch (_) {}
      }}
      onHttpError={(e) => {
        const status = e.nativeEvent.statusCode;
        if (__DEV__)
          console.warn(
            "[YouTubePlayer] HTTP error",
            status,
            "videoId=",
            videoId
          );
        if (status >= 400) setEmbedError("http" + status);
      }}
      onError={(e) => {
        if (__DEV__)
          console.warn(
            "[YouTubePlayer] WebView error",
            e.nativeEvent.description,
            "videoId=",
            videoId
          );
        setEmbedError("network");
      }}
    />
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: "#000" },
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
  errorCode: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
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
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
