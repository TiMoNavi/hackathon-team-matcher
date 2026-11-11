import React from "react";
import { View, FlatList, StyleSheet, Dimensions, Animated, Easing, ActivityIndicator, Text, TouchableOpacity } from "react-native";
import type { ViewToken, ViewabilityConfig } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import type { PostMediaItem } from "../helpers/buildPostMediaList";
import { Video, ResizeMode } from "expo-av";
import { useTheme } from "../../../../theme/ThemeProvider";

import { avatarPlaceholder, gridPlaceholderDark, gridPlaceholderLight } from "../../../../../assets/placeholders";


import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/core";

const { width } = Dimensions.get("window");

function ImageSlide({
  uri,
  thumbUri,
  rkey,
  placeholder,
}: {
  uri: string;
  thumbUri?: string | null;
  rkey: string;
  placeholder: any;
}) {
  const [failed, setFailed] = React.useState(false);
  const hasUri = typeof uri === "string" && uri.length > 0;

  return (
    <ExpoImage
      source={!hasUri || failed ? placeholder : { uri }}
      placeholder={thumbUri ? { uri: thumbUri } : placeholder}
      onError={() => setFailed(true)}
      style={{ width, height: width, backgroundColor: "#000" }}
      contentFit="cover"
      transition={150}
      cachePolicy="disk"
      recyclingKey={rkey}
    />
  );
}


function VideoSlide({
  uri,
  vkey,
  play,
}: {
  uri: string;
  vkey: string;

  play: boolean;
}) {
  

  // Kamera-Hint: kurz animiert einblenden, wenn das Video "aktiv" wird.
  const camOpacity = React.useRef(new Animated.Value(0)).current;
  const camScale = React.useRef(new Animated.Value(0.92)).current;
  const lastPlayRef = React.useRef(false);
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCameraHint = React.useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    camOpacity.stopAnimation();
    camScale.stopAnimation();
    camOpacity.setValue(0);
    camScale.setValue(0.92);

    Animated.parallel([
      Animated.timing(camOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(camScale, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    hideTimerRef.current = setTimeout(() => {
      Animated.timing(camOpacity, {
        toValue: 0,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, 1250);
  }, [camOpacity, camScale]);

  React.useEffect(() => {
    // nur beim Übergang false -> true triggern
    if (play && !lastPlayRef.current) showCameraHint();
    lastPlayRef.current = play;
  }, [play, showCameraHint]);

  React.useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const ref = React.useRef<Video>(null);
  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (play) v.playAsync().catch(() => {});
    else v.pauseAsync().catch(() => {});
  }, [play]);


  return (
    <View style={{ width, height: width, backgroundColor: "#000" }}>
      
      <Animated.View
        pointerEvents="none"
        style={[
          s.cameraHint,
          { opacity: camOpacity, transform: [{ scale: camScale }] },
        ]}
      >
        <Ionicons name="videocam" size={22} color="#fff" />
      </Animated.View>

      <Video
        key={vkey}
        style={{ width, height: width }} 
        ref={ref}
        source={{ uri }}
        resizeMode={ResizeMode.COVER}
        isLooping
        shouldPlay={false}             // wir steuern via effect
        isMuted

      />
    </View>
  );
}

export function PostMediaCarousel({
  postId,
  isProcessing,
  media,
  shouldPlay,
  onIndexChange,

}: {
  postId: string;               // ✅ NEU
  isProcessing: boolean;        // ✅ NEU
  media: PostMediaItem[];
  shouldPlay: boolean; // kommt aus PostCard: isActive && screenFocused
  onIndexChange?: (index: number) => void;

}) {
  const [index, setIndex] = React.useState(0);
  const { theme } = useTheme();
  const C = theme.colors;

  const placeholder = theme.mode === "dark" ? gridPlaceholderDark : gridPlaceholderLight;


  React.useEffect(() => {
    setIndex(0);
  }, [media.length]);

  const onViewableItemsChanged = React.useRef(
    (info: { viewableItems: ViewToken[] }) => {
      const first = info.viewableItems.find(
        (v) => v.isViewable && typeof v.index === "number"
      );
      if (!first || typeof first.index !== "number") return;
      setIndex(first.index);
      onIndexChange?.(first.index);
    }
  ).current;

  const viewabilityConfig = React.useRef<ViewabilityConfig>({
    viewAreaCoveragePercentThreshold: 95,
    minimumViewTime: 80,
    waitForInteraction: false,
  }).current;

  const renderItem = ({ item, index: i }: { item: PostMediaItem; index: number }) => {

    // ===== AB HIER: NUR NOCH "SAFE" CONTENT =====

  if (item.kind === "VIDEO" && item.videoUrl) {
    return (
      <VideoSlide
        key={`video:${postId}:${item.id}:${item.videoUrl}`}
        vkey={`video:${postId}:${item.id}:${item.videoUrl}`}
        uri={item.videoUrl}
        play={shouldPlay && i === index}
      />
    );
  }



  const full = item.imageUrl || item.thumbUrl;
  const thumb = item.thumbUrl;

    return (
    <ImageSlide
      uri={full ?? ""}
      thumbUri={thumb}
      rkey={`img:${postId}:${item.id}:${full}`}
      placeholder={placeholder}
    />
  );
  };

  

  if (isProcessing) {
    return (
      <View style={s.processingWrap}>
        <ActivityIndicator size="large" color={C.text} />
      </View>
    );
  }


  return (
    <View style={s.wrap}>
      <FlatList
        data={media}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        removeClippedSubviews
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        style={{ width, height: width }}
      />

  
    </View>
  );
}

const s = StyleSheet.create({
  groupBadge: {
    position: "absolute",
    left: 10,
    top: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(220, 252, 231, 0.55)", // 🌿 helles Grün
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.08)",
  },

  groupBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },

   processingWrap: {
    width: "100%",
    height: width,              // ✅ safe: exakt wie Media
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  
  cameraHint: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  wrap: { width: "100%", aspectRatio: 1, backgroundColor: "#000" },
});
