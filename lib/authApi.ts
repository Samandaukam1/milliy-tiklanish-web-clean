import Constants from "expo-constants";
import { Platform } from "react-native";

const DEFAULT_NATIVE_API_BASE = "http://172.20.10.3:8081";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function joinPath(base: string, path: string): string {
  if (!base) {
    return path;
  }

  return `${trimTrailingSlash(base)}${path.startsWith("/") ? path : `/${path}`}`;
}

function getExpoHostname(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    Constants.manifest?.debuggerHost ||
    "";
  const hostname = hostUri.split(":")[0]?.trim();

  return hostname || null;
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

function normalizeConfiguredBase(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (Platform.OS !== "web" && isLocalhost(parsed.hostname)) {
      console.warn("[auth-api] Ignoring localhost API base on native:", trimmed);
      return null;
    }

    return trimTrailingSlash(parsed.toString());
  } catch {
    return trimTrailingSlash(trimmed);
  }
}

function getCurrentMetroBase(): string | null {
  const hostname = getExpoHostname();
  if (!hostname) {
    return null;
  }

  return `http://${hostname}:8081`;
}

function getCandidateUrls(path: string): string[] {
  const primaryBase = getSharedApiBase();
  return [joinPath(primaryBase, path)];
}

function isHtmlResponse(contentType: string | null, text: string): boolean {
  const normalizedText = text.trimStart().toLowerCase();
  const normalizedType = (contentType ?? "").toLowerCase();

  return (
    normalizedType.includes("text/html") ||
    normalizedText.startsWith("<!doctype") ||
    normalizedText.startsWith("<html") ||
    normalizedText.startsWith("<?xml")
  );
}

function buildApiErrorMessage(status: number, text: string): string {
  if (status === 404) {
    return "Ushbu xizmat vaqtincha mavjud emas.";
  }
  if (status === 503 || status === 502) {
    return "Server vaqtincha mavjud emas. Keyinroq urinib ko'ring.";
  }
  if (status >= 500) {
    return "Server xatoligi yuz berdi. Keyinroq urinib ko'ring.";
  }
  // Generic fallback for unexpected non-JSON
  const snippet = text.slice(0, 120).replace(/\s+/g, " ").trim();
  return `Server noto'g'ri javob qaytardi${snippet ? ": " + snippet : ""}`;
}

export function getSharedApiBase(): string {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.location.origin) {
      return trimTrailingSlash(window.location.origin);
    }

    return "";
  }

  const configuredBase = normalizeConfiguredBase(process.env.EXPO_PUBLIC_API_URL);
  if (configuredBase) {
    return configuredBase;
  }

  return getCurrentMetroBase() ?? DEFAULT_NATIVE_API_BASE;
}

export async function fetchAuthJson<T>(
  path: string,
  init: RequestInit
): Promise<{ response: Response; body: T; text: string; url: string }> {
  const urls = getCandidateUrls(path);
  let lastError: Error = new Error("Auth request failed");

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    console.log("[auth-api] Request URL:", url);

    try {
      const response = await fetch(url, init);
      const text = await response.text();
      console.log("[auth-api] Response text:", text);

      if (isHtmlResponse(response.headers.get("content-type"), text)) {
        if (index < urls.length - 1) {
          console.warn("[auth-api] HTML response received, retrying with fallback URL:", url);
          continue;
        }

        const msg = buildApiErrorMessage(response.status, text);
        console.error("[auth-api] Non-JSON response", { status: response.status, url, snippet: text.slice(0, 120) });
        throw new Error(msg);
      }

      // Status codes that don't carry a JSON body (edge/CDN errors)
      if (!text.trim() && response.status >= 400) {
        const msg = buildApiErrorMessage(response.status, "");
        throw new Error(msg);
      }

      try {
        const body = JSON.parse(text) as T;
        return { response, body, text, url };
      } catch {
        const msg = buildApiErrorMessage(response.status, text);
        throw new Error(msg);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Auth request failed");
      console.error("[auth-api] Request failed:", url, lastError);

      if (index < urls.length - 1) {
        continue;
      }
    }
  }

  throw lastError;
}