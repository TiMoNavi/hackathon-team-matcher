// apps/server/src/lib/notify.ts
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { DEFAULTS } from "../resolvers/notificationSettingsResolvers";
import { visiblePostWhere } from "./postVisibility";

export type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;
type PushData = Record<string, any>;

/** 
 * sorgt dafür, dass payload.text NIE fehlt (Push + UI)
 * + setzt Default-Status für Request-Notifications
 */
function normalizePayload(kind: string, payload: any) {
  const p = payload ?? {};

  const fallbackText: Record<string, string> = {
    FOLLOW: "folgt dir jetzt.",
    FOLLOW_REQUEST: "möchte dir folgen.",
    FOLLOW_REQUEST_ACCEPTED: "hat deine Anfrage akzeptiert.",
    LIKE: "gefällt dein Beitrag.",
    COMMENT: "hat kommentiert.",
    STORY_POSTED: "hat eine Story gepostet.",
    STORY_MENTION: "hat dich in einer Story erwähnt.",
    POST_SHARE_REQUEST: "hat eine Anfrage gesendet.",
    POST_SHARE_APPROVED: "hat deine Anfrage akzeptiert.",
    POST_SHARE_REJECTED: "hat deine Anfrage abgelehnt.",
    VLOG_TAG_REQUEST: "Neue Beitragsanfrage.",
    VLOG_TAG_APPROVED: "Beitragsanfrage akzeptiert.",
    VLOG_TAG_REJECTED: "Beitragsanfrage abgelehnt.",
    VLOG_NEW_POST: "Neuer Beitrag im Vlog.",
    VLOG_DELETED: "Ein Vlog wurde gelöscht.",
    SYSTEM: "Highlights",
  };

  const next: any = { ...p };

  // ✅ text immer setzen
  if (typeof next.text !== "string" || next.text.trim().length === 0) {
    next.text = fallbackText[kind] ?? "Neuigkeiten";
  }

  // ✅ Default-Status für REQUESTS (exakt wie Follow-Request)
  const isPostTagRequest = next.type === "POST_TAG_REQUEST";
  const isVlogTagRequest = kind === "VLOG_TAG_REQUEST";

  if ((isPostTagRequest || isVlogTagRequest) && !next.status) {
    next.status = "PENDING";
  }

  return next;
}


/* ---------------- Push Text Builder ---------------- */

function buildPushMessage(
  kind: string,
  payload: any,
  meta?: { actorName?: string | null; vlogTitle?: string | null }
): { title: string; body: string } {
  const p = payload ?? {};
  const text = typeof p?.text === "string" ? p.text : "";
  const type = typeof p?.type === "string" ? p.type : "";

  // ✅ SYSTEM / DIGEST
  if (kind === "SYSTEM" || type === "DAILY_DIGEST") {
    return { title: "Highlights", body: text || "Neues aus deiner Familie" };
  }

  // title defaults: actor -> vlog -> Familie
  const title = meta?.actorName || meta?.vlogTitle || "Familie";

  switch (kind) {
    case "FOLLOW":
      return { title, body: text || "folgt dir jetzt." };

    case "FOLLOW_REQUEST":
      return { title, body: text || "möchte dir folgen." };

    case "FOLLOW_REQUEST_ACCEPTED":
      return { title, body: text || "hat deine Anfrage akzeptiert." };

    case "LIKE":
      return { title, body: text || "gefällt dein Beitrag." };

    case "COMMENT":
      return { title, body: text ? `hat kommentiert: ${text}` : "hat kommentiert." };

    case "STORY_POSTED":
      return { title, body: text || "hat eine Story gepostet." };

    case "STORY_MENTION":
      return { title, body: text || "hat dich in einer Story erwähnt." };

    case "POST_SHARE_REQUEST":
      return { title, body: text || "hat eine Anfrage gesendet." };

    case "POST_SHARE_APPROVED":
      return { title, body: text || "hat deine Anfrage akzeptiert." };

    case "POST_SHARE_REJECTED":
      return { title, body: text || "hat deine Anfrage abgelehnt." };

    case "VLOG_TAG_REQUEST":
      return { title: meta?.vlogTitle || title, body: text || "Neue Beitragsanfrage." };

    case "VLOG_TAG_APPROVED":
      return { title: meta?.vlogTitle || title, body: text || "Beitragsanfrage akzeptiert." };

    case "VLOG_TAG_REJECTED":
      return { title: meta?.vlogTitle || title, body: text || "Beitragsanfrage abgelehnt." };

    case "VLOG_DELETED":
      return { title: "Highlights", body: text || "Ein Vlog wurde gelöscht." };

    case "VLOG_NEW_POST": {
      const mk = payload?.mediaKind; // "IMAGE" | "VIDEO" | "POST"
      const action =
        mk === "VIDEO" ? "ein neues Video" :
        mk === "IMAGE" ? "ein neues Foto" :
        "einen neuen Beitrag";

      return {
        title: meta?.vlogTitle || "Vlog",
        body: `${meta?.actorName || "Jemand"} hat ${action} hinzugefügt`,
      };
    }

    default:
      return { title: title || "Highlights", body: text || "Neuigkeiten" };
  }
}

/* ---------------- Push Route Builder (Deep-Link friendly) ---------------- */
/**
 * Standardisiert Push Navigation:
 * data.route + data.params
 *
 * Konvention (Mobile):
 * - route: "Activity" | "PostDetail" | "NotificationSettings" | ...
 * - params: route params fürs navigate()
 */
function buildPushRoute(args: {
  kind: string;
  payload: any;
  postId?: string | null;
  vlogId?: string | null;
  notificationId?: string | null;
}) {
  const { kind, payload, postId, vlogId, notificationId } = args;
  const p = payload ?? {};

  if (kind === "STORY_POSTED" || kind === "STORY_MENTION") {
    // Wir navigieren direkt in den StoryViewer.
    // Slides werden im Mobile nachgeladen (storiesFeed).
    const author = p?.author;
    return {
      route: "StoryViewer",
      params: {
        user: {
          id: author?.id,
          username: author?.username ?? "User",
          avatar: author?.avatarUrl ?? null,
        },
        slides: [],
        startIndex: 0,
        storyId: p?.storyId ?? undefined,
        fetchFromFeed: true,
      },
    };
  }

  const type = typeof p?.type === "string" ? p.type : "";

  const isRequest =
    kind === "FOLLOW_REQUEST" ||
    kind === "POST_SHARE_REQUEST" ||
    kind === "VLOG_TAG_REQUEST" ||
    type === "POST_TAG_REQUEST";

  // Daily digest: direkt in PostDetail (Liste)
  if (type === "DAILY_DIGEST" && Array.isArray(p?.postIds) && p.postIds.length > 0) {
    const postIds = p.postIds.map(String);
    return {
      route: "PostDetail",
      params: { id: postIds[0], postIds, startIndex: 0, fromActivity: true },
    };
  }

  // ✅ Requests: zuerst Activity (damit CTAs + Kontext sicher da sind)
  if (isRequest) {
    return {
      route: "Activity",
      params: {
        focus: "REQUESTS",
        highlightNotificationId: notificationId ?? undefined,
        kind,
        postId: postId ?? undefined,
        vlogId: vlogId ?? undefined,
      },
    };
  }

  // ✅ VLOG_NEW_POST: direkt ins VlogDetail (auch wenn postId existiert)
  if (kind === "VLOG_NEW_POST" && vlogId) {
    return {
      route: "VlogDetail", // ⚠️ muss exakt so heißen wie deine RN Route
      params: { slug: payload?.vlogSlug, id: vlogId, fromPush: true },
    };
  }

  // Nicht-Request + postId: direkt zum Post
  if (postId) {
    return {
      route: "PostDetail",
      params: { id: postId, postIds: [postId], startIndex: 0, fromActivity: true },
    };
  }

  // Default: Activity → Neu
  return {
    route: "Activity",
    params: { focus: "NEW", kind },
  };
}



/* ---------------- Push Guard ---------------- */

async function shouldSendPush(
  prisma: PrismaClientOrTx,
  recipientId: string,
  kind: string,
  payload: any
): Promise<boolean> {
  const p = payload ?? {};
  if (p?.silent === true) return false;

  // Settings laden
  const me = await prisma.profile.findUnique({
    where: { id: recipientId },
    select: { notificationSettings: true },
  } as any);

  const s = (me?.notificationSettings ?? {}) as any;
  const ss = { ...DEFAULTS, ...s };


  // push enabled
  if (ss.pushEnabled === false) return false;

  // ✅ POST_TAG_REQUEST special-case (läuft sonst über POST_SHARE_REQUEST)
  if (p?.type === "POST_TAG_REQUEST") {
    return ss.postTagRequest !== false;
  }

  // digest
  if (p?.type === "DAILY_DIGEST") return ss.digestEnabled !== false;

  // system ohne digest: nein
  if (kind === "SYSTEM") return false;

  // kind mapping
  const map: Record<string, string> = {
    FOLLOW: "follow",
    FOLLOW_REQUEST: "followRequest",
    FOLLOW_REQUEST_ACCEPTED: "followRequestAccepted",
    LIKE: "like",
    COMMENT: "comment",

    STORY_POSTED: "storyPosted",
    STORY_MENTION: "storyMention",

    POST_SHARE_REQUEST: "postShareRequest",
    POST_SHARE_APPROVED: "postShareApproved",
    POST_SHARE_REJECTED: "postShareRejected",

    VLOG_TAG_REQUEST: "vlogTagRequest",
    VLOG_TAG_APPROVED: "vlogTagApproved",
    VLOG_TAG_REJECTED: "vlogTagRejected",

    VLOG_NEW_POST: "vlogNewPost",
    VLOG_DELETED: "vlogDeleted",
  };

  const key = map[kind];
  if (!key) return true; // unknown → allow by default

  return ss[key] !== false;
}

/* ---------------- Expo Push Sender ---------------- */

async function sendExpoPush(
  prisma: PrismaClientOrTx,
  recipientId: string,
  to: string,
  title: string,
  body: string,
  data?: PushData
) {
  if (!to) return;
  if (!to.startsWith("ExponentPushToken") && !to.startsWith("ExpoPushToken")) {
    return;
  }

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        sound: "default",
        title,
        body,
        data: data ?? {},
      }),
    });

    const json = await res.json().catch(() => ({}));

    // Token ungültig → löschen
    if (json?.data?.status === "error") {
      const err = json?.data?.details?.error;
      if (err === "DeviceNotRegistered") {
        await prisma.profile.update({
          where: { id: recipientId },
          data: {
            pushToken: null,
            pushTokenUpdatedAt: new Date(),
          },
        });
      }
    }
  } catch (e) {
    console.error("[push] failed", e);
  }
}

/* ---------------- MAIN notify() ---------------- */

export async function notify(opts: {
  prisma: PrismaClientOrTx;
  recipientId: string;
  kind:
    | "VLOG_TAG_REQUEST"
    | "VLOG_TAG_APPROVED"
    | "VLOG_TAG_REJECTED"
    | "FOLLOW"
    | "FOLLOW_REQUEST"
    | "FOLLOW_REQUEST_ACCEPTED"
    | "LIKE"
    | "COMMENT"
    | "SYSTEM"
    | "POST_SHARE_REQUEST"
    | "POST_SHARE_APPROVED"
    | "POST_SHARE_REJECTED"
    | "VLOG_DELETED"
    | "VLOG_NEW_POST"
    | "STORY_POSTED"
    | "STORY_MENTION";
  channel?: "INBOX" | "ACTIVITY" | "BOTH";
  fromUserId?: string | null;
  actorId?: string | null;
  vlogId?: string | null;
  postId?: string | null;
  payload?: any;
}) {
  const {
    prisma,
    recipientId,
    kind,
    channel = "BOTH",
    fromUserId = null,
    actorId = null,
    vlogId = null,
    postId = null,
    payload = null,
  } = opts;

  try {
    // ✅ normalize payload (text fallback)
    const normalizedPayload = normalizePayload(kind, payload);
    const postIds = [...new Set([postId, normalizedPayload?.postId,
      ...(Array.isArray(normalizedPayload?.postIds) ? normalizedPayload.postIds : [])]
      .filter((id): id is string => typeof id === "string"))];
    if (postIds.length && (await prisma.post.findMany({
      where: { AND: [{ id: { in: postIds } }, visiblePostWhere({ profileId: recipientId })] },
      select: { id: true },
    })).length !== postIds.length) return null;

    const isRequest =
      kind === "FOLLOW_REQUEST" ||
      kind === "POST_SHARE_REQUEST" ||
      kind === "VLOG_TAG_REQUEST" ||
      normalizedPayload?.type === "POST_TAG_REQUEST";

    // 1️⃣ DB Notification
    const created = await prisma.notification.create({
      data: {
        recipientId,
        kind: kind as any,
        channel,
        fromUserId: fromUserId ?? undefined,
        actorId: actorId ?? undefined,
        vlogId: vlogId ?? undefined,
        postId: postId ?? undefined,
        payload: normalizedPayload as Prisma.InputJsonValue,

        requestStatus: isRequest ? "PENDING" : undefined,
      },
    });

    // 2️⃣ Push Guard
    if (!(await shouldSendPush(prisma, recipientId, kind, normalizedPayload))) return created;

    // 3️⃣ Push Token holen
    const recipient = await prisma.profile.findUnique({
      where: { id: recipientId },
      select: { pushToken: true },
    } as any);

    const token = recipient?.pushToken;
    if (!token) return created;

    // 4️⃣ Actor/Vlog laden für besseren Push-Titel
    const actorIdToUse = actorId || fromUserId || null;

    const [actor, vlog] = await Promise.all([
      actorIdToUse
        ? prisma.profile.findUnique({
            where: { id: actorIdToUse },
            select: { username: true },
          } as any)
        : Promise.resolve(null),

      vlogId
        ? prisma.vlog.findUnique({
            where: { id: vlogId },
            select: { title: true, slug: true }, // ✅
          } as any)
        : Promise.resolve(null),
    ]);

    // 5️⃣ Push Text bauen (mit meta!)
    const { title, body } = buildPushMessage(kind, normalizedPayload, {
      actorName: actor?.username ?? null,
      vlogTitle: vlog?.title ?? null,
    });

    // ✅ 5.5 Route/Params bauen (Deep-Link friendly)
    const nav = buildPushRoute({
      kind,
      payload: normalizedPayload,
      postId,
      vlogId,
      notificationId: created.id,
    });

    // ✅ wenn wir Vlog geladen haben, slug in params injizieren (für VlogDetail Query)
    // ✅ nur für VlogDetail params erweitern (TS-safe via any cast)
    if (nav?.route === "VlogDetail" && (vlog as any)?.slug) {
      (nav as any).params = { ...((nav as any).params ?? {}), slug: (vlog as any).slug };
    }

    // 6️⃣ Push senden (inkl route/params)
    await sendExpoPush(prisma, recipientId, token, title, body, {
      v: 1,
      route: nav.route,
      params: nav.params,

      notificationId: created.id,
      kind,
      channel,
      recipientId,
      postId: postId ?? undefined,
      vlogId: vlogId ?? undefined,
      fromUserId: fromUserId ?? undefined,
      actorId: actorId ?? undefined,
      payload: normalizedPayload,
      type: kind,
    });


    return created;
  } catch (e) {
    console.error("[notify] failed", e);
  }
}
