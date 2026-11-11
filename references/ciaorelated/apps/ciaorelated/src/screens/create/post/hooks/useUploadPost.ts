// apps/ciaorelated/src/screens/create/post/hooks/useUploadPost.ts
import { gql, useMutation } from "@apollo/client";
import { AppState } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { apollo } from "../../../../apollo";

/* ---------------- GraphQL ---------------- */
const GET_SIGNED_POST_UPLOAD = gql`
  mutation GetSignedPostUpload($mime: String!, $size: Int!) {
    getSignedPostUpload(mime: $mime, size: $size) {
      key
      putUrl
      __typename
    }
  }
`;

const CREATE_POST = gql`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      id
      kind
      imageUrl
      videoUrl
      thumbUrl
      createdAt
      isProcessing
      __typename
    }
  }
`;

const CREATE_CAROUSEL_POST = gql`
  mutation CreateCarouselPost($input: CreateCarouselPostInput!) {
    createCarouselPost(input: $input) {
      id
      imageUrl
      videoUrl
      thumbUrl
      likeCount
      commentCount
      author {
        id
        username
        avatarUrl
      }
      taggedVlogs {
        id
        title
        slug
      }
      __typename
    }
  }
`;

const POST_STATUS = gql`
  query PostStatus($id: ID!) {
    post(id: $id) {
      id
      isProcessing
    }
  }
`;

/* ---------------- Utils ---------------- */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getSizeWithFallback(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && "size" in info && Number.isFinite((info as any).size)) {
      return (info as any).size as number;
    }
  } catch {}
  try {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    return blob.size ?? 0;
  } catch {}
  return 0;
}

async function putBinary(putUrl: string, srcUri: string, mime: string): Promise<boolean> {
  try {
    const res = await FileSystem.uploadAsync(putUrl, srcUri, {
      httpMethod: "PUT",
      headers: { "Content-Type": mime },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
    if (res.status >= 200 && res.status < 300) return true;
  } catch {}

  // fallback (wenn uploadAsync zickt)
  try {
    const resp = await fetch(srcUri);
    const blob = await resp.blob();
    const put = await fetch(putUrl, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
    return put.ok;
  } catch {}
  return false;
}

/**
 * ✅ Thumb immer als JPEG exportieren
 * - resize optional (max width)
 * - compress optional
 */
async function ensureJpegThumb(
  uri: string,
  opts?: { maxSize?: number; compress?: number }
): Promise<{ uri: string; mime: "image/jpeg" }> {
  const maxSize = opts?.maxSize ?? 1080;
  const compress = opts?.compress ?? 0.85;

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxSize } }],
    { compress, format: ImageManipulator.SaveFormat.JPEG }
  );

  return { uri: result.uri, mime: "image/jpeg" };
}

/**
 * ✅ Poll nur wenn nötig + Backoff + optional stop wenn App in Background geht
 */
async function waitUntilReady(
  postId: string,
  opts?: { maxTries?: number; baseDelayMs?: number; maxDelayMs?: number; stopWhenBackground?: boolean; maxPollErrors?: number }
): Promise<boolean> {
  const maxTries = opts?.maxTries ?? 120;
  const baseDelayMs = opts?.baseDelayMs ?? 1500;
  const maxDelayMs = opts?.maxDelayMs ?? 6000;
  const stopWhenBackground = opts?.stopWhenBackground ?? true;
  const maxPollErrors = opts?.maxPollErrors ?? 5;

  let delay = baseDelayMs;
  let pollErrors = 0;

  for (let i = 0; i < maxTries; i++) {
    if (stopWhenBackground && AppState.currentState !== "active") {
      // Abbruch: User hat App verlassen -> nicht weiter ballern
      return false;
    }

    let data: any = null;
    try {
      const res = await apollo.query({
        query: POST_STATUS,
        variables: { id: postId },
        fetchPolicy: "network-only",
      });
      data = res.data;
      pollErrors = 0;
    } catch (e) {
      pollErrors += 1;
      console.warn("[waitUntilReady] status poll failed:", (e as any)?.message ?? e);
      if (pollErrors >= maxPollErrors) return false;
      await sleep(delay);
      delay = Math.min(maxDelayMs, Math.round(delay * 1.35));
      continue;
    }

    if (!data?.post) return false;
    if (!data.post.isProcessing) return true;

    await sleep(delay);

    // Backoff: 1.5s → 2s → 3s → 4.5s → 6s (cap)
    delay = Math.min(maxDelayMs, Math.round(delay * 1.35));
  }

  return false;
}
const toEditJson = (meta?: VideoEditMeta | null) => {
  if (!meta) return null;
  try { return JSON.stringify(meta); } catch { return null; }
};
/* ---------------- Types ---------------- */
export type VideoEditMeta = {
  align: { scale: number; tx: number; ty: number };
  fit: "cover" | "contain";
  baseSize: number;
  srcW: number;
  srcH: number;
  outSize: number;
  coverTimeMs?: number;
};

export type CarouselItem = {
  mime: string;
  srcUri: string;
  isVideo: boolean;
  thumbUri?: string | null;
  editMeta?: VideoEditMeta | null;
};

export type UploadPostArgs = {
  mime: string;
  srcUri: string;
  kind: "POST" | "REEL";
  caption?: string | null;
  location?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  groupLinkId?: string | null;
  thumbUri?: string | null;
  interestLabels?: string[];
  taggedVlogIds?: string[];
  taggedUserIds?: string[];
  editMeta?: VideoEditMeta | null;
};

/* ---------------- Hook ---------------- */
export function useUploadPost() {
  const [getSigned] = useMutation(GET_SIGNED_POST_UPLOAD);
  const [createPostMutation, { loading: creatingA }] = useMutation(CREATE_POST);
  const [createCarouselMutation, { loading: creatingB }] = useMutation(CREATE_CAROUSEL_POST);
  const creating = creatingA || creatingB;

  const uploadOnceToS3 = async (uri: string, mime: string) => {
    const size = await getSizeWithFallback(uri);
    if (!size) throw new Error("Could not determine file size");

    const { data } = await getSigned({ variables: { mime, size } });
    const { key, putUrl } = data.getSignedPostUpload as { key: string; putUrl: string };

    const ok = await putBinary(putUrl, uri, mime);
    if (!ok) throw new Error("Upload failed");

    return { key };
  };

  const uploadPost = async ({
    mime,
    srcUri,
    kind,
    caption,
    location,
    locationLat,
    locationLng,
    groupLinkId,
    thumbUri,
    interestLabels,
    taggedVlogIds,
    taggedUserIds,
    editMeta,
  }: UploadPostArgs): Promise<{ ok: boolean; postId?: string; ready: boolean }> => {
    try {
      // 1) Hauptdatei hochladen
      const main = await uploadOnceToS3(srcUri, mime);

      // 2) Optional Thumb (immer als JPEG exportieren!)
      let thumbKey: string | undefined;
      if (thumbUri) {
        try {
          const jpg = await ensureJpegThumb(thumbUri, { maxSize: 1080, compress: 0.85 });
          const thumb = await uploadOnceToS3(jpg.uri, jpg.mime);
          thumbKey = thumb.key;
        } catch (e) {
          console.warn("Thumb upload failed:", e);
        }
      }

      const isVideo = mime.startsWith("video/");
      let postId: string | undefined;
      let isProcessing = false;
      const communityInput = groupLinkId ? { groupLinkId } : {};

      // 3) Post anlegen
      if (Array.isArray(taggedVlogIds) && taggedVlogIds.length > 0) {
        const res = await createCarouselMutation({
          variables: {
            input: {
              caption: caption ?? null,
              location: location ?? null,
              locationLat,
              locationLng,
              ...communityInput,
              interestLabels: interestLabels ?? [],
              media: [
                {
                  idx: 0,
                  kind: isVideo ? "VIDEO" : "IMAGE",
                  key: main.key,
                  thumbKey: thumbKey ?? null,
                  mime,
                  editJson: toEditJson(editMeta) , // MediaInput erwartet "edit"
                },
              ],
              taggedVlogIds,
              taggedUserIds: taggedUserIds ?? [],
            },
          },
        });

        postId = res.data?.createCarouselPost?.id;
        isProcessing = true; // Carousel -> wir warten bis Worker done
      } else {
        const res = await createPostMutation({
          variables: {
            input: {
              kind,
              key: main.key,
              mime,
              caption: caption ?? null,
              location: location ?? null,
              locationLat,
              locationLng,
              ...communityInput,
              interestLabels: interestLabels ?? [],
              thumbKey: thumbKey ?? null,
              taggedUserIds: taggedUserIds ?? [],
              editJson: toEditJson(editMeta),
            },
          },
        });

        postId = res.data?.createPost?.id;
        isProcessing = !!res.data?.createPost?.isProcessing;
      }

      // 4) ⏳ Poll nur wenn wirklich processing
      const ready = postId && isProcessing ? await waitUntilReady(postId) : true;

      return { ok: true, postId, ready };
    } catch (e) {
      console.warn("[uploadPost] Error:", e);
      return { ok: false, ready: false };
    }
  };

  const uploadCarousel = async ({
    items,
    caption,
    location,
    locationLat,
    locationLng,
    groupLinkId,
    interestLabels,
    taggedVlogIds,
    taggedUserIds,
  }: {
    items: CarouselItem[];
    caption?: string | null;
    location?: string | null;
    locationLat?: number | null;
    locationLng?: number | null;
    groupLinkId?: string | null;
    interestLabels?: string[];
    taggedVlogIds?: string[];
    taggedUserIds?: string[];
  }): Promise<boolean> => {
    try {
      const communityInput = groupLinkId ? { groupLinkId } : {};
      // alle Parts hochladen
      const uploaded = await Promise.all(
        items.map(async (it) => {
          const main = await uploadOnceToS3(it.srcUri, it.mime);

          let thumbKey: string | null = null;
          if (it.thumbUri) {
            try {
              const jpg = await ensureJpegThumb(it.thumbUri, { maxSize: 1080, compress: 0.85 });
              const t = await uploadOnceToS3(jpg.uri, jpg.mime);
              thumbKey = t.key;
            } catch (e) {
              console.warn("Carousel thumb failed:", e);
            }
          }

          return {
            kind: it.isVideo ? "VIDEO" : "IMAGE",
            key: main.key,
            thumbKey,
            mime: it.mime,
          };
        })
      );

      const res = await createCarouselMutation({
        variables: {
          input: {
            caption: caption ?? null,
            location: location ?? null,
            locationLat,
            locationLng,
            ...communityInput,
            interestLabels: interestLabels ?? [],
            media: uploaded.map((m, idx) => {
              const edit = items[idx]?.editMeta ?? null;
              return {
                idx,
                ...m,
                ...(edit ? { edit } : {}),
              };
            }),
            taggedVlogIds: taggedVlogIds ?? [],
            taggedUserIds: taggedUserIds ?? [],
          },
        },
      });

      const postId = res.data?.createCarouselPost?.id;
      if (postId) {
        await waitUntilReady(postId);
      }

      return true;
    } catch (e) {
      console.warn("[uploadCarousel] Error:", e);
      return false;
    }
  };

  return { uploadPost, creating, uploadCarousel };
}
