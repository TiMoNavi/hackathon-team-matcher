// apps/ciaorelated/src/components/StoryBubbles.tsx
import React from "react";
import { FlatList, TouchableOpacity, View, Text } from "react-native";
import { Image } from "expo-image";
import { useQuery } from "@apollo/client";
import { STORIES_FEED } from "../../graphql/queries/stories";

type Props = { onOpenUser: (userId: string, startIndex?: number) => void };

export default function StoryBubbles({ onOpenUser }: Props) {
  const { data, loading, refetch } = useQuery(STORIES_FEED, { fetchPolicy: "cache-and-network" });
  const rows = (data?.storiesFeed ?? []);

  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={rows}
      keyExtractor={(r:any) => r.user.id}
      onRefresh={refetch as any}
      refreshing={loading}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 12 }}
      renderItem={({ item }: any) => {
        const firstUnseen = item.stories.findIndex((s:any)=>!s.seen);
        const hasUnseen = firstUnseen !== -1;
        return (
          <TouchableOpacity onPress={() => onOpenUser(item.user.id, Math.max(0, firstUnseen))} style={{ alignItems: "center" }}>
            <View style={{
              width: 64, height: 64, borderRadius: 32, padding: 2,
              backgroundColor: hasUnseen ? "#F43F5E" : "#666",
            }}>
              <View style={{ flex: 1, borderRadius: 30, overflow: "hidden", backgroundColor: "#111" }}>
                <Image source={{ uri: item.user.avatarUrl }} style={{ flex: 1 }} contentFit="cover" cachePolicy="disk" />
              </View>
            </View>
            <Text numberOfLines={1} style={{ color: "#ddd", fontSize: 11, marginTop: 6, maxWidth: 70 }}>{item.user.username}</Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}
