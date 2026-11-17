import { useRouter } from "expo-router";

/**
 * Returns a function that goes back one screen. When there is no earlier screen, which happens
 * when the app opens straight onto a deep screen, it goes to `fallback` instead.
 */
export function useGoBack(fallback: "/" | "/manage"): () => void {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  };
}
