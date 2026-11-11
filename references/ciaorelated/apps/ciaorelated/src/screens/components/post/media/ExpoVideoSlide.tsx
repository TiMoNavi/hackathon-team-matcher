import React, { useEffect } from "react";
import { VideoView, useVideoPlayer } from "expo-video";
import { Image as ExpoImage } from "expo-image";

export function ExpoVideoSlide({
  uri,
  width,
  play,
  poster,
}: {
  uri: string | null;
  width: number;
  play: boolean;
  poster: string;
}) {
  // Fallback: kein Video -> Poster als Bild
  if (!uri) {
    return (
      <ExpoImage
        source={{ uri: poster }}
        style={{ width, height: width, backgroundColor: "#000" }}
        contentFit="cover"
        transition={100}
        cachePolicy="disk"
      />
    );
  }

  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    // iOS: default muted in feed-like situations oft sinnvoll
    // du kannst später play-state/volume separat steuern
  });

  useEffect(() => {
    if (play) player.play();
    else player.pause();
  }, [play, player]);

  return (
    <VideoView
      player={player}
      style={{ width, height: width, backgroundColor: "#000" }}
      contentFit="cover"
      allowsFullscreen
      allowsPictureInPicture
    />
  );
}
