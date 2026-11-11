// src/lib/uploadToS3.ts
import * as FileSystem from "expo-file-system/legacy";
import { gql, ApolloClient } from "@apollo/client";

const SIGN_UPLOAD = gql`
  mutation SignUpload($mime:String!, $filename:String) {
    signUpload(mime:$mime, filename:$filename) {
      putUrl
      getUrl
      key        # <-- NEU
      mime
    }
  }
`;

type LocalFile = { uri:string; name:string; type:string };

export async function uploadToS3(apollo: ApolloClient<any>, file: LocalFile) {
  const { data } = await apollo.mutate({
    mutation: SIGN_UPLOAD,
    variables: { mime: file.type, filename: file.name },
  });
  const { putUrl, getUrl, key, mime } = data.signUpload;

  const res = await FileSystem.uploadAsync(putUrl, file.uri, {
    httpMethod: "PUT",
    headers: { "Content-Type": mime },
  });
  if (res.status !== 200) throw new Error(`S3 PUT failed ${res.status}`);

  // Für die sofortige Vorschau darfst du getUrl nutzen
  return { key, mime, previewUrl: getUrl };
}
