export type MediaItemProps = {
  type?: string;
  path?: string;
  name?: string;
  date?: string;
  size?: string;
};

export type ChatItemProps = {
  id: number;
  name?: string;
  image?: string;
  date?: string;
  status?: "sent" | "forwarded" | "read";
  is_archive?: boolean;
  last_message?: string;
  messages?: ChatMessageProps[];
  user_id: number;
  user: UserPropsTypes;
  members?: UserPropsTypes[];
  medias?: MediaItemProps[];
};

export type ChatMessageProps = {
  id: number;
  content?: string;
  type?: string;
  own_message?: boolean;
  read?: boolean;
  data?: {
    file_name?: string;
    cover?: string;
    path?: string;
    duration?: string;
    size?: string;
    images?: string[];
  };
};

export type UserPropsTypes = {
  id: number;
  name: string;
  avatar?: string;
  about?: string;
  phone?: string;
  country?: string;
  email?: string;
  gender?: string;
  website?: string;
  online_status?: "success" | "warning" | "danger" | null;
  last_seen?: string;
  social_links?: {
    name?: string;
    url?: string;
  }[];
  medias?: MediaItemProps[];
};

export type StatusMediaProps = {
  type: "image" | "video";
  src: string;
  caption?: string;
};

export type StatusItemProps = {
  id: number;
  images: string[];
  items?: StatusMediaProps[];
  date: string;
  read?: boolean;
  user_id: number;
  user: UserPropsTypes;
};
