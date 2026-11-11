// apps/ciaorelated/src/screens/VlogRadarScreen.tsx
import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Animated,
  PanResponder,
  Dimensions,
  FlatList,
  Pressable,
  TextInput,
  Modal
} from "react-native";
import { gql, useQuery } from "@apollo/client";
import { useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import Svg, { Circle } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
// import MapView, { PROVIDER_GOOGLE } from "react-native-maps";
import { useTheme } from "../theme/ThemeProvider";

import type { ColorValue } from "react-native";


import { useTranslation } from "react-i18next";

const { width } = Dimensions.get("window");
const RADAR_SIZE = Math.min(width - 24, 360);
const R = RADAR_SIZE / 2;



const BLIP_SIZE = 36;
const BLIP_PADDING = 10;
const MIN_SPACING = 42; // min. Abstand zwischen Blips in px
const MAX_NODES = 48; // max. Blips/Cluster im Radar
const PLACEHOLDER = "https://via.placeholder.com/200x200?text=V";
// const USE_GOOGLE = Platform.OS === "android"; // oder true, wenn du iOS auch mit Google fährst

const VLOGS_NEAR = gql`
  query VlogsNear($lat: Float!, $lng: Float!, $radiusKm: Float!, $limit: Int!) {
    vlogsNear(lat: $lat, lng: $lng, radiusKm: $radiusKm, limit: $limit) {
      edges {
        id
        slug
        title
        coverUrl
        coverThumbUrl
        postCount
        memberCount
        distanceKm
        updatedAt
        lat
        lng
        owner {
          username
          avatarUrl
        }
        __typename
      }
      nextCursor
      __typename
    }
  }
`;

function angleFromId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const deg = h % 360;
  return (deg * Math.PI) / 180;
}

// deterministischer "Zufall" aus String-Seed (stabil pro Cluster)
function seededIndex(len: number, seedStr: string) {
  if (len <= 0) return 0;
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h % len;
}

const MAP_STYLE_SKETCH = [
  { elementType: "geometry", stylers: [{ saturation: -100 }, { lightness: -10 }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ lightness: 15 }, { gamma: 1.4 }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ lightness: -10 }] },
];

const MAP_STYLE_PENCIL = [
  // Grundfläche “paper”
  { elementType: "geometry", stylers: [{ color: "#f4f1ea" }] },

  // Labels stark reduzieren
  { elementType: "labels", stylers: [{ visibility: "off" }] },

  // Administrative Grenzen sehr subtil
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#c9c3b8" }, { weight: 1 }] },

  // Land: etwas wärmer
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f4f1ea" }] },

  // Wasser wie “Wash”
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dbe7f2" }] },

  // Parks sehr hell
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#e7efe3" }] },

  // POIs aus
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },

  // Roads: nur Linien
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#b7b1a6" }, { weight: 1 }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#a9a396" }, { weight: 1.2 }] },

  // Road labels aus (safety)
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
];



type Vlog = {
  id: string;
  slug: string;
  title: string;
  coverUrl?: string | null;
  coverThumbUrl?: string | null;
  postCount?: number;
  memberCount?: number;
  distanceKm?: number | null;
  updatedAt?: string | null;
  lat?: number | null;
  lng?: number | null;

};


type Blip = Vlog & { x: number; y: number; rPx: number; theta: number; latN?: number; lngN?: number; distKm: number };
type Cluster = {
  x: number;
  y: number;
  rPx: number;
  members: Vlog[];
  distanceKm: number;
  isSingle?: boolean;
};

type ClusterBlipProps = {
  cluster: Cluster;
  onPress: () => void;
  COLORS: any;
};

const ClusterBlip = memo(function ClusterBlip({ cluster, onPress, COLORS }: ClusterBlipProps) {
  const { t } = useTranslation();

  const count = cluster.members.length;
  const isCluster = count > 1;

  // Größe leicht nach Count skalieren (dezent)
  const base = isCluster ? 44 : 36;
  const extra = Math.min(12, Math.floor(Math.log2(Math.max(2, count))) * 4);
  const size = base + (isCluster ? extra : 0);

  const outerSize = size + 10;
  const outerHalf = outerSize / 2;

  // Puls nur für Cluster, ganz leicht
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isCluster) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isCluster, pulse]);

  const scale = isCluster
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] })
    : 1;

  const memberUris = useMemo(
    () => cluster.members.map((m) => m.coverUrl || PLACEHOLDER),
    [cluster.members]
  );
  const seed = useMemo(() => cluster.members.map((m) => m.id).join("|"), [cluster.members]);

  const previewUri = useMemo(() => {
    return isCluster ? memberUris[seededIndex(memberUris.length, seed)] : memberUris[0];
  }, [isCluster, memberUris, seed]);

  const glowColors = useMemo((): readonly [ColorValue, ColorValue, ...ColorValue[]] => {
    if (isCluster) {
      return [
        (COLORS.primary ?? "#7C3AED") as ColorValue,
        (COLORS.accent ?? COLORS.text ?? "#ffffff") as ColorValue,
        ((COLORS.like ?? COLORS.primary) ?? "#F472B6") as ColorValue,
      ];
    }
    return [
      (COLORS.primary ?? "#7C3AED") as ColorValue,
      (COLORS.card ?? "#111111") as ColorValue,
    ];
  }, [isCluster, COLORS.primary, COLORS.accent, COLORS.text, COLORS.like, COLORS.card]);


  return (
    <Animated.View
      style={{
        position: "absolute",
        left: Math.round(cluster.x - outerHalf),
        top: Math.round(cluster.y - outerHalf),
        transform: [{ scale }],
      }}
    >
      <LinearGradient
        colors={glowColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: outerSize,
          height: outerSize,
          borderRadius: outerHalf,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: COLORS.primary,
          shadowOpacity: 0.35,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 6,
        }}
      >
        <View
          style={{
            width: size + 4,
            height: size + 4,
            borderRadius: (size + 4) / 2,
            backgroundColor: COLORS.bg,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: COLORS.border,
          }}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            delayPressIn={120}
            onPress={onPress}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              overflow: "hidden",
              backgroundColor: COLORS.card,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <ExpoImage
              source={{ uri: previewUri }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
              transition={120}
              recyclingKey={previewUri}
            />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {isCluster && (
        <LinearGradient
          colors={[COLORS.success ?? "#10B981", COLORS.successDark ?? "#047857"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: "absolute",
            right: -2,
            top: -2,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 10,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: "rgba(0,0,0,0.35)",
          }}
        >
          <Text style={{ color: "#00110b", fontWeight: "900", fontSize: 12 }}>{count}</Text>
        </LinearGradient>
      )}
    </Animated.View>
  );
});

type RowItemProps = {
  item: Vlog;
  onPress: (slug: string) => void;
  COLORS: any;
  s: ReturnType<typeof styles>;
};

const RowItem = memo(function RowItem({ item, onPress, COLORS, s }: RowItemProps) {
  return (
    <TouchableOpacity onPress={() => onPress(item.slug)} style={s.row} activeOpacity={0.9}>
      <ExpoImage
        source={{ uri: item.coverUrl ?? PLACEHOLDER }}
        style={s.thumb}
        contentFit="cover"
        cachePolicy="memory-disk"
        placeholder={item.coverThumbUrl ? { uri: item.coverThumbUrl } : undefined}
        placeholderContentFit="cover"
        priority="low"
        transition={120}
        recyclingKey={item.id}
      />

      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={s.sub}>
          {item.postCount ?? 0} posts · {Math.round(item.distanceKm ?? 0)} km away
          {item.updatedAt ? ` · ${new Date(item.updatedAt).toLocaleDateString()}` : ""}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={COLORS.subtext} />
    </TouchableOpacity>
  );
});

// ---- Screen -----------------------------------------------------------------

export default function VlogRadarScreen() {
  const { theme } = useTheme();
  const COLORS = theme.colors as any;
  const s = styles(COLORS);
  const { t } = useTranslation();
  const solidCardBg =
  typeof COLORS.card === "string" && COLORS.card.startsWith("rgba")
    ? (COLORS.bg ?? "#000")
    : (COLORS.card ?? "#111");

  const nav = useNavigation<any>();

  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [permDenied, setPermDenied] = useState(false);

  const [mapRegion, setMapRegion] = useState<any>(null);

  function regionFrom(pos: { lat: number; lng: number }, radiusKm: number) {
    const latDelta = Math.max(0.01, (radiusKm * 2) / 111); // Durchmesser
    const lngDelta =
      Math.max(0.01, (radiusKm * 2) / (111 * Math.cos((pos.lat * Math.PI) / 180)));

    return {
      latitude: pos.lat,
      longitude: pos.lng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }

  


  // ✅ Standort-Auswahl (manuell) – ohne extra libs
const [placeOpen, setPlaceOpen] = useState(false);
const [placeQuery, setPlaceQuery] = useState("");
const [placeLabel, setPlaceLabel] = useState<string>(t("vlogradar.currentLocation"));
const [placeLoading, setPlaceLoading] = useState(false);

// optional: label aus Koordinaten
const refreshPlaceLabel = useCallback(async (lat: number, lng: number) => {
  try {
    const res = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const first = res?.[0];
    const label =
      first?.city
        ? `${first.city}${first.country ? `, ${first.country}` : ""}`
        : first?.region
          ? `${first.region}${first.country ? `, ${first.country}` : ""}`
          : t("vlogradar.selectedLocation");
    setPlaceLabel(label);
  } catch {
    setPlaceLabel(t("vlogradar.selectedLocation"));
  }
}, [t]);


  const [radiusUI, setRadiusUI] = useState(50);
  const [radiusQuery, setRadiusQuery] = useState(50);

  const [visibleEdges, setVisibleEdges] = useState<Vlog[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);

  // ✅ PanResponder stabil halten (nicht von radiusUI abhängig)
  const radiusUIRef = useRef(radiusUI);
  useEffect(() => {
    radiusUIRef.current = radiusUI;
  }, [radiusUI]);

  useEffect(() => {
    if (!pos) return;
    setMapRegion(regionFrom(pos, Math.max(1, radiusUI)));
  }, [pos, radiusUI]);


  useLayoutEffect(() => {
    nav.setOptions({
      headerShown: true,
      headerTitle: "Radar",
      headerBackTitleVisible: false,
      headerBackTitle: t("vlogradar.backTitle"),
      headerTintColor: COLORS.text,
      headerStyle: { backgroundColor: COLORS.bg },
      headerTitleStyle: { color: COLORS.text },
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginRight: 10 }}>
          <MaterialCommunityIcons name="radar" size={20} color={COLORS.subtext} />
        </View>
      ),
    });
  }, [nav, COLORS.bg, COLORS.text, COLORS.subtext, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setPermDenied(true);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
       
        if (!cancelled) {
          const next = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setPos(next);
          refreshPlaceLabel(next.lat, next.lng);
        }

      } catch {
        setPermDenied(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshPlaceLabel]);

  const { data, loading, error, refetch, networkStatus } = useQuery(VLOGS_NEAR, {
    skip: !pos,
    variables: { lat: pos?.lat!, lng: pos?.lng!, radiusKm: radiusQuery, limit: 80 },
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
    nextFetchPolicy: "cache-first",
  });

  const edges = useMemo<Vlog[]>(() => data?.vlogsNear?.edges ?? [], [data]);

  useEffect(() => {
    if (!pos) return;
    if (loading && visibleEdges.length) return;
    setVisibleEdges((prev) => (edges.length || !loading ? edges : prev));
  }, [edges, loading, pos, visibleEdges.length]);

  // Pulsierender Radar-Ring
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const pulseScale = useMemo(
    () => pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] }),
    [pulse]
  );
  const pulseOpacity = useMemo(
    () => pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.22] }),
    [pulse]
  );

  // Swipe-Zoom
  const startRadiusRef = useRef(radiusUI);
  const KM_PER_PIXEL = 0.35;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4 || Math.abs(g.dx) > 8,
      onMoveShouldSetPanResponderCapture: () => true,

      onPanResponderGrant: () => {
        startRadiusRef.current = radiusUIRef.current;
      },
      onPanResponderMove: (_e, g) => {
        const next = Math.max(1, Math.min(500, startRadiusRef.current + -g.dy * KM_PER_PIXEL));
        const rounded = Math.round(next * 10) / 10;
        // ✅ weniger Updates
        if (Math.abs(rounded - radiusUIRef.current) >= 0.2) setRadiusUI(rounded);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: () => {
        const finalR = Math.round(radiusUIRef.current);
        setRadiusUI(finalR);
        setRadiusQuery(finalR);
        setSelectedCluster(null);
        if (pos) refetch?.({ lat: pos.lat, lng: pos.lng, radiusKm: finalR, limit: 80 });
      },
    })
  ).current;

  // Blips (polare Koordinaten → XY)
function kmBetweenLat(aLat: number, bLat: number) {
  return (bLat - aLat) * 111.32; // km pro Grad Latitude
}
function kmBetweenLng(atLat: number, aLng: number, bLng: number) {
  const kmPerDeg = 111.32 * Math.cos((atLat * Math.PI) / 180);
  return (bLng - aLng) * kmPerDeg;
}
function toNum(x: any) {
  if (x == null) return NaN;
  if (typeof x === "number") return x;
  if (typeof x === "string") return Number(x.replace(",", "."));
  return Number(x);
}

function normalizeLatLng(latRaw: any, lngRaw: any) {
  let lat = toNum(latRaw);
  let lng = toNum(lngRaw);

  // ✅ häufigster Bug: vertauscht (lat ist "zu groß" oder lng "zu klein")
  // lat muss in [-90..90], lng in [-180..180] sein.
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const latOk = Math.abs(lat) <= 90;
    const lngOk = Math.abs(lng) <= 180;

    // wenn lat unplausibel aber lng plausibel -> swap
    if (!latOk && lngOk && Math.abs(lng) <= 90 && Math.abs(lat) <= 180) {
      const t = lat;
      lat = lng;
      lng = t;
    }
  }

  return { lat, lng };
}

function bearingRad(lat1: number, lng1: number, lat2: number, lng2: number) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.atan2(y, x); // -PI..PI (0 = Norden)
}
const baseBlips = useMemo<Blip[]>(() => {
  const maxR = R - BLIP_PADDING - BLIP_SIZE / 2;
  if (!pos) return [];
  const maxKm = Math.max(1, radiusUI);

  const out: Blip[] = [];

  for (const v of visibleEdges) {
    const { lat: vLat, lng: vLng } = normalizeLatLng((v as any).lat, (v as any).lng);
    if (!Number.isFinite(vLat) || !Number.isFinite(vLng)) continue; // <- ohne coords: nicht rendern

    // Distanz sauber berechnen (nicht server-distance, die ist ok, aber coords sind die source of truth)
    const distKm = haversineKm(pos.lat, pos.lng, vLat, vLng);
    if (!Number.isFinite(distKm) || distKm > maxKm) continue;

    // Richtung aus coords
    const theta = bearingRad(pos.lat, pos.lng, vLat, vLng);

    // Radius in Pixel (exakt proportional)
    const rPx = (distKm / maxKm) * maxR;

    const x = R + rPx * Math.sin(theta);
    const y = R - rPx * Math.cos(theta);

    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    out.push({
      ...v,
      x,
      y,
      rPx,
      theta,
      latN: vLat,
      lngN: vLng,
      distKm,
    });
  }

  return out;
}, [visibleEdges, radiusUI, pos]);



function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

function toClusterKey(lat: number, lng: number, cellMeters: number) {
  // grobe Meter->Grad Umrechnung (ausreichend fürs Binning)
  const latDeg = cellMeters / 111_320;
  const lngDeg = cellMeters / (111_320 * Math.cos((lat * Math.PI) / 180));

  const a = Math.floor(lat / latDeg);
  const b = Math.floor(lng / lngDeg);
  return `${a}:${b}`;
}
const clusters = useMemo<Cluster[]>(() => {
  // Greedy-Cluster nach Pixelnähe (keine Verteilung!)
  const out: Cluster[] = [];

  for (const b of baseBlips) {
    // nur im Kreis zulassen
    const dxC = b.x - R;
    const dyC = b.y - R;
    if (dxC * dxC + dyC * dyC > (R - BLIP_PADDING) * (R - BLIP_PADDING)) continue;

    let joined = false;

    for (const c of out) {
      const dx = b.x - c.x;
      const dy = b.y - c.y;

      if (dx * dx + dy * dy <= MIN_SPACING * MIN_SPACING) {
        // -> in Cluster rein
        c.members.push(b);

        // Clusterzentrum = Durchschnitt (bleibt “am Ort”, kein Random)
        const n = c.members.length;
        c.x = (c.x * (n - 1) + b.x) / n;
        c.y = (c.y * (n - 1) + b.y) / n;

        if (b.distKm < c.distanceKm) c.distanceKm = b.distKm;
        joined = true;
        break;
      }
    }

    if (!joined) {
      out.push({
        x: b.x,
        y: b.y,
        rPx: b.rPx,
        members: [b],
        distanceKm: b.distKm,
        isSingle: true,
      });
    }
  }

  // isSingle updaten
  for (const c of out) c.isSingle = c.members.length === 1;

  out.sort((a, b) => (a.distanceKm ?? 9e9) - (b.distanceKm ?? 9e9));
  return out.slice(0, MAX_NODES);
}, [baseBlips]);


  // Liste unten – sortiert nach Auswahlzustand
  const inRange = useMemo(() => {
    const all = visibleEdges
      .filter((v) => (v.distanceKm ?? Infinity) <= radiusUI)
      .sort((a, b) => (a.distanceKm ?? 9e9) - (b.distanceKm ?? 9e9));

    if (!selectedCluster) return all;

    const ids = new Set(selectedCluster.members.map((m) => m.id));
    const rest = all.filter((v) => !ids.has(v.id));

    const clusterMembersSorted = [...selectedCluster.members].sort((a, b) => {
      const ua = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const ub = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      if (ub !== ua) return ub - ua;
      return (a.distanceKm ?? 9e9) - (b.distanceKm ?? 9e9);
    });

    return [...clusterMembersSorted, ...rest];
  }, [visibleEdges, radiusUI, selectedCluster]);

  // Prefetch (dedupe)
  useEffect(() => {
    const src = (visibleEdges.length ? visibleEdges : edges)
      .slice(0, 60)
      .map((v) => v.coverUrl)
      .filter(Boolean) as string[];
    const uniq = Array.from(new Set(src));
    if (uniq.length) ExpoImage.prefetch(uniq);
  }, [edges, visibleEdges]);

  useEffect(() => {
  if (!edges?.length) return;
  console.log(
    "[Radar] sample edges",
    edges.slice(0, 8).map((v) => ({
      id: v.id,
      distanceKm: v.distanceKm,
      lat: (v as any).lat,
      lng: (v as any).lng,
      latType: typeof (v as any).lat,
      lngType: typeof (v as any).lng,
    }))
  );
}, [edges]);


  const onPressVlog = useCallback(
    (slug: string) => {
      nav.navigate("VlogDetail", { slug });
    },
    [nav]
  );
  const applyPlace = useCallback(async () => {
    const q = placeQuery.trim();
    if (!q) return;

    setPlaceLoading(true);
    try {
      const hits = await Location.geocodeAsync(q);
      const first = hits?.[0];
      if (!first) return;

      const next = { lat: first.latitude, lng: first.longitude };

      // ✅ state
      setPos(next);
      setSelectedCluster(null);
      setPlaceLabel(q);

      // ✅ wichtig: immer "commit" radius nehmen (nicht stale radiusQuery)
      const finalR = Math.round(radiusUIRef.current);
      setRadiusUI(finalR);
      setRadiusQuery(finalR);

      // ✅ refetch mit NEUEM center + finalR
      refetch?.({ lat: next.lat, lng: next.lng, radiusKm: finalR, limit: 80 });

      setPlaceOpen(false);
    } finally {
      setPlaceLoading(false);
    }
  }, [placeQuery, refetch, setPos, setSelectedCluster, setPlaceLabel, setPlaceOpen]);


  const keyExtractor = useCallback((v: Vlog) => v.id, []);
  const renderItem = useCallback(
    ({ item }: { item: Vlog }) => <RowItem item={item} onPress={onPressVlog} COLORS={COLORS} s={s} />,
    [onPressVlog, COLORS, s]
  );

  if (permDenied) {
    return (
      <SafeAreaView style={s.center}>
        <View style={s.card}>
          <View style={s.cardIcon}>
            <Ionicons name="location" size={22} color={COLORS.text} />
          </View>
          <Text style={s.cardTitle}>{t("vlogradar.locationRequired")}</Text>
          <Text style={s.cardSub}>
            {t("vlogradar.forRadarToWorkYouNeedLocationPermiss2465f0")}{"\n"}
            {Platform.OS === "ios"
              ? "Aktiviere sie in Einstellungen → Datenschutz → Ortungsdienste."
              : "Aktiviere sie in den System-Einstellungen."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!pos) {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator />
        <Text style={s.sub}>{t("vlogradar.acquiringLocation")}</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={s.center}>
        <Text style={s.err}>{t("common.error")}: {error.message}</Text>
        <TouchableOpacity onPress={() => refetch?.()} style={{ marginTop: 12 }}>
          <Text style={s.link}>{t("vlogradar.retry")}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isRefetching = networkStatus === 4;

  return (
    <SafeAreaView style={s.safe}>
      {/* Status */}
      <View style={s.toolbar}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MaterialCommunityIcons name="map-marker-radius-outline" size={18} color={COLORS.subtext} />
          <Text style={s.toolbarText}>
            Radius: <Text style={s.toolbarStrong}>{Math.round(radiusUI)} km</Text>
            {radiusUI !== radiusQuery && <Text style={s.toolbarMuted}> {t("vlogradar.preview")}</Text>}
          </Text>
        </View>
        {isRefetching && <ActivityIndicator />}
      </View>

      {/* Radar */}
      <View style={s.radarContainer} {...panResponder.panHandlers}>
        <View style={s.radarCircle}>
  {/* Pulse OUTSIDE mask => nicht abgeschnitten */}
  <Animated.View
    pointerEvents="none"
    style={[
      s.pulseOverlay,
      {
        position: "absolute",
        left: 0,
        top: 0,
        width: RADAR_SIZE,
        height: RADAR_SIZE,
        borderRadius: R,
        transform: [{ scale: pulseScale }],
        opacity: pulseOpacity,
        zIndex: 20,
      },
    ]}
  />

  {/* Masked content */}
  <View style={s.radarMask}>
    {/*
    <MapView
      style={StyleSheet.absoluteFillObject}
      region={mapRegion}
      pitchEnabled={false}
      rotateEnabled={false}
      scrollEnabled={false}
      zoomEnabled={false}
      pointerEvents="none"
      provider={USE_GOOGLE ? PROVIDER_GOOGLE : undefined}
      mapType={Platform.OS === "ios" ? "mutedStandard" : "standard"}
      customMapStyle={USE_GOOGLE ? MAP_STYLE_PENCIL : undefined}
      showsPointsOfInterest={false}
      showsBuildings={false}
      showsTraffic={false}
    />
    */}

    <View pointerEvents="none" style={s.mapSketchOverlay} />

    <Svg width={RADAR_SIZE} height={RADAR_SIZE} style={StyleSheet.absoluteFillObject}>
      {[0.25, 0.5, 0.75, 1].map((t, i) => (
        <Circle key={i} cx={R} cy={R} r={R * t} stroke={COLORS.border} strokeWidth={1} fill="none" />
      ))}
      <Circle cx={R} cy={R} r={3} fill={COLORS.primary} />
    </Svg>

    <View style={s.blipsLayer} pointerEvents="box-none">
      {clusters.map((c, idx) => (
        <ClusterBlip
          key={`c:${idx}:${c.members.length}:${Math.round(c.x)}:${Math.round(c.y)}`}
          cluster={c}
          COLORS={COLORS}
          onPress={() => {
            if (
              selectedCluster &&
              selectedCluster.members?.[0]?.id === c.members?.[0]?.id &&
              selectedCluster.members.length === c.members.length
            ) {
              setSelectedCluster(null);
              return;
            }
            setSelectedCluster(c);
          }}
        />
      ))}
    </View>
  </View>
</View>


        <View style={s.hintRow}>
          <Ionicons name="swap-vertical" size={16} color={COLORS.subtext} />
          <Text style={s.hint}>{t("vlogradar.swipeToChangeRadius")}</Text>
        </View>

        {!loading && clusters.length === 0 && (
          <View style={s.emptyOverlay} pointerEvents="none">
            <Text style={s.sub}>{t("vlogradar.noVlogsWithin")}{Math.round(radiusQuery)} km</Text>
          </View>
        )}
      </View>


      {/* Liste */}
      <FlatList
        data={inRange}
        keyExtractor={keyExtractor}
        windowSize={5}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={s.listHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <Text style={s.listHeaderTxt} numberOfLines={1}>
                {selectedCluster
        ? t("vlogradar.clusterSelected", { count: selectedCluster.members.length })
                  : `In range · ${inRange.length}`}
              </Text>

              <Pressable onPress={() => setPlaceOpen(true)} style={s.placePill}>
                <Ionicons name="location-outline" size={14} color={COLORS.text} />
                <Text style={s.placePillTxt} numberOfLines={1}>{placeLabel}</Text>
                <Ionicons name="chevron-down" size={14} color={COLORS.subtext} />
              </Pressable>
            </View>

            {selectedCluster && (
              <Pressable onPress={() => setSelectedCluster(null)} style={{ marginTop: 6 }}>
                <Text style={s.resetTxt}>{t("vlogradar.resetSelection")}</Text>
              </Pressable>
            )}

          
          </View>
        }

        contentContainerStyle={{ paddingBottom: 12 }}
      />
      <Modal
        visible={placeOpen}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"     // iOS Fix: echtes Overlay
        statusBarTranslucent                  // Android: nicer overlay
        onRequestClose={() => setPlaceOpen(false)}
      >
        <Pressable style={s.modalBackdrop} onPress={() => setPlaceOpen(false)} />
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>{t("vlogradar.chooseLocation")}</Text>

          <View style={s.modalInputRow}>
            <Ionicons name="search" size={16} color={COLORS.subtext} />
            <TextInput
              value={placeQuery}
              onChangeText={setPlaceQuery}
              placeholder={t("vlogradar.eGViennaBerlinInnsbruck")}
              placeholderTextColor={COLORS.subtext}
              style={s.modalInput}
              autoCorrect={false}
              autoCapitalize="words"
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <TouchableOpacity
              style={[s.modalBtn, { flex: 1 }]}
              onPress={async () => {
                setPlaceLoading(true);
                try {
                  const loc = await Location.getCurrentPositionAsync({});
                  const next = { lat: loc.coords.latitude, lng: loc.coords.longitude };
                  setPos(next);
                  setSelectedCluster(null);
                  setPlaceLabel(t("vlogradar.currentLocation"));
                  const finalR = Math.round(radiusUIRef.current);
                  setRadiusUI(finalR);
                  setRadiusQuery(finalR);
                  refetch?.({ lat: next.lat, lng: next.lng, radiusKm: finalR, limit: 80 });
                  setPlaceOpen(false);
                } finally {
                  setPlaceLoading(false);
                }
              }}
              activeOpacity={0.9}
            >
              <Text style={s.modalBtnTxt}>GPS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.modalBtnPrimary, { flex: 1, opacity: placeLoading ? 0.6 : 1 }]}
              onPress={applyPlace}
              disabled={placeLoading}
              activeOpacity={0.9}
            >
              <Text style={s.modalBtnPrimaryTxt}>{placeLoading ? "…" : "Anwenden"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
const getSolidCardBg = (COLORS: any) => {
  if (typeof COLORS.card === "string" && COLORS.card.startsWith("rgba")) {
    return COLORS.bg ?? "#000";   // Dark Mode fallback
  }
  return COLORS.card ?? "#111";
};

const styles = (COLORS: any) => {
  const solidCardBg = getSolidCardBg(COLORS); // ✅ JETZT EXISTIERT ES

  return StyleSheet.create({
    
    radarMask: {
      position: "absolute",
      left: 0,
      top: 0,
      width: RADAR_SIZE,
      height: RADAR_SIZE,
      borderRadius: R,
      overflow: "hidden", // <-- nur Map/Content clippen
      backgroundColor: COLORS.bg,
    },
    radarCircle: {
      width: RADAR_SIZE,
      height: RADAR_SIZE,
      borderRadius: R,
      overflow: "visible",
    },

    mapSketchOverlay: {
      ...StyleSheet.absoluteFillObject,
      // “Ink wash” look
      backgroundColor: COLORS.bg === "#000000" ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.18)",
    },


    placePill: {
      maxWidth: 190,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 16,
      backgroundColor: COLORS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
    },
    placePillTxt: { color: COLORS.text, fontWeight: "800", fontSize: 12, maxWidth: 140 },

   modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)", // stärker, damit es “echt modal” wirkt
  },
    modalCard: {
      position: "absolute",
      left: 14,
      right: 14,
      top: 120,
      borderRadius: 18,
      padding: 14,

      backgroundColor: solidCardBg,   // ✅ SOLID statt glassy
      opacity: 1,                     // ✅ safety

      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,

      // ✅ damit iOS/Android sicher über allem liegt
      zIndex: 9999,
      elevation: 20,
    },
    modalTitle: { color: COLORS.text, fontWeight: "900", fontSize: 14, marginBottom: 10 },

    modalInputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: "rgba(255,255,255,0.06)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
    },
    modalInput: { flex: 1, color: COLORS.text, fontWeight: "700" },

    modalBtn: {
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.06)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
    },
    modalBtnTxt: { color: COLORS.text, fontWeight: "900" },

    modalBtnPrimary: {
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.primary ?? "#7C3AED",
    },
    modalBtnPrimaryTxt: { color: "#fff", fontWeight: "900" },

    safe: { flex: 1, backgroundColor: COLORS.bg },

    center: {
      flex: 1,
      backgroundColor: COLORS.bg,
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    },

    sub: { color: COLORS.subtext },
    err: { color: "tomato" },
    link: { color: COLORS.primary ?? "#60A5FA", fontWeight: "800" },

    card: {
      width: "100%",
      maxWidth: 420,
      backgroundColor: COLORS.card,
      borderColor: COLORS.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 18,
      paddingVertical: 18,
      paddingHorizontal: 16,
      alignItems: "center",
    },

    cardIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
      marginBottom: 10,
    },

    cardTitle: {
      color: COLORS.text,
      fontWeight: "800",
      fontSize: 16,
      textAlign: "center",
      marginBottom: 6,
    },

    cardSub: {
      color: COLORS.subtext,
      fontSize: 13,
      textAlign: "center",
      lineHeight: 18,
    },

    toolbar: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: COLORS.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: COLORS.bg,
    },

    toolbarText: { color: COLORS.subtext, fontSize: 13 },
    toolbarStrong: { color: COLORS.text, fontWeight: "800" },
    toolbarMuted: { color: COLORS.subtext },

    radarContainer: { alignItems: "center", paddingVertical: 16, backgroundColor: COLORS.bg },

    pulseOverlay: {
      position: "absolute",
      borderWidth: 2,
      borderColor: COLORS.primary,
      backgroundColor: "transparent",
    },

    blipsLayer: {
      position: "absolute",
      left: 0,
      top: 0,
      width: RADAR_SIZE,
      height: RADAR_SIZE,
      zIndex: 10,
      elevation: 10,

    },

    hintRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 12,
      opacity: 0.9,
    },

    hint: { color: COLORS.subtext },

    emptyOverlay: {
      position: "absolute",
      width: RADAR_SIZE,
      height: RADAR_SIZE,
      alignItems: "center",
      justifyContent: "center",
    },

    listHeader: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: COLORS.border,
      backgroundColor: COLORS.bg,
    },

    listHeaderTxt: { color: COLORS.subtext, fontWeight: "700" },
    resetTxt: { color: COLORS.primary ?? "#60A5FA", fontWeight: "800" },

    row: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: COLORS.border,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: COLORS.bg,
    },

    thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: COLORS.card },

    title: { color: COLORS.text, fontWeight: "800" },
  });
};
