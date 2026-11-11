// apps/ciaorelated/src/screens/create/post/components/ZoomCropSquare.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, PanResponder } from "react-native";

export type Crop = { scale: number; tx: number; ty: number };
type Fit = "cover" | "contain";

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Pan+zoom wrapper for a square viewport.
 * Pan bounds are computed from the *rendered content size* based on `aspect` + `fit`,
 * so portrait media can be moved at scale=1 (fixes “nur zoomen, nicht verschieben”).
 */
export function ZoomCropSquare({
  crop,
  onCropChange,
  enabled = true,
  aspect,
  fit = "cover",
  onStart,
  onEnd,
  children,
}: {
  crop: Crop;
  onCropChange: (c: Crop) => void;
  enabled?: boolean;
  /** intrinsic width/height ratio (e.g. 9/16). If omitted, assumes 1. */
  aspect?: number;
  /** how the media is laid out inside the square before user scale/translate */
  fit?: Fit;
  onStart?: () => void;
  onEnd?: () => void;
  children: React.ReactNode;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });

  const start = useRef({ scale: 1, tx: 0, ty: 0 });
  useEffect(() => {
    start.current = crop;
  }, [crop.scale, crop.tx, crop.ty]);

  const base = useMemo(() => {
    const w = box.w || 1;
    const h = box.h || 1;
    const a = aspect && aspect > 0 ? aspect : 1;

    // model intrinsic size as (a, 1)
    const sCover = Math.max(w / a, h);
    const sContain = Math.min(w / a, h);
    const s = fit === "contain" ? sContain : sCover;

    return { contentW: a * s, contentH: 1 * s };
  }, [box.w, box.h, aspect, fit]);

  const bounds = useMemo(() => {
    const w = box.w || 1;
    const h = box.h || 1;

    const scaledW = base.contentW * (crop.scale || 1);
    const scaledH = base.contentH * (crop.scale || 1);

    const maxX = Math.max(0, (scaledW - w) / 2);
    const maxY = Math.max(0, (scaledH - h) / 2);

    return { maxX, maxY };
  }, [box.w, box.h, base.contentW, base.contentH, crop.scale]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!enabled,
        onMoveShouldSetPanResponder: () => !!enabled,
        onPanResponderGrant: () => {
          if (!enabled) return;
          onStart?.();
          start.current = crop;
        },
        onPanResponderMove: (_, g) => {
          if (!enabled) return;
          const next = {
            scale: start.current.scale,
            tx: start.current.tx + g.dx,
            ty: start.current.ty + g.dy,
          };
          onCropChange({
            ...next,
            tx: clamp(next.tx, -bounds.maxX, bounds.maxX),
            ty: clamp(next.ty, -bounds.maxY, bounds.maxY),
          });
        },
        onPanResponderRelease: () => {
          if (!enabled) return;
          onCropChange({
            ...crop,
            tx: clamp(crop.tx, -bounds.maxX, bounds.maxX),
            ty: clamp(crop.ty, -bounds.maxY, bounds.maxY),
          });
          onEnd?.();
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderTerminate: () => {
          if (!enabled) return;
          onEnd?.();
        },
      }),
    [enabled, onStart, onEnd, crop, onCropChange, bounds.maxX, bounds.maxY]
  );

  return (
    <View
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width && height && (width !== box.w || height !== box.h)) setBox({ w: width, h: height });
      }}
      style={styles.wrap}
      {...(enabled ? responder.panHandlers : {})}
    >
      <View
        style={{
          transform: [{ translateX: crop.tx }, { translateY: crop.ty }, { scale: crop.scale }],
        }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: "hidden" },
});
