import { gql } from "@apollo/client";

export const UPLOAD_QUEUE = gql`
  query UploadQueue {
    uploadQueue @client {
      id
      text
      previewUri
      createdAt
    }
  }
`;
