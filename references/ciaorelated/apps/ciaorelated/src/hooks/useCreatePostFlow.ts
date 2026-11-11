import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useMutation } from "@apollo/client";
import { GET_SIGNED_POST_UPLOAD, CREATE_POST } from "../graphql/mutations/storage";
import { ME_QUERY } from "../graphql/queries/profile";

async function pickImageBase() {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.9,
  });
  if (res.canceled) return null;
  const asset = res.assets[0];
  // mime ermitteln
  const mime =
    asset.mimeType ||
    (asset.uri.endsWith(".png") ? "image/png" :
     asset.uri.endsWith(".webp") ? "image/webp" : "image/jpeg");
  return { uri: asset.uri, mime };
}

export function useCreatePostFlow() {
  const [getUpload] = useMutation(GET_SIGNED_POST_UPLOAD);
  const [createPost] = useMutation(CREATE_POST, {
    update: (cache, { data }) => {
      if (!data?.createPost) return;
      const existing = cache.readQuery<{ me: any }>({ query: ME_QUERY });
      if (!existing?.me) return;
      cache.writeQuery({
        query: ME_QUERY,
        data: { me: { ...existing.me, posts: [data.createPost, ...(existing.me.posts ?? [])] } },
      });
    },
  });

  const run = async ({ caption, location }: { caption?: string; location?: string }) => {
    const picked = await pickImageBase();
    if (!picked) return;

    // Dateigröße ermitteln (nur für iOS/Android nativ sicher; im Zweifel ohne size und serverseitig nur Softlimit)
    let size = 0;
    try {
      const info = await FileSystem.getInfoAsync(picked.uri);
      if (info.exists && !info.isDirectory) size = info.size;
    } catch {
      size = 0; // not critical
    }

    const uploadRes = await getUpload({ variables: { mime: picked.mime, size } });
    const { key, putUrl } = uploadRes.data.getSignedPostUpload;

    // direkter PUT Upload
    await fetch(putUrl, {
      method: "PUT",
      headers: { "Content-Type": picked.mime },
      body: (await (await fetch(picked.uri)).blob()) as any, // Expo SDK 49+: fetch(uri).blob() geht
    }).then(r => {
      if (!r.ok) throw new Error(`Upload failed: ${r.status}`);
    });

    // Post anlegen
    await createPost({
      variables: {
        input: {
          key,
          caption: caption || null,
          location: location || null,
          mime: picked.mime,
        },
      },
    });
  };

  return { run };
}
