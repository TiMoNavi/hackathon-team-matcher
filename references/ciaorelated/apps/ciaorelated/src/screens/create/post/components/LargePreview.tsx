// =============================================
// File: apps/ciaorelated/src/screens/create/post/components/LargePreview.tsx
// =============================================
import React from "react";
import {
  View,
  StyleSheet,
  type ViewStyle,
  type ImageStyle,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Video, ResizeMode } from "expo-av";
import ViewShot from "react-native-view-shot";
import { ColorMatrix } from "react-native-color-matrix-image-filters";

import { IDENTITY, concatColorMatrices, type Matrix20 } from "../utils/matrix";
import { AlignableSquare, type AlignState } from "./AlignableSquare";

/* ---------- Types ---------- */
type AlignProps = {
  size: number;
  mediaW?: number;
  mediaH?: number;
  value: AlignState;
  onChange: (next: AlignState) => void;
  panRequiresZoom?: boolean;
};

type Props = {
  sourceUri: string | null;
  isVideo: boolean;

  /* Video */
  play?: boolean;
  loop?: boolean;
  muted?: boolean;
  videoRef?: React.RefObject<Video | null>;
  autoPlay?: boolean;

  /* Image */
  viewShotRef?: React.RefObject<ViewShot | null>;
  filterMatrix?: Matrix20;
  adjustMatrix?: Matrix20;
  vignette?: boolean;
  instant?: boolean;

  /* Layout overrides */
  wrapStyle?: ViewStyle;
  imageStyle?: ImageStyle;   // ✅ getrennt
  videoStyle?: ViewStyle;    // ✅ getrennt
  contentFit?: "cover" | "contain";
  /* Alignment */
  align?: AlignProps;
};

/* ---------- Component ---------- */
export function LargePreview({
  sourceUri,
  isVideo,
  contentFit,
  play,
  loop,
  muted,
  videoRef,
  autoPlay,

  viewShotRef,
  filterMatrix,
  adjustMatrix,
  vignette,
  instant = false,

  wrapStyle,
  imageStyle,
  videoStyle,

  align,
}: Props) {
  if (!sourceUri) {
    return <View style={[s.wrap, wrapStyle, { backgroundColor: "#111" }]} />;
  }

  const base = filterMatrix ?? IDENTITY;
  const finalMatrix = adjustMatrix
    ? concatColorMatrices(adjustMatrix, base)
    : base;

  /* ---------- IMAGE ---------- */
  const imageNode = (
    <ColorMatrix matrix={finalMatrix}>
      <ExpoImage
        source={{ uri: sourceUri }}   // ✅ immer string
        style={[s.media, imageStyle]}
        contentFit={contentFit ?? "cover"}
        transition={instant ? 0 : 120}
        cachePolicy="disk"
      />
      {vignette && <View style={StyleSheet.absoluteFill} pointerEvents="none" />}
    </ColorMatrix>
  );

  /* ---------- VIDEO ---------- */
  const videoNode = (
    <Video
      ref={videoRef}
      source={{ uri: sourceUri }}
      style={[s.media, videoStyle]}
      resizeMode={(contentFit ?? "cover") === "contain" ? ResizeMode.CONTAIN : ResizeMode.COVER}
      shouldPlay={play ?? !!autoPlay}
      isLooping={!!loop}
      isMuted={!!muted}
      useNativeControls={false}
    />
  );

  /* ---------- CONTENT ---------- */
  const content = isVideo ? (
    videoNode
  ) : viewShotRef ? (
    <ViewShot
      ref={viewShotRef}
      style={{ flex: 1 }}
      options={{ format: "jpg", quality: 0.95, result: "tmpfile" }}
    >
      {imageNode}
    </ViewShot>
  ) : (
    imageNode
  );

  /* ---------- FINAL ---------- */
  return (
    <View style={[s.wrap, wrapStyle]}>
      {align ? (
        <AlignableSquare
          size={align.size}
          mediaW={align.mediaW}
          mediaH={align.mediaH}
          value={align.value}
          onChange={align.onChange}
          panRequiresZoom={align.panRequiresZoom}
          showGrid={false}
        >
          {content}
        </AlignableSquare>
      ) : (
        content
      )}
    </View>
  );
}

/* ---------- Styles ---------- */
const s = StyleSheet.create({
  wrap: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
  },
  media: {
    width: "100%",
    height: "100%",
    backgroundColor: "#111",
  },
});
