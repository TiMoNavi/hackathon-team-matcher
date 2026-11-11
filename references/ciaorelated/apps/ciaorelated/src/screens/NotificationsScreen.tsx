import React, { useCallback, useMemo, useState } from "react";
import {
  SafeAreaView, View, Text, FlatList, Image, TouchableOpacity, StyleSheet, RefreshControl,
} from "react-native";
import { gql, useMutation, useQuery } from "@apollo/client";
import { useNavigation } from "@react-navigation/native";
import {
  MARK_ONE_READ,
  MARK_READ,
} from "../graphql/mutations/notifications";
import { avatarPlaceholder } from "../../assets/placeholders";
import { useTranslation } from "react-i18next";

const C = { bg:"#0B0B0B", text:"#fff", sub:"#9CA3AF", border:"#23262B", green:"#22c55e", red:"#ef4444" };

/* -------- Utils -------- */
function timeAgo(d: string | number | Date, justNow: string) {
  const t = new Date(d).getTime();
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff/60000);
  if (min < 1) return justNow;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min/60);
  if (h < 24) return `${h} h`;
  const dA = Math.floor(h/24);
  return `${dA} d`;
}

/* -------- GraphQL -------- */
export const INBOX = gql`
  query Inbox($offset: Int, $limit: Int) {
    inbox(offset: $offset, limit: $limit) {
      edges {
        id kind isRead createdAt
        payload
        fromUser { id username avatarUrl }
        vlog { id title slug }
        post { id imageUrl thumbUrl videoUrl }
      }
      nextCursor
    }
  }
`;



/* -------- Component -------- */
export default function NotificationsScreen(){
  const { t } = useTranslation();

  const nav = useNavigation<any>();

  const { data, fetchMore, refetch, loading } = useQuery(INBOX, {
    variables:{ offset:0, limit:20 },
    fetchPolicy:"cache-and-network",
    notifyOnNetworkStatusChange:true,
  });

  const [markOneRead] = useMutation(MARK_ONE_READ);
  const [markManyRead] = useMutation(MARK_READ);

  const [refreshing, setRefreshing] = useState(false);

  const items = useMemo(() => data?.inbox?.edges ?? [], [data]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch({ offset:0, limit:20 }); }
    finally { setRefreshing(false); }
  }, [refetch]);

  const goPost = useCallback((n:any) => {
    const thumb = n.post?.thumbUrl || n.post?.imageUrl || null;
    const video = n.post?.videoUrl || null;
    const startIndex = data?.userPosts?.findIndex((p: any) => p.id === n.post.id);
   
    if (!n.post?.id) return;
    nav.navigate("PostDetail", {
      id: n.post.id, imageUrl: thumb, videoUrl: video,
      username: n.fromUser?.username ?? t("notifications.unknownUser"),
      avatar: n.fromUser?.avatarUrl ?? avatarPlaceholder,
      dateLabel: n.createdAt,
      caption: n.payload?.caption ?? undefined,
      likes: 0,
      location: undefined,
      authorId: undefined,
      postIds: data?.userPosts?.map((p:any) => p.id),
      startIndex: Math.max(0, startIndex),
    });
  }, [data?.userPosts, nav, t]);

  const goVlog = useCallback((n:any) => {
    if (!n.vlog?.slug) return;
    nav.navigate("VlogDetail", { slug: n.vlog.slug });
  }, [nav]);


  const renderRow = ({ item: n }: any) => {
    const user = n.fromUser;
    const isVlogRequest = n.kind === "VLOG_TAG_REQUEST";
    const username = user?.username ?? t("notifications.unknownUser");
    const title =
      n.kind === "VLOG_TAG_REQUEST"   ? t("notifications.kind.vlogTagRequest", { username, vlogTitle: n?.vlog?.title ?? t("notifications.yourVlog") }) :
      n.kind === "VLOG_TAG_APPROVED"  ? t("notifications.kind.vlogTagApproved") :
      n.kind === "VLOG_TAG_REJECTED"  ? t("notifications.kind.vlogTagRejected") :
      n.kind === "FOLLOW"             ? t("notifications.kind.follow", { username }) :
      n.kind === "LIKE"               ? t("notifications.kind.like", { username }) :
      n.kind === "COMMENT"            ? t("notifications.kind.comment", { username }) :
      n.kind === "VLOG_DELETED"       ? t("notifications.kind.vlogDeleted", { vlogTitle: n?.vlog?.title ?? t("notifications.deletedFallback") }) :
      (n.payload?.text ?? t("notifications.defaultTitle"));

    return (
      <View style={s.row}>
        <Image source={{ uri: user?.avatarUrl || avatarPlaceholder }} style={s.avatar}/>
        <View style={{ flex:1 }}>
          <Text style={s.title} numberOfLines={2}>{title}</Text>
          <View style={{ flexDirection:"row", alignItems:"center", gap:8, marginTop:4 }}>
            {!!n.vlog?.title && (
              <TouchableOpacity onPress={() => goVlog(n)}>
                <Text style={s.link}>#{n.vlog.title}</Text>
              </TouchableOpacity>
            )}
            <Text style={s.time}>{timeAgo(n.createdAt, t("notifications.justNow"))}</Text>
            {!n.isRead && <View style={s.dot}/>}
          </View>
        </View>

        {/* Post-Preview (rechts) */}
        {n.post?.thumbUrl || n.post?.imageUrl ? (
          <TouchableOpacity onPress={() => goPost(n)}>
            <Image source={{ uri: n.post.thumbUrl || n.post.imageUrl }} style={s.thumb} />
          </TouchableOpacity>
        ) : null}

        
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:C.bg }}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
          <Text style={s.back}>‹</Text>
        </TouchableOpacity>
        <Text style={s.hTitle}>{t("notifications.announcements")}</Text>
        <View style={{ width:22 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(x:any)=>x.id}
        renderItem={renderRow}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        onEndReachedThreshold={0.5}
        onEndReached={()=>{
          const c = data?.inbox?.nextCursor;
          if (!c) return;
          fetchMore({ variables:{ offset: items.length, limit: 20 } });
        }}
        refreshControl={<RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={{ padding:24 }}>
            <Text style={{ color:C.sub }}>{loading ? t("notifications.loading") : t("notifications.empty")}</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header:{ height:52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:12 },
  back:{ color:"#fff", fontSize:26 },
  hTitle:{ color:"#fff", fontWeight:"800", fontSize:18 },

  row:{ flexDirection:"row", alignItems:"center", paddingHorizontal:12, paddingVertical:12 },
  avatar:{ width:40, height:40, borderRadius:20, backgroundColor:"#111", marginRight:10 },
  title:{ color:"#fff", fontWeight:"700" },
  link:{ color:"#9AB6FF", fontWeight:"700" },
  time:{ color:C.sub, fontSize:12 },
  dot:{ width:8, height:8, backgroundColor:"#3b82f6", borderRadius:4 },

  thumb:{ width:44, height:44, borderRadius:8, backgroundColor:"#111", marginLeft:8 },

  btn:{ paddingHorizontal:10, paddingVertical:8, borderRadius:8 },
  btnText:{ color:"#000", fontWeight:"800" },

  sep:{ height: StyleSheet.hairlineWidth, backgroundColor:"#121212" },
});
