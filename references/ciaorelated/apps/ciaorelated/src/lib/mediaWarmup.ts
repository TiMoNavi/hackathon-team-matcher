// src/lib/mediaWarmup.ts
import { InteractionManager, AppState } from "react-native";
import * as MediaLibrary from "expo-media-library";

let started = false;
let appState: string = AppState.currentState;

AppState.addEventListener("change", (nextState) => {
  if (appState === "active" && nextState.match(/inactive|background/)) {
    // ✅ iOS Cache wird evtl. verworfen → Warmup darf erneut laufen
    started = false;
  }
  appState = nextState;
});

export function warmupMediaLibrary() {
  if (started) return;
  started = true;

  InteractionManager.runAfterInteractions(async () => {
    try {
      const perm = await MediaLibrary.getPermissionsAsync();
      if (!perm.granted) return;

      await MediaLibrary.getAssetsAsync({
        first: 120,
        sortBy: [MediaLibrary.SortBy.creationTime],
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      });
    } catch {}
  });
}
