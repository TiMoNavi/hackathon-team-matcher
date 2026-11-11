import React from "react";
import { Image as ExpoImage } from "expo-image";
import { avatarPlaceholder } from "../../../assets/placeholders";

export const AvatarImage = React.memo(function AvatarImage({
  thumb,
  full,
  style,
  recyclingKey,
}: {
  thumb?: string | null;
  full?: string | null;
  style: any;
  recyclingKey?: string;
}) {
  const [failedPrimary, setFailedPrimary] = React.useState(false);
  const [failedFallback, setFailedFallback] = React.useState(false);

  // ✅ WICHTIG: wenn sich die URL ändert, Fehlerstatus zurücksetzen
  React.useEffect(() => {
    setFailedPrimary(false);
    setFailedFallback(false);
  }, [thumb, full]);

  const src = React.useMemo(() => {
    const primary = typeof thumb === "string" ? thumb.trim() : "";
    const fallback = typeof full === "string" ? full.trim() : "";
    if (!failedPrimary && primary) return { uri: primary };
    if (!failedFallback && fallback && fallback !== primary) return { uri: fallback };
    return avatarPlaceholder;
  }, [failedFallback, failedPrimary, thumb, full]);

  return (
    <ExpoImage
      source={src}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey}
      onError={() => {
        if (!failedPrimary) {
          setFailedPrimary(true);
          return;
        }
        setFailedFallback(true);
      }}
    />
  );
});
