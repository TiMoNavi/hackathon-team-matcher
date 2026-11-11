// App.tsx
// Polyfills für Hermes
import "react-native-gesture-handler";
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import "./src/i18n";

import React, { useEffect, useState } from "react";
import { Animated, PanResponder, Text, StyleSheet, Platform, AppState, Modal, View, TouchableOpacity, useWindowDimensions } from "react-native";
import { NavigationContainer, CommonActions, useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApolloProvider, useApolloClient, gql, useQuery, useMutation } from "@apollo/client";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { AuthVault } from "./src/lib/auth-vault";
import { brand } from "./src/config/brand";

import * as Device from "expo-device";
import { useFonts } from "expo-font";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import { ThemeProvider, useTheme } from "./src/theme/ThemeProvider";
import { apollo } from "./src/apollo";
import { Auth } from "./src/lib/auth";
import { getRequiredUpdateInfo, openStoreUpdate, type AppUpdateInfo } from "./src/lib/appUpdate";
import { useTranslation } from "react-i18next";

import { DefaultTheme as NavDefaultTheme } from "@react-navigation/native";

import GroupsScreen from "./src/screens/GroupsScreen";
import CommunitySpaceScreen from "./src/screens/CommunitySpaceScreen";
import CommunityInfluenceScreen from "./src/screens/CommunityInfluenceScreen";
import FeedScreen from "./src/screens/FeedScreen";
import ExploreScreen from "./src/screens/ExploreScreen";
import ReelsScreen from "./src/screens/ReelsScreen";
import InsightsScreen from "./src/screens/InsightsScreen";
import ProToolsScreen from "./src/screens/ProToolsScreen";
import StoryViewer from "./src/screens/StoryViewer";
import PostDetailScreen from "./src/screens/PostDetailScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import AdminDashboardScreen from "./src/screens/AdminDashboardScreen";
import LanguageSettingsScreen from "./src/screens/LanguageSettingsScreen";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import EditProfileScreen from "./src/screens/EditProfileScreen";
import ProfileUnifiedScreen from "./src/screens/ProfileUnifiedScreen";

import VlogDetailScreen from "./src/screens/VlogDetailScreen";
import NotificationsScreen from "./src/screens/NotificationsScreen";
import ActivityScreen from "./src/screens/ActivityScreen";
import MyVlogsScreen from "./src/screens/MyVlogsScreen";
import BannedScreen from "./src/screens/BannedScreen";
import PostEditScreen from "./src/screens/PostEditScreen";
import TermsScreen from "./src/screens/TermsScreen";
import VlogMembersScreen from "./src/screens/VlogMembersScreen";

import NotificationSettingsScreen from "./src/screens/NotificationSettingsScreen";

// Bestehende (ALT) gerne behalten:
import NewStoryScreen from "./src/screens/NewStoryScreen";
import StoryComposeScreen from "./src/screens/StoryComposeScreen";

import { CreateMediaRoot } from "./src/screens/create";

import { reconcileSession } from "./src/auth/reconcileSession";
import VlogRadarScreen from "./src/screens/VlogRadarScreen";
import EditVlogScreen from "./src/screens/EditVlogScreen";
import BanRouteGuard from "./src/BanRouteGuard";
import BlockedUsersScreen from "./src/screens/BlockedUsersScreen";

import ChatScreen from "./src/screens/ChatScreen";
import MessagesScreen from "./src/screens/MessagesScreen";

import VerifyEmailScreen from "./src/screens/VerifyEmailScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import * as Linking from "expo-linking";

// Error-UI + Bridge
import { ErrorProvider, useError } from "./src/error/ErrorProvider";
import { setErrorHandler } from "./src/error/ErrorSink";
import { createNavigationContainerRef } from "@react-navigation/native";
import { navigationRef } from "./src/navigationRef";
import { getActiveChatThreadId } from "./src/lib/chatPresence";
import ResetPasswordRequestScreen from "./src/screens/ResetPasswordRequestScreen";
import ResetPasswordScreen from "./src/screens/ResetPasswordScreen";
import { warmupMediaLibrary } from "./src/lib/mediaWarmup";
import JoinGroupScreen from "./src/screens/JoinGroupScreen";
import { appScheme, isTrustedWebUrl, linkingPrefixes } from "./src/config/webLinks";
import AsyncStorage from "@react-native-async-storage/async-storage";





async function ensureActiveProfileFromPush(data: any) {
  const targetProfileId = data?.recipientId; // kommt von notify.ts
  if (!targetProfileId) return;

  const active = await AuthVault.active();
  if (active?.profileId === targetProfileId) return;

  const all = await AuthVault.all();
  const targetSession = all.find((s) => s.profileId === targetProfileId);
  if (!targetSession) return;

  // ✅ Session aktivieren
  await AuthVault.setActive(targetSession.sessionId);

  // ✅ Apollo Cache leeren, damit "me" & Queries zum richtigen Token/Profil passen
  await apollo.resetStore().catch(() => {});

  // Optional: UI sauber auf Tabs resetten (damit Navigation konsistent ist)
  const nav = navigationRef.current;
  if (nav) {
    nav.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "Gate" as never }],
      })
    );
  }
}


const REGISTER_PUSH_TOKEN = gql`
  mutation RegisterPushToken($token: String!) {
    registerPushToken(token: $token)
  }
`;
let pendingPushNav: any | null = null;
const IOS_APP_STORE_ID = String(Constants.expoConfig?.extra?.iosAppStoreId ?? "");
const APPSFLYER_DEV_KEY = String(Constants.expoConfig?.extra?.appsFlyerDevKey ?? "");
const APPSFLYER_ENABLED = Constants.expoConfig?.extra?.appsFlyerEnabled === true;

let pendingDeepLink: { route: string; params?: any } | null = null;

function setPendingDeepLinkFromData(data: any) {
  const route = data?.route;
  const params = data?.params ?? {};
  if (route) pendingDeepLink = { route, params };
}

function consumePendingDeepLink() {
  const d = pendingDeepLink;
  pendingDeepLink = null;
  return d;
}


let pushNavInProgressUntil = 0;
function markPushNavInProgress(ms = 1500) {
  pushNavInProgressUntil = Date.now() + ms;
}

function enqueueNav(data: any) {
  pendingPushNav = data;
}

function consumeNav() {
  const d = pendingPushNav;
  pendingPushNav = null;
  return d;
}

async function navigateFromNotificationData(data: any) {
  setPendingDeepLinkFromData(data);
  // ✅ wichtig: erst Profil aktivieren (falls nötig)
  await ensureActiveProfileFromPush(data);

  if (!navigationRef.isReady()) {
    enqueueNav(data);
    return;
  }

  const route = data?.route;
  const params = data?.params ?? {};
  const nav = navigationRef as any;

  if (route) {
    nav.navigate(route as never, params as never);
    return;
  }

  // ✅ DAILY_DIGEST (robust: data.type ODER data.payload.type)
  const digestType = data?.type ?? data?.payload?.type;
  const digestPostIds =
    (Array.isArray(data?.postIds) ? data.postIds : null) ??
    (Array.isArray(data?.payload?.postIds) ? data.payload.postIds : null);

  if (digestType === "DAILY_DIGEST" && digestPostIds?.length) {
    nav.navigate("PostDetail" as never, {
      id: digestPostIds[0],
      postIds: digestPostIds,
      startIndex: 0,
      fromPush: true,
    } as never);
    return;
  }


  if ((data?.kind === "CHAT_MESSAGE" || data?.payload?.kind === "CHAT_MESSAGE") && data?.threadId) {
    nav.navigate("Chat" as never, {
      threadId: data.threadId,
      title: data?.title ?? "Chat",
    } as never);
    return;
  }

  if (data?.postId) {
    nav.navigate("PostDetail" as never, {
      id: data.postId,
      postIds: [data.postId],
      startIndex: 0,
    } as never);
    return;
  }

  nav.navigate("Activity" as never);
}

function flushPendingNav() {
  if (!navigationRef.isReady()) return;
  const d = consumeNav();
  if (d) void navigateFromNotificationData(d);
}

/** Holt Token + sendet an Backend (nur wenn eingeloggt) + Tap Navigation */
function PushInit() {
  const [registerPushToken] = useMutation(REGISTER_PUSH_TOKEN);

  

  useEffect(() => {
    let sub: Notifications.Subscription | null = null;
    let unsubAuth: any = null;

    const getAuth = async () => {
      try {
        const t = await (Auth as any)?.get?.();
        const p = await (Auth as any)?.getProfileId?.();
        return { t, p };
      } catch (e) {
        console.log("❌ Auth.get failed in PushInit:", e);
        return { t: null, p: null };
      }
    };

    (async () => {
      if (!Device.isDevice) {
        console.log("❌ Push notifications only run on physical devices, not simulators.");
        return;
      }


      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.MAX,
        });
      }

      const perm = await Notifications.getPermissionsAsync();
      let status = perm.status;
      if (status !== "granted") {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      if (status !== "granted") {
        console.log("❌ Push Permission abgelehnt.");
        return;
      }

      const projectId =
        (Constants.expoConfig as any)?.extra?.eas?.projectId ??
        (Constants as any)?.easConfig?.projectId;
      if (!projectId) {
        console.log("ℹ️ Push token skipped: no EAS projectId configured.");
        return;
      }

      let token: string;
      try {
        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      } catch (e) {
        console.log("❌ getExpoPushTokenAsync failed:", e);
        return;
      }

      console.log("✅ ExpoPushToken:", token);

      // ✅ wenn schon eingeloggt: sofort registrieren
      const { t, p } = await getAuth();
      if (t && p) {
        try {
          await registerPushToken({ variables: { token } });
          console.log("✅ PushToken im Backend registriert.");
        } catch (e) {
          console.log("❌ registerPushToken failed:", e);
        }
      } else {
        console.log("ℹ️ Nicht eingeloggt → registriere Token nach Login.");
        unsubAuth = (Auth as any)?.onChange?.(async () => {
          const { t, p } = await getAuth();
          if (t && p) {
            try {
              await registerPushToken({ variables: { token } });
              console.log("✅ PushToken im Backend registriert (nach Login).");
            } catch (e) {
              console.log("❌ registerPushToken failed:", e);
            }
            unsubAuth?.();
          }
        });
      }

      // Tap Listener
      let handledLast = false;

      sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
        // nur echtes Tap-Open
        if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

        const data: any = response.notification.request.content.data;

        // wichtig: clear, damit es beim nächsten Start nicht wiederkommt
        await Notifications.clearLastNotificationResponseAsync();

        await navigateFromNotificationData(data);
      });

      // Cold start: nur 1x und nur echtes Tap-Open
      const last = await Notifications.getLastNotificationResponseAsync();

      if (
        !handledLast &&
        last &&
        last.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
      ) {
        handledLast = true;

        // erst clearen, dann handeln (verhindert Ghost routing)
        await Notifications.clearLastNotificationResponseAsync();

        const lastData: any = last.notification.request.content.data;
        if (lastData) {
          await navigateFromNotificationData(lastData);
        }
      }


      

    })();

    return () => {
      sub?.remove();
      unsubAuth?.();
    };
  }, [registerPushToken]);

  return null;
}


/* ---------------- Existing App code ---------------- */

const ME_QUERY = gql`query { me { id username } }`;
const AUTH_STATE_Q = gql`
  query AuthStateGate {
    me {
      id
      city
      onboardingCompletedAt
      account { id emailVerifiedAt phoneVerifiedAt }
    }
  }
`;


function UserProfileGate({ route, navigation }: any) {
  const { data: meQ } = useQuery(ME_QUERY, { fetchPolicy: "cache-first" });

  const myId = meQ?.me?.id ?? null;
  const myUsername = meQ?.me?.username ?? null;

  const userIdParam: string | null = route?.params?.userId ?? null;
  const usernameParam: string | null = route?.params?.username ?? null;

  const isMe =
    (!!myId && !!userIdParam && myId === userIdParam) ||
    (!!myUsername && !!usernameParam && myUsername === usernameParam);

  useEffect(() => {
    if (isMe) {
      navigation.dispatch(CommonActions.navigate("AppTabs", { screen: "Profile" }));
    } else {
      navigation.replace("UserProfile$inner", route.params);
    }
  }, [isMe, myId, myUsername, userIdParam, usernameParam, navigation, route?.params]);

  return null;
}

const Tab = createBottomTabNavigator();
const ProfileStack = createNativeStackNavigator();

/** ---------- Types ---------- */
export type StorySlide = { id: string; uri: string; caption?: string; when?: string };
export type RootStackParamList = {
  Gate: undefined;
  VerifyEmail: undefined;
  Onboarding: undefined;
  JoinGroup: { slug: string };

  AppTabs: undefined;
  StoryViewer: {
    user: { username: string; avatar: string };
    slides: StorySlide[];
    startIndex?: number;
    onViewed?: (storyId: string) => void;
  };
  NewStory: undefined;
  StoryCompose: undefined;
  CreateMedia: { initialMode?: "BEITRAG" | "STORY"; nonce?: number; sharePostId?: string | null } | undefined;
  UserProfile: { userId?: string; username?: string } | undefined;
  "UserProfile$inner": { userId?: string; username?: string } | undefined;
  Login: { asAddAccount?: boolean };
  Register: { asAddAccount?: boolean };
  Groups: undefined;
  CommunitySpace: { id: string; title?: string; slug?: string; type?: string };
  CommunityInfluence: undefined;

  VlogDetail: { id: string; slug?: string; highlightPostId?: string; fromPush?: boolean; fromActivity?: boolean };
  Notifications: undefined;
  Activity: undefined;
  MyVlogs: undefined;
  VlogRadar: undefined;
  PostEdit: undefined;
  EditVlog: undefined;
  VlogMembers: undefined;
  Terms: { version: number };
  Banned: { untilISO: any; reason: any };
  BlockedUsers: undefined;
  AdminDashboard: undefined;

  Messages: undefined;
  Chat: { threadId: string; title?: string; initialDraft?: string };
  NewMessage: undefined;

  NotificationSettings: undefined;
  LanguageSettings: undefined;

  PostDetail: any;
  Auth: { asAddAccount?: boolean; start?: "login" | "register" };
};

type AuthStackProps = NativeStackScreenProps<RootStackParamList, "Auth">;

// AuthStack ParamList
export type AuthStackParamList = {
  Login: { asAddAccount?: boolean };
  Register: { asAddAccount?: boolean };
  ResetPasswordRequest: { asAddAccount?: boolean };
  ResetPassword: { asAddAccount?: boolean; emailOrUsername?: string };
};

const AuthStackNav = createNativeStackNavigator<AuthStackParamList>();

const TERMS_Q = gql`
  query TermsGate {
    currentTermsVersion
    me { id termsVersionAccepted }
  }
`;

async function fetchTermsOnce(client: any) {
  const [t, p] = await Promise.all([Auth.get(), Auth.getProfileId()]);
  if (!t || !p) return;
  await client.query({ query: TERMS_Q, fetchPolicy: "network-only" });
}

function TermsRouteGuard() {
  const client = useApolloClient();

  React.useEffect(() => {
    fetchTermsOnce(client);
  }, [client]);

  React.useEffect(() => {
    const unsub = Auth.onChange?.(async () => {
      try { await client.clearStore(); } catch {}
      await fetchTermsOnce(client);
      //runGuard();
    });
    return () => unsub?.();
  }, [client]);

  const runGuard = React.useCallback(() => {
    const nav = navigationRef.current;
    if (!nav) return;

    Promise.all([Auth.get(), Auth.getProfileId()]).then(async ([t, p]) => {
      if (!t || !p) return;

      const { data } = await client.query({
        query: TERMS_Q,
        fetchPolicy: "cache-first",
      });

      const current = data?.currentTermsVersion ?? 1;
      const accepted = data?.me?.termsVersionAccepted ?? 0;

      const routeName = nav.getCurrentRoute?.()?.name;

      if (accepted < current) {
        if (routeName !== "Terms") nav.navigate("Terms", { version: current });
      } else {
        if (routeName === "Terms") nav.goBack();
      }
    });
  }, [client]);

  (global as any).__termsGuardRun = runGuard;

  return null;
}

function AuthStackWrapper({ route }: NativeStackScreenProps<RootStackParamList, "Auth">) {
  const { theme } = useTheme();
  const C = theme.colors as any;
  const { asAddAccount, start } = route.params ?? {};

  return (
    <AuthStackNav.Navigator
      screenOptions={{
        headerShown: false,
        presentation: "card",
        statusBarTranslucent: false,
        contentStyle: { backgroundColor: C.bg },
      }}
      initialRouteName={start === "register" ? "Register" : "Login"}
    >
      <AuthStackNav.Screen
        name="Login"
        component={LoginScreen}
        initialParams={{ asAddAccount }}
      />
      <AuthStackNav.Screen
        name="Register"
        component={RegisterScreen}
        initialParams={{ asAddAccount }}
      />

      <AuthStackNav.Screen
        name="ResetPasswordRequest"
        component={ResetPasswordRequestScreen}
      />

      <AuthStackNav.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
      />

    </AuthStackNav.Navigator>
  );
}

/** ---------- Profile-Stack ---------- */
function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileUnifiedScreen} />
      <ProfileStack.Screen name="Insights" component={InsightsScreen} />
      <ProfileStack.Screen name="ProTools" component={ProToolsScreen} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} />
      <ProfileStack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <ProfileStack.Screen name="LanguageSettings" component={LanguageSettingsScreen} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />
    </ProfileStack.Navigator>
  );
}

function colorWithAlpha(color: string, alpha: number) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type FabCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";



function Tabs() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [momentsFabCorner, setMomentsFabCorner] = React.useState<FabCorner>("bottom-right");
  const [activeTabName, setActiveTabName] = React.useState("Home");
  const momentsFabDrag = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const showMomentsFab = activeTabName !== "Vlogs";

  const TAB_COLORS = {
    bg: theme.colors.bg,
    border: theme.colors.border,
    active: theme.colors.text,
    inactive: theme.colors.subtext,
    primary: theme.colors.primary,
  };

  const baseTabBarStyle = {
    backgroundColor: TAB_COLORS.bg,
    borderWidth: 0,
    borderTopColor: theme.mode === "dark" ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.045)",
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 0,
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  } as const;
  const momentsFabSize = 58;
  const momentsFabMargin = 18;
  const momentsFabBottomOffset = Math.max(insets.bottom + 72, 90);
  const momentsFabTop = insets.top + momentsFabMargin;
  const momentsFabBottom = Math.max(momentsFabTop, height - momentsFabBottomOffset - momentsFabSize);
  const momentsFabLeft = momentsFabMargin;
  const momentsFabRight = Math.max(momentsFabLeft, width - momentsFabMargin - momentsFabSize);
  const momentsFabBase = React.useMemo(() => {
    const isTop = momentsFabCorner.startsWith("top");
    const isLeft = momentsFabCorner.endsWith("left");
    return {
      left: isLeft ? momentsFabLeft : momentsFabRight,
      top: isTop ? momentsFabTop : momentsFabBottom,
    };
  }, [momentsFabBottom, momentsFabCorner, momentsFabLeft, momentsFabRight, momentsFabTop]);
  const momentsFabPanResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6,
        onPanResponderGrant: () => {
          momentsFabDrag.stopAnimation();
          momentsFabDrag.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event(
          [null, { dx: momentsFabDrag.x, dy: momentsFabDrag.y }],
          { useNativeDriver: false }
        ),
        onPanResponderRelease: (_event, gesture) => {
          const centerX = momentsFabBase.left + gesture.dx + momentsFabSize / 2;
          const centerY = momentsFabBase.top + gesture.dy + momentsFabSize / 2;
          setMomentsFabCorner(`${centerY < height / 2 ? "top" : "bottom"}-${centerX < width / 2 ? "left" : "right"}` as FabCorner);
          Animated.spring(momentsFabDrag, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            damping: 18,
            stiffness: 260,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(momentsFabDrag, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            damping: 18,
            stiffness: 260,
          }).start();
        },
      }),
    [height, momentsFabBase.left, momentsFabBase.top, momentsFabDrag, width]
  );

  return (
    <View style={{ flex: 1 }}>
    <Tab.Navigator
      screenListeners={({ route }) => ({
        focus: () => setActiveTabName(route.name),
      })}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: TAB_COLORS.active,
        tabBarInactiveTintColor: TAB_COLORS.inactive,
        tabBarShowLabel: true,
        tabBarLabel: ({ focused, color }) => {
          if (route.name === "CreateTab" || route.name === "Vlogs") return null;
          if (route.name === "MessagesTab") {
            return (
              <Text
                numberOfLines={1}
                style={{
                  color,
                  fontSize: 11,
                  fontWeight: focused ? "700" : "600",
                  marginTop: 2,
                }}
              >
                Chats
              </Text>
            );
          }

          const labelKey =
            route.name === "Home"
              ? "tabs.home"
              : route.name === "Explore"
                ? "tabs.explore"
                : route.name === "Profile"
                    ? "tabs.profile"
                    : "";

          return (
            <Text
              numberOfLines={1}
              style={{
                color,
                fontSize: 11,
                fontWeight: focused ? "700" : "600",
                marginTop: 2,
              }}
            >
              {labelKey ? t(labelKey) : ""}
            </Text>
          );
        },
        tabBarIconStyle: { marginTop: 0 },
        tabBarItemStyle: { justifyContent: "center" },
        tabBarStyle: [
          baseTabBarStyle,
          { height: 80, paddingTop: 10, paddingBottom: 10, borderWidth: 0, borderTopWidth: StyleSheet.hairlineWidth },
        ],
        tabBarIcon: ({ focused, color, size }) => {
          const s = size ?? 24;

          switch (route.name) {
            case "Home":
              return <Ionicons name={focused ? "home" : "home-outline"} size={s} color={color} />;
            case "Explore":
              return <Ionicons name={focused ? "search" : "search-outline"} size={s} color={color} />;
            case "CreateTab":
              return (
                <View
                  style={{
                    width: s + 14,
                    height: s + 14,
                    borderRadius: (s + 14) / 2,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: TAB_COLORS.primary,
                    marginTop: 6,
                  }}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: s + 8,
                      fontWeight: "600",
                      lineHeight: s + 10,
                      marginTop: -2,
                    }}
                  >
                    +
                  </Text>
                </View>
              );
            case "MessagesTab":
              return <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={s + 1} color={color} />;
            case "Vlogs":
              return <Ionicons name={focused ? "aperture" : "aperture-outline"} size={s} color={color} />

            case "Profile":
              return <Ionicons name={focused ? "person" : "person-outline"} size={s} color={color} />;
            default:
              return <Ionicons name="ellipse" size={s} color={color} />;
          }
        },
      })}
    >
      <Tab.Screen name="Home" component={FeedScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen
        name="CreateTab"
        component={ExploreScreen}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            event.preventDefault();
            navigation.getParent()?.navigate("CreateMedia", { initialMode: "BEITRAG", nonce: Date.now() });
          },
        })}
      />
      <Tab.Screen name="MessagesTab" component={MessagesScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={ProfileStackScreen} />
      <Tab.Screen
        name="Vlogs"
        component={ReelsScreen}
        options={{
          tabBarButton: () => null,
          tabBarItemStyle: { display: "none" },
        }}
      />
    </Tab.Navigator>
      {showMomentsFab ? (
      <Animated.View
        {...momentsFabPanResponder.panHandlers}
        style={{
          position: "absolute",
          left: momentsFabBase.left,
          top: momentsFabBase.top,
          transform: momentsFabDrag.getTranslateTransform(),
        }}
      >
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => navigation.navigate("AppTabs", { screen: "Vlogs" })}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("tabs.moments")}
          style={{
            width: momentsFabSize,
            height: momentsFabSize,
            borderRadius: momentsFabSize / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colorWithAlpha(TAB_COLORS.primary, 0.72),
            shadowColor: "#000",
            shadowOpacity: theme.mode === "dark" ? 0.28 : 0.18,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }}
        >
          <Ionicons name="aperture" size={42} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
      ) : null}
    </View>
  );
}
let lastJoinSlugSeen: string | null = null;
let lastJoinSeenAt = 0;

function firstQueryValue(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

function joinSlugFromUrl(url: string) {
  try {
    const parsed = Linking.parse(url);
    const path = parsed.path ?? "";
    const parts = path.split("/").filter(Boolean);
    const i = parts[0] === "--" ? 1 : 0;
    const queryParams = parsed.queryParams as Record<string, unknown> | undefined;
    let rawHost = "";
    let rawParts: string[] = [];
    let rawQuerySlug: string | null = null;

    try {
      const raw = new URL(url);
      rawHost = raw.hostname;
      rawParts = raw.pathname.split("/").filter(Boolean);
      rawQuerySlug =
        raw.searchParams.get("slug") ||
        raw.searchParams.get("deep_link_sub1") ||
        raw.searchParams.get("af_sub1") ||
        raw.searchParams.get("sub1");
    } catch {}

    const qSlug =
      firstQueryValue(queryParams?.slug) ??
      firstQueryValue(queryParams?.deep_link_sub1) ??
      firstQueryValue(queryParams?.af_sub1) ??
      firstQueryValue(queryParams?.sub1) ??
      rawQuerySlug;

    const rawJoinIndex = rawParts[0] === "--" ? 1 : rawParts.indexOf("join");
    const slug =
      (qSlug ? qSlug : null) ??
      (parts[i] === "join" && parts[i + 1] ? parts[i + 1] : null) ??
      (rawHost === "join" && rawParts[0] ? rawParts[0] : null) ??
      (rawJoinIndex >= 0 && rawParts[rawJoinIndex + 1] ? rawParts[rawJoinIndex + 1] : null);

    return slug;
  } catch (e) {
    console.log("DeepLink parse failed:", e);
    return null;
  }
}

function setPendingDeepLinkFromUrl(url: string) {
  console.log("DEEPLINK IN:", url);
  const slug = joinSlugFromUrl(url);
  if (slug) {
      // ✅ Dedup: Expo sendet initial + event fast hintereinander
      if (__DEV__) {
        const now = Date.now();
        if (lastJoinSlugSeen === slug && now - lastJoinSeenAt < 2000) return;
        lastJoinSlugSeen = slug;
        lastJoinSeenAt = now;
      }

      pendingDeepLink = { route: "JoinGroup", params: { slug } };
      void persistPendingJoinSlug(slug);
      return;
  }
}

const PENDING_JOIN_KEY = "pending_join_slug_v1";

async function persistPendingJoinSlug(slug: string) {
  try { await AsyncStorage.setItem(PENDING_JOIN_KEY, slug); } catch {}
}

async function consumePendingJoinSlug() {
  try {
    const v = await AsyncStorage.getItem(PENDING_JOIN_KEY);
    if (v) await AsyncStorage.removeItem(PENDING_JOIN_KEY);
    return v;
  } catch {
    return null;
  }
}

function setPendingJoinFromSlug(slug: string) {
  if (!slug) return;
  pendingDeepLink = { route: "JoinGroup", params: { slug } };
  void persistPendingJoinSlug(slug); // <-- neu
}



/** ---------- Gate: entscheidet Auth vs. App ---------- */
function Gate() {
  const client = useApolloClient();
  const [ready, setReady] = useState(false);

  const decide = React.useCallback(async () => {
    const nav = navigationRef.current;
    const current = nav?.getCurrentRoute?.()?.name;

    let [t, p] = await Promise.all([Auth.get(), Auth.getProfileId()]);

    // Local logout/no-session state should not trigger network-only auth checks.
    if (!t || !p) {
      setReady(true);
      if (nav && current !== "Auth") {
        nav.reset({
          index: 0,
          routes: [
            { name: "Auth" as never, params: { start: "login", asAddAccount: false } as never },
          ],
        });

      }
      return;
    }

    await reconcileSession();
    [t, p] = await Promise.all([Auth.get(), Auth.getProfileId()]);

    // Reconcile may remove an invalid/stale session.
    if (!t || !p) {
      setReady(true);
      if (nav && current !== "Auth") {
        nav.reset({
          index: 0,
          routes: [
            { name: "Auth" as never, params: { start: "login", asAddAccount: false } as never },
          ],
        });
      }
      return;
    }

    // eingeloggt → AuthState laden
    let data: any = null;
    try {
      const r = await client.query({
        query: AUTH_STATE_Q,
        fetchPolicy: "network-only",
      });
      data = r.data;
    } catch (e) {
      // wenn query fehlschlägt: zumindest Tabs zeigen (sonst lockout)
      console.log("Gate authState query failed:", e);
      setReady(true);
      if (nav) nav.reset({ index: 0, routes: [{ name: "Gate" as never }] });
      return;
    }

    const me = data?.me;
    const emailVerifiedAt = me?.account?.emailVerifiedAt ?? null;
    const phoneVerifiedAt = me?.account?.phoneVerifiedAt ?? null;
    const accountVerified = !!emailVerifiedAt || !!phoneVerifiedAt;
    const onboardingCompletedAt = me?.onboardingCompletedAt ?? null;

    setReady(true);

    if (!accountVerified) {
      if (nav && current !== "VerifyEmail") nav.reset({ index: 0, routes: [{ name: "VerifyEmail" as never }] });
      return;
    }

    if (!onboardingCompletedAt) {
      if (nav && current !== "Onboarding") nav.reset({ index: 0, routes: [{ name: "Onboarding" as never }] });
      return;
    }

    setReady(true);
    console.log("GATE READY. pendingDeepLink BEFORE consume =", pendingDeepLink);
    const stored = await consumePendingJoinSlug();
    if (stored && (!pendingDeepLink || pendingDeepLink.route !== "JoinGroup")) {
      pendingDeepLink = { route: "JoinGroup", params: { slug: stored } };
    }

    const dl = consumePendingDeepLink();
    console.log("GATE consumed dl =", dl);

if (nav) {
  // ✅ Wenn es ein JoinGroup DeepLink ist → IMMER JoinGroup als zweite Route pushen
  if (dl?.route === "JoinGroup" && dl?.params?.slug) {
    nav.reset({
      index: 1,
      routes: [
        { name: "AppTabs" as never },
        { name: "JoinGroup" as never, params: dl.params as never },
      ],
    });
    return;
  }

    // ✅ sonst: bestehendes Verhalten (falls du später weitere DeepLinks hast)
    if (dl?.route) {
      nav.reset({
        index: 1,
        routes: [
          { name: "AppTabs" as never },
          { name: dl.route as never, params: dl.params as never },
        ],
      });
      return;
    }

    nav.reset({ index: 0, routes: [{ name: "AppTabs" as never }] });
  }
  return;


    //if (nav && current !== "AppTabs") nav.reset({ index: 0, routes: [{ name: "AppTabs" as never }] });
  }, [client]);

  useEffect(() => {
    void decide();
  }, [decide]);

  useEffect(() => {
    const unsub = Auth.onChange?.(async () => {
      try {
        await client.clearStore();
      } catch {}
      void decide();
    });
    return () => unsub?.();
  }, [client, decide]);

  if (!ready) return null;
  return null; // Gate navigiert per reset, rendert selbst nichts
}


function ErrorBridge() {
  const { showError } = useError();
  React.useEffect(() => {
    setErrorHandler(showError);
  }, [showError]);
  return null;
}



async function shouldAcceptInitialUrl(initialUrl: string) {
  // ✅ Prod / echte Schemes immer akzeptieren
  if (initialUrl.startsWith(`${appScheme}://`)) return true;
  if (isTrustedWebUrl(initialUrl)) return true;


  // Expo Go can start with sticky exp:// URLs. Only accept them when they
  // explicitly carry a local invite route such as /--/join/GROUP_SLUG.
  if (__DEV__ && initialUrl.startsWith("exp://")) return !!joinSlugFromUrl(initialUrl);

  return false;
}


let deepLinkNavInFlight = false;

function flushPendingDeepLinkIfReady() {
  if (deepLinkNavInFlight) return;
  if (!navigationRef.isReady()) return;

  const nav = navigationRef.current as any;
  if (!nav) return;

  const dl = pendingDeepLink;
  if (!dl?.route) return;

  const current = nav.getCurrentRoute?.()?.name;
  if (current === "Gate" || current === "Auth" || current === "Onboarding" || current === "VerifyEmail") {
    return;
  }

  deepLinkNavInFlight = true;

  requestAnimationFrame(() => {
    try {
      const n = navigationRef.current as any;
      if (!n) return;

      const cur = n.getCurrentRoute?.()?.name;
      if (dl.route === "JoinGroup" && cur === "JoinGroup") {
        pendingDeepLink = null;
        return;
      }

      if (dl.route === "JoinGroup" && dl.params?.slug) {
        n.dispatch(
          CommonActions.reset({
            index: 1,
            routes: [
              { name: "AppTabs" as never },
              { name: "JoinGroup" as never, params: dl.params as never },
            ],
          })
        );
        pendingDeepLink = null; // ✅ erst nach dispatch löschen
        return;
      }

      // optional fallback:
      n.navigate(dl.route as never, dl.params as never);
      pendingDeepLink = null;
    } finally {
      setTimeout(() => { deepLinkNavInFlight = false; }, 400);
    }
  });
}





function ThemedRootNavigator({
  onNavStateChange,
}: {
  onNavStateChange: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const C = theme.colors as any;

  const linking = {
    prefixes: linkingPrefixes,
    config: {
      screens: {
        JoinGroup: "join/:slug",
        // optional später:
        // UserProfile: "u/:username",
      },
    },
  };



  // Optional, aber gut: NavigationContainer Theme background = C.bg
  const navTheme = React.useMemo(
    () => ({
      ...NavDefaultTheme,
      colors: {
        ...NavDefaultTheme.colors,
        background: C.bg,
        card: C.bg,
      },
    }),
    [C.bg]
  );

  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      setPendingDeepLinkFromUrl(url);
      flushPendingDeepLinkIfReady();
    });

    (async () => {
      const initialUrl = await Linking.getInitialURL();
      if (!initialUrl) return;
      const ok = await shouldAcceptInitialUrl(initialUrl);
      if (!ok) return;
      setPendingDeepLinkFromUrl(initialUrl);
      flushPendingDeepLinkIfReady();

    })();

    return () => sub.remove();
  }, []);


  useEffect(() => {
    if (!APPSFLYER_ENABLED) return;

    if (!APPSFLYER_DEV_KEY) {
      console.log("AppsFlyer skipped: missing dev key.");
      return;
    }

    if (Platform.OS === "ios" && !IOS_APP_STORE_ID) {
      console.log("AppsFlyer skipped: missing iOS App Store ID.");
      return;
    }

    let appsFlyer: any;
    try {
      appsFlyer = require("react-native-appsflyer").default;
    } catch (e) {
      console.log("AppsFlyer skipped: native module is not available.", e);
      return;
    }

    appsFlyer.initSdk(
      {
        devKey: APPSFLYER_DEV_KEY,
        ...(Platform.OS === "ios" ? { appId: IOS_APP_STORE_ID } : {}),
        isDebug: __DEV__,
        onDeepLinkListener: true,
        timeToWaitForATTUserAuthorization: 60,
      },
      (res: any) => console.log("AppsFlyer init ok", res),
      (err: any) => console.log("AppsFlyer init err", err)
    );

    const unsub = appsFlyer.onDeepLink((res: any) => {
      try {
        const status = res?.deepLinkStatus;
        const dl = res?.data;

        console.log("AF onDeepLink:", { status, dl });

        if (status !== "FOUND") return;

        const slug =
          dl?.deep_link_sub1 ||
          dl?.deep_link_sub2 ||
          dl?.sub1 ||
          dl?.af_sub1 ||
          dl?.slug;

        if (typeof slug === "string" && slug.trim()) {
          setPendingJoinFromSlug(slug.trim());
          flushPendingDeepLinkIfReady();
        }
      } catch (e) {
        console.log("AF onDeepLink parse failed:", e);
      }
    });

    return () => {
      try {
        const cleanup = unsub as any;
        if (typeof cleanup === "function") cleanup();
        else if (cleanup?.remove) cleanup.remove();
      } catch {}
    };
  }, []);



  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        onNavStateChange();
        flushPendingNav();
      }}
      onStateChange={() => {
        onNavStateChange();
        flushPendingNav();
      }}
      theme={navTheme}
    >
      <PushInit />
      <ErrorBridge />
      <TermsRouteGuard />
      <BanRouteGuard />

      <Root.Navigator
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          statusBarTranslucent: false,

          // ✅ DAS ist der entscheidende Fix (theme-basiert)
          contentStyle: { backgroundColor: C.bg },
        }}
        initialRouteName="Gate"
      >
        <Root.Screen name="Gate" component={Gate} />
        <Root.Screen name="Groups" component={GroupsScreen} options={{ headerShown: false }} />
        <Root.Screen name="CommunitySpace" component={CommunitySpaceScreen} options={{ headerShown: false }} />
        <Root.Screen name="CommunityInfluence" component={CommunityInfluenceScreen} options={{ headerShown: false }} />


        <Root.Screen
          name="JoinGroup"
          component={JoinGroupScreen}
          options={{ headerShown: false, presentation: "modal" }}
        />


        <Root.Screen name="VerifyEmail" component={VerifyEmailScreen} options={{ headerShown: false }} />
        <Root.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />

        <Root.Screen
          name="StoryViewer"
          component={StoryViewer}
          options={{
            presentation: "fullScreenModal",
            contentStyle: { backgroundColor: C.bg }, // ✅ wichtig für Modals
          }}
        />

        <Root.Screen
          name="CreateMedia"
          component={CreateMediaRoot}
          options={{
            headerShown: false,
            animation: "none",
            contentStyle: { backgroundColor: C.bg },
          }}
        />

        <Root.Screen
          name="StoryCompose"
          component={StoryComposeScreen}
          options={{
            headerShown: false,
            presentation: "fullScreenModal",
            contentStyle: { backgroundColor: C.bg }, // ✅
          }}
        />

        <Root.Screen name="Terms" component={TermsScreen} options={{ headerShown: false }} />
        <Root.Screen name="NewStory" component={NewStoryScreen} options={{ headerShown: false }} />
        <Root.Screen name="EditVlog" component={EditVlogScreen} options={{ headerShown: false }} />

        <Root.Screen
          name="VlogMembers"
          component={VlogMembersScreen}
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />


        <Root.Screen
          name="Banned"
          component={BannedScreen}
          options={{
            headerShown: false,
            presentation: "fullScreenModal",
            gestureEnabled: false,
            contentStyle: { backgroundColor: C.bg }, // ✅
          }}
        />

        <Root.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
        <Root.Screen name="Messages" component={MessagesScreen} options={{ headerShown: false }} />
        <Root.Screen name="BlockedUsers" component={BlockedUsersScreen} options={{ headerShown: false }} />

        <Root.Screen name="UserProfile" component={UserProfileGate} options={{ headerShown: false }} />
        <Root.Screen name="UserProfile$inner" component={ProfileUnifiedScreen} options={{ headerShown: false }} />

        <Root.Screen
          name="PostDetail"
          component={PostDetailScreen}
          options={{
            animation: "slide_from_right",
            headerShown: false,
            contentStyle: { backgroundColor: C.bg }, // ✅
          }}
        />

        <Root.Screen name="VlogDetail" component={VlogDetailScreen} options={{ headerShown: false }} />
        <Root.Screen name="MyVlogs" component={MyVlogsScreen} options={{ title: t("myvlogs.title") }} />
        <Root.Screen name="VlogRadar" component={VlogRadarScreen} options={{ headerShown: true }} />
        <Root.Screen name="PostEdit" component={PostEditScreen} />
        <Root.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
        <Root.Screen name="Activity" component={ActivityScreen} options={{ headerShown: false }} />
        <Root.Screen
          name="NotificationSettings"
          component={NotificationSettingsScreen}
          options={{ headerShown: false }}
        />
        <Root.Screen
          name="LanguageSettings"
          component={LanguageSettingsScreen}
          options={{ headerShown: false }}
        />
        <Root.Screen name="AppTabs" component={Tabs} />

        <Root.Screen
          name="Auth"
          component={AuthStackWrapper}
          options={({ route }) => {
            const asAddAccount = (route.params as any)?.asAddAccount ?? false;

            return {
              presentation: asAddAccount ? "modal" : "card",
              headerShown: false,
              statusBarTranslucent: false,
              contentStyle: { backgroundColor: C.bg },
            }
          }}
        />
      </Root.Navigator>
    </NavigationContainer>
  );
}


/** ---------- Root ---------- */
const Root = createNativeStackNavigator<RootStackParamList>();

function RequiredUpdateOverlay() {
  const client = useApolloClient();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const C = theme.colors as any;
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const checkingRef = React.useRef(false);

  const checkForRequiredUpdate = React.useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const next = await getRequiredUpdateInfo(client, { appSlug: brand.appSlug });
      setUpdateInfo(next);
    } catch (e) {
      console.warn("required update check failed", e);
    } finally {
      checkingRef.current = false;
    }
  }, [client]);

  useEffect(() => {
    const t = setTimeout(() => {
      void checkForRequiredUpdate();
    }, 1200);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkForRequiredUpdate();
    });

    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [checkForRequiredUpdate]);

  if (!updateInfo) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={requiredUpdateStyles.backdrop}>
        <View style={[requiredUpdateStyles.card, { backgroundColor: C.bg, borderColor: C.border }]}>
          <View style={[requiredUpdateStyles.iconWrap, { backgroundColor: C.card, borderColor: C.border }]}>
            <Ionicons name="sparkles" size={24} color={C.primary} />
          </View>

          <Text style={[requiredUpdateStyles.title, { color: C.text }]}>{t("requiredUpdate.title")}</Text>
          <Text style={[requiredUpdateStyles.body, { color: C.subtext }]}>
            {t("requiredUpdate.body", { appName: brand.appName })}
          </Text>

          <View style={[requiredUpdateStyles.versionRow, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[requiredUpdateStyles.versionLabel, { color: C.subtext }]}>{t("requiredUpdate.installed")}</Text>
            <Text style={[requiredUpdateStyles.versionValue, { color: C.text }]}>
              {updateInfo.currentVersion}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={C.subtext} />
            <Text style={[requiredUpdateStyles.versionLabel, { color: C.subtext }]}>{t("requiredUpdate.new")}</Text>
            <Text style={[requiredUpdateStyles.versionValue, { color: C.primary }]}>
              {updateInfo.storeVersion}
            </Text>
          </View>

          <TouchableOpacity
            style={[requiredUpdateStyles.updateButton, { backgroundColor: C.primary }]}
            activeOpacity={0.86}
            onPress={() => openStoreUpdate(updateInfo)}
          >
            <Ionicons name="open-outline" size={18} color="#fff" />
            <Text style={requiredUpdateStyles.updateText}>{t("requiredUpdate.updateNow")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque: require("./assets/fonts/BricolageGrotesque.ttf"),
    Cookie: require("./assets/fonts/Cookie-Regular.ttf"),
    Pacifico: require("./assets/fonts/Pacifico-Regular.ttf"),
  });

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data: any = notification?.request?.content?.data;

        // deine Activity-Payload ist teils in data.payload
        const kind =
          data?.kind ||
          data?.payload?.kind ||
          data?.payload?.type; // bei dir DAILY_DIGEST

        // ✅ Chat Push unterdrücken, wenn genau dieser Thread offen ist
        if (kind === "CHAT_MESSAGE") {
          const threadId = data?.threadId || data?.payload?.threadId;
          const active = getActiveChatThreadId();
          if (active && threadId && String(active) === String(threadId)) {
            return {
              shouldShowAlert: false,
              shouldShowBanner: false,
              shouldShowList: false,
              shouldPlaySound: false,
              shouldSetBadge: false,
            };
          }
        }

        // default: anzeigen
        return {
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        };
      },
    });
  }, []);

  const onNavStateChange = React.useCallback(() => {
    const fn = (global as any).__termsGuardRun;
    const b = (global as any).__banGuardRun;
    if (typeof fn === "function") fn();
    if (typeof b === "function") b();

     // ✅ Warmup sobald Create “in Sicht” ist (Tab oder Modal)
    try {
      const r = navigationRef.current?.getCurrentRoute?.();
      const name = r?.name; // type: keyof RootStackParamList | undefined

      if (name === "CreateMedia" || name === "AppTabs") {
        warmupMediaLibrary();
      }
    } catch {}
  }, []);

  useEffect(() => {
    apollo.clearStore().catch(() => {});
  }, []);

  if (!fontsLoaded) return null;

  return (
  <ErrorProvider>
    <ApolloProvider client={apollo}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <ThemedRootNavigator onNavStateChange={onNavStateChange} />
            <RequiredUpdateOverlay />
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ApolloProvider>
  </ErrorProvider>
);

}

const requiredUpdateStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  card: {
    width: "100%",
    maxWidth: 390,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 21,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 16,
  },
  versionRow: {
    width: "100%",
    minHeight: 42,
    borderRadius: 21,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginBottom: 16,
  },
  versionLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  versionValue: {
    fontSize: 13,
    fontWeight: "900",
  },
  updateButton: {
    width: "100%",
    minHeight: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  updateText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 17,
  },
});
