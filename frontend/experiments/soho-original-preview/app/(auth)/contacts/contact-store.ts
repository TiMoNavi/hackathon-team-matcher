import { create } from "zustand"

import { UserPropsTypes } from "@/types"

export const initialContacts: UserPropsTypes[] = [
  {
    id: 1,
    name: "Jacquenetta Slowgrave",
    avatar: "https://i.pravatar.cc/150?img=1",
    gender: "Male",
    email: "jslowgrave0@naver.com",
    phone: "536-159-0405",
    about:
      "I love reading, traveling and discovering new things. You need to be happy in life.",
    last_seen: "2 minute ago",
    online_status: "success",
    website: "https://shadcnuikit.com",
    social_links: [
      {
        name: "Facebook",
        url: "https://www.facebook.com/",
      },
      {
        name: "X",
        url: "https://www.x.com/",
      },
      {
        name: "Linkedin",
        url: "https://www.linkedin.com/",
      },
      {
        name: "Instagram",
        url: "https://www.instagram.com/",
      },
      {
        name: "Dribbble",
        url: "https://www.dribbble.com/",
      },
    ],
    country: "China",
    medias: [
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200&auto=format&fit=crop&q=60",
        name: "Mountain-trip.jpg",
        date: "10.07.2026 at 11:43",
        size: "175 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=200&auto=format&fit=crop&q=60",
        name: "Sunset-walk.jpg",
        date: "07.07.2026 at 10:23",
        size: "240 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=200&auto=format&fit=crop&q=60",
        name: "Lake-view.jpg",
        date: "28.06.2026 at 09:13",
        size: "310 KB",
      },
      {
        type: "pdf",
        path: "#",
        name: "Travel-notes.pdf",
        date: "14.06.2026 at 22:23",
        size: "88 KB",
      },
    ],
  },
  {
    id: 2,
    name: "Nickola Peever",
    avatar: "https://i.pravatar.cc/150?img=2",
    gender: "Female",
    email: "npeever1@ihg.com",
    phone: "973-760-6954",
    about:
      "I love reading, traveling and discovering new things. You need to be happy in life.",
    last_seen: "2 minute ago",
    online_status: "warning",
    website: "https://shadcnuikit.com",
    social_links: [
      {
        name: "Facebook",
        url: "https://www.facebook.com/",
      },
      {
        name: "X",
        url: "https://www.x.com/",
      },
      {
        name: "Linkedin",
        url: "https://www.linkedin.com/",
      },
      {
        name: "Instagram",
        url: "https://www.instagram.com/",
      },
      {
        name: "Dribbble",
        url: "https://www.dribbble.com/",
      },
    ],
    country: "Thailand",
    medias: [
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=200&auto=format&fit=crop&q=60",
        name: "Sunset-walk.jpg",
        date: "10.07.2026 at 11:43",
        size: "240 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=200&auto=format&fit=crop&q=60",
        name: "Lake-view.jpg",
        date: "07.07.2026 at 10:23",
        size: "310 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=200&auto=format&fit=crop&q=60",
        name: "Forest-road.jpg",
        date: "28.06.2026 at 09:13",
        size: "96 KB",
      },
      {
        type: "pdf",
        path: "#",
        name: "Travel-notes.pdf",
        date: "14.06.2026 at 22:23",
        size: "88 KB",
      },
    ],
  },
  {
    id: 3,
    name: "Farand Hume",
    gender: "Female",
    email: "fhume2@privacy.gov.au",
    phone: "555-379-7534",
    about:
      "I love reading, traveling and discovering new things. You need to be happy in life.",
    last_seen: "2 minute ago",
    online_status: "success",
    website: "https://shadcnuikit.com",
    social_links: [
      {
        name: "Facebook",
        url: "https://www.facebook.com/",
      },
      {
        name: "X",
        url: "https://www.x.com/",
      },
      {
        name: "Linkedin",
        url: "https://www.linkedin.com/",
      },
      {
        name: "Instagram",
        url: "https://www.instagram.com/",
      },
      {
        name: "Dribbble",
        url: "https://www.dribbble.com/",
      },
    ],
    country: "Honduras",
    medias: [
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=200&auto=format&fit=crop&q=60",
        name: "Lake-view.jpg",
        date: "10.07.2026 at 11:43",
        size: "310 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=200&auto=format&fit=crop&q=60",
        name: "Forest-road.jpg",
        date: "07.07.2026 at 10:23",
        size: "96 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=200&auto=format&fit=crop&q=60",
        name: "Night-sky.jpg",
        date: "28.06.2026 at 09:13",
        size: "175 KB",
      },
      {
        type: "pdf",
        path: "#",
        name: "Travel-notes.pdf",
        date: "14.06.2026 at 22:23",
        size: "88 KB",
      },
    ],
  },
  {
    id: 4,
    name: "Ossie Peasey",
    avatar: "https://i.pravatar.cc/150?img=4",
    gender: "Female",
    email: "opeasey3@360.cn",
    phone: "780-756-0264",
    about:
      "I love reading, traveling and discovering new things. You need to be happy in life.",
    last_seen: "2 minute ago",
    online_status: null,
    website: "https://shadcnuikit.com",
    social_links: [
      {
        name: "Facebook",
        url: "https://www.facebook.com/",
      },
      {
        name: "X",
        url: "https://www.x.com/",
      },
      {
        name: "Linkedin",
        url: "https://www.linkedin.com/",
      },
      {
        name: "Instagram",
        url: "https://www.instagram.com/",
      },
      {
        name: "Dribbble",
        url: "https://www.dribbble.com/",
      },
    ],
    country: "Peru",
    medias: [
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=200&auto=format&fit=crop&q=60",
        name: "Forest-road.jpg",
        date: "10.07.2026 at 11:43",
        size: "96 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=200&auto=format&fit=crop&q=60",
        name: "Night-sky.jpg",
        date: "07.07.2026 at 10:23",
        size: "175 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200&auto=format&fit=crop&q=60",
        name: "Mountain-trip.jpg",
        date: "28.06.2026 at 09:13",
        size: "240 KB",
      },
      {
        type: "pdf",
        path: "#",
        name: "Travel-notes.pdf",
        date: "14.06.2026 at 22:23",
        size: "88 KB",
      },
    ],
  },
  {
    id: 5,
    name: "Hall Negri",
    avatar: "https://i.pravatar.cc/150?img=5",
    gender: "Male",
    email: "hnegri4@feedburner.com",
    phone: "811-584-3641",
    about:
      "I love reading, traveling and discovering new things. You need to be happy in life.",
    last_seen: "2 minute ago",
    online_status: "danger",
    website: "https://shadcnuikit.com",
    social_links: [
      {
        name: "Facebook",
        url: "https://www.facebook.com/",
      },
      {
        name: "X",
        url: "https://www.x.com/",
      },
      {
        name: "Linkedin",
        url: "https://www.linkedin.com/",
      },
      {
        name: "Instagram",
        url: "https://www.instagram.com/",
      },
      {
        name: "Dribbble",
        url: "https://www.dribbble.com/",
      },
    ],
    country: "Indonesia",
    medias: [
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=200&auto=format&fit=crop&q=60",
        name: "Night-sky.jpg",
        date: "10.07.2026 at 11:43",
        size: "175 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200&auto=format&fit=crop&q=60",
        name: "Mountain-trip.jpg",
        date: "07.07.2026 at 10:23",
        size: "240 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=200&auto=format&fit=crop&q=60",
        name: "Sunset-walk.jpg",
        date: "28.06.2026 at 09:13",
        size: "310 KB",
      },
      {
        type: "pdf",
        path: "#",
        name: "Travel-notes.pdf",
        date: "14.06.2026 at 22:23",
        size: "88 KB",
      },
    ],
  },
  {
    id: 6,
    name: "Elyssa Segot",
    avatar: "https://i.pravatar.cc/150?img=6",
    gender: "Male",
    email: "esegot5@boston.com",
    phone: "627-740-4954",
    about:
      "I love reading, traveling and discovering new things. You need to be happy in life.",
    last_seen: "2 minute ago",
    online_status: "success",
    website: "https://shadcnuikit.com",
    social_links: [
      {
        name: "Facebook",
        url: "https://www.facebook.com/",
      },
      {
        name: "X",
        url: "https://www.x.com/",
      },
      {
        name: "Linkedin",
        url: "https://www.linkedin.com/",
      },
      {
        name: "Instagram",
        url: "https://www.instagram.com/",
      },
      {
        name: "Dribbble",
        url: "https://www.dribbble.com/",
      },
    ],
    country: "Mongolia",
    medias: [
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200&auto=format&fit=crop&q=60",
        name: "Mountain-trip.jpg",
        date: "10.07.2026 at 11:43",
        size: "240 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=200&auto=format&fit=crop&q=60",
        name: "Sunset-walk.jpg",
        date: "07.07.2026 at 10:23",
        size: "310 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=200&auto=format&fit=crop&q=60",
        name: "Lake-view.jpg",
        date: "28.06.2026 at 09:13",
        size: "96 KB",
      },
      {
        type: "pdf",
        path: "#",
        name: "Travel-notes.pdf",
        date: "14.06.2026 at 22:23",
        size: "88 KB",
      },
    ],
  },
  {
    id: 7,
    name: "Gil Wilfing",
    avatar: "https://i.pravatar.cc/150?img=7",
    gender: "Male",
    email: "gwilfing6@jimdo.com",
    phone: "881-882-3271",
    about:
      "I love reading, traveling and discovering new things. You need to be happy in life.",
    last_seen: "2 minute ago",
    online_status: null,
    website: "https://shadcnuikit.com",
    social_links: [
      {
        name: "Facebook",
        url: "https://www.facebook.com/",
      },
      {
        name: "X",
        url: "https://www.x.com/",
      },
      {
        name: "Linkedin",
        url: "https://www.linkedin.com/",
      },
      {
        name: "Instagram",
        url: "https://www.instagram.com/",
      },
      {
        name: "Dribbble",
        url: "https://www.dribbble.com/",
      },
    ],
    country: "Russia",
    medias: [
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=200&auto=format&fit=crop&q=60",
        name: "Sunset-walk.jpg",
        date: "10.07.2026 at 11:43",
        size: "310 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=200&auto=format&fit=crop&q=60",
        name: "Lake-view.jpg",
        date: "07.07.2026 at 10:23",
        size: "96 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=200&auto=format&fit=crop&q=60",
        name: "Forest-road.jpg",
        date: "28.06.2026 at 09:13",
        size: "175 KB",
      },
      {
        type: "pdf",
        path: "#",
        name: "Travel-notes.pdf",
        date: "14.06.2026 at 22:23",
        size: "88 KB",
      },
    ],
  },
  {
    id: 8,
    name: "Bab Cleaton",
    avatar: "https://i.pravatar.cc/150?img=8",
    gender: "Female",
    email: "bcleaton7@google.es",
    phone: "605-196-5520",
    about:
      "I love reading, traveling and discovering new things. You need to be happy in life.",
    last_seen: "2 minute ago",
    online_status: "warning",
    website: "https://shadcnuikit.com",
    social_links: [
      {
        name: "Facebook",
        url: "https://www.facebook.com/",
      },
      {
        name: "X",
        url: "https://www.x.com/",
      },
      {
        name: "Linkedin",
        url: "https://www.linkedin.com/",
      },
      {
        name: "Instagram",
        url: "https://www.instagram.com/",
      },
      {
        name: "Dribbble",
        url: "https://www.dribbble.com/",
      },
    ],
    country: "Indonesia",
    medias: [
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=200&auto=format&fit=crop&q=60",
        name: "Lake-view.jpg",
        date: "10.07.2026 at 11:43",
        size: "96 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=200&auto=format&fit=crop&q=60",
        name: "Forest-road.jpg",
        date: "07.07.2026 at 10:23",
        size: "175 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=200&auto=format&fit=crop&q=60",
        name: "Night-sky.jpg",
        date: "28.06.2026 at 09:13",
        size: "240 KB",
      },
      {
        type: "pdf",
        path: "#",
        name: "Travel-notes.pdf",
        date: "14.06.2026 at 22:23",
        size: "88 KB",
      },
    ],
  },
  {
    id: 9,
    name: "Janith Satch",
    avatar: "https://i.pravatar.cc/150?img=9",
    gender: "Female",
    email: "jsatch8@instagram.com",
    phone: "444-972-5747",
    about:
      "I love reading, traveling and discovering new things. You need to be happy in life.",
    last_seen: "2 minute ago",
    online_status: "success",
    website: "https://shadcnuikit.com",
    social_links: [
      {
        name: "Facebook",
        url: "https://www.facebook.com/",
      },
      {
        name: "X",
        url: "https://www.x.com/",
      },
      {
        name: "Linkedin",
        url: "https://www.linkedin.com/",
      },
      {
        name: "Instagram",
        url: "https://www.instagram.com/",
      },
      {
        name: "Dribbble",
        url: "https://www.dribbble.com/",
      },
    ],
    country: "France",
    medias: [
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=200&auto=format&fit=crop&q=60",
        name: "Forest-road.jpg",
        date: "10.07.2026 at 11:43",
        size: "175 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=200&auto=format&fit=crop&q=60",
        name: "Night-sky.jpg",
        date: "07.07.2026 at 10:23",
        size: "240 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200&auto=format&fit=crop&q=60",
        name: "Mountain-trip.jpg",
        date: "28.06.2026 at 09:13",
        size: "310 KB",
      },
      {
        type: "pdf",
        path: "#",
        name: "Travel-notes.pdf",
        date: "14.06.2026 at 22:23",
        size: "88 KB",
      },
    ],
  },
  {
    id: 10,
    name: "Biron Alison",
    avatar: "https://i.pravatar.cc/150?img=10",
    gender: "Female",
    email: "balison9@house.gov",
    phone: "782-997-2630",
    about:
      "I love reading, traveling and discovering new things. You need to be happy in life.",
    last_seen: "2 minute ago",
    online_status: "danger",
    website: "https://shadcnuikit.com",
    social_links: [
      {
        name: "Facebook",
        url: "https://www.facebook.com/",
      },
      {
        name: "X",
        url: "https://www.x.com/",
      },
      {
        name: "Linkedin",
        url: "https://www.linkedin.com/",
      },
      {
        name: "Instagram",
        url: "https://www.instagram.com/",
      },
      {
        name: "Dribbble",
        url: "https://www.dribbble.com/",
      },
    ],
    country: "South Africa",
    medias: [
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=200&auto=format&fit=crop&q=60",
        name: "Night-sky.jpg",
        date: "10.07.2026 at 11:43",
        size: "240 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200&auto=format&fit=crop&q=60",
        name: "Mountain-trip.jpg",
        date: "07.07.2026 at 10:23",
        size: "310 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=200&auto=format&fit=crop&q=60",
        name: "Sunset-walk.jpg",
        date: "28.06.2026 at 09:13",
        size: "96 KB",
      },
      {
        type: "pdf",
        path: "#",
        name: "Travel-notes.pdf",
        date: "14.06.2026 at 22:23",
        size: "88 KB",
      },
    ],
  },
  {
    id: 11,
    name: "Baily Younie",
    avatar: "https://i.pravatar.cc/150?img=11",
    gender: "Female",
    email: "byouniea@blogspot.com",
    phone: "478-840-0708",
    about:
      "I love reading, traveling and discovering new things. You need to be happy in life.",
    last_seen: "2 minute ago",
    online_status: null,
    website: "https://shadcnuikit.com",
    social_links: [
      {
        name: "Facebook",
        url: "https://www.facebook.com/",
      },
      {
        name: "X",
        url: "https://www.x.com/",
      },
      {
        name: "Linkedin",
        url: "https://www.linkedin.com/",
      },
      {
        name: "Instagram",
        url: "https://www.instagram.com/",
      },
      {
        name: "Dribbble",
        url: "https://www.dribbble.com/",
      },
    ],
    country: "China",
    medias: [
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200&auto=format&fit=crop&q=60",
        name: "Mountain-trip.jpg",
        date: "10.07.2026 at 11:43",
        size: "310 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=200&auto=format&fit=crop&q=60",
        name: "Sunset-walk.jpg",
        date: "07.07.2026 at 10:23",
        size: "96 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=200&auto=format&fit=crop&q=60",
        name: "Lake-view.jpg",
        date: "28.06.2026 at 09:13",
        size: "175 KB",
      },
      {
        type: "pdf",
        path: "#",
        name: "Travel-notes.pdf",
        date: "14.06.2026 at 22:23",
        size: "88 KB",
      },
    ],
  },
  {
    id: 12,
    name: "Lawton Broadbury",
    avatar: "https://i.pravatar.cc/150?img=12",
    gender: "Male",
    email: "lbroadburyb@gizmodo.com",
    phone: "540-993-8480",
    about:
      "I love reading, traveling and discovering new things. You need to be happy in life.",
    last_seen: "2 minute ago",
    online_status: "success",
    website: "https://shadcnuikit.com",
    social_links: [
      {
        name: "Facebook",
        url: "https://www.facebook.com/",
      },
      {
        name: "X",
        url: "https://www.x.com/",
      },
      {
        name: "Linkedin",
        url: "https://www.linkedin.com/",
      },
      {
        name: "Instagram",
        url: "https://www.instagram.com/",
      },
      {
        name: "Dribbble",
        url: "https://www.dribbble.com/",
      },
    ],
    country: "Portugal",
    medias: [
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=200&auto=format&fit=crop&q=60",
        name: "Sunset-walk.jpg",
        date: "10.07.2026 at 11:43",
        size: "96 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=200&auto=format&fit=crop&q=60",
        name: "Lake-view.jpg",
        date: "07.07.2026 at 10:23",
        size: "175 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=200&auto=format&fit=crop&q=60",
        name: "Forest-road.jpg",
        date: "28.06.2026 at 09:13",
        size: "240 KB",
      },
      {
        type: "pdf",
        path: "#",
        name: "Travel-notes.pdf",
        date: "14.06.2026 at 22:23",
        size: "88 KB",
      },
    ],
  },
  {
    id: 13,
    name: "Ealasaid Bohlje",
    gender: "Female",
    email: "ebohljec@google.pl",
    phone: "934-572-7769",
    about:
      "I love reading, traveling and discovering new things. You need to be happy in life.",
    last_seen: "2 minute ago",
    online_status: "warning",
    website: "https://shadcnuikit.com",
    social_links: [
      {
        name: "Facebook",
        url: "https://www.facebook.com/",
      },
      {
        name: "X",
        url: "https://www.x.com/",
      },
      {
        name: "Linkedin",
        url: "https://www.linkedin.com/",
      },
      {
        name: "Instagram",
        url: "https://www.instagram.com/",
      },
      {
        name: "Dribbble",
        url: "https://www.dribbble.com/",
      },
    ],
    country: "Guatemala",
    medias: [
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=200&auto=format&fit=crop&q=60",
        name: "Lake-view.jpg",
        date: "10.07.2026 at 11:43",
        size: "175 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=200&auto=format&fit=crop&q=60",
        name: "Forest-road.jpg",
        date: "07.07.2026 at 10:23",
        size: "240 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=200&auto=format&fit=crop&q=60",
        name: "Night-sky.jpg",
        date: "28.06.2026 at 09:13",
        size: "310 KB",
      },
      {
        type: "pdf",
        path: "#",
        name: "Travel-notes.pdf",
        date: "14.06.2026 at 22:23",
        size: "88 KB",
      },
    ],
  },
  {
    id: 14,
    name: "Meggi Sharple",
    avatar: "https://i.pravatar.cc/150?img=14",
    gender: "Male",
    email: "msharpled@surveymonkey.com",
    phone: "690-702-4333",
    about:
      "I love reading, traveling and discovering new things. You need to be happy in life.",
    last_seen: "2 minute ago",
    online_status: null,
    website: "https://shadcnuikit.com",
    social_links: [
      {
        name: "Facebook",
        url: "https://www.facebook.com/",
      },
      {
        name: "X",
        url: "https://www.x.com/",
      },
      {
        name: "Linkedin",
        url: "https://www.linkedin.com/",
      },
      {
        name: "Instagram",
        url: "https://www.instagram.com/",
      },
      {
        name: "Dribbble",
        url: "https://www.dribbble.com/",
      },
    ],
    country: "Mexico",
    medias: [
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=200&auto=format&fit=crop&q=60",
        name: "Forest-road.jpg",
        date: "10.07.2026 at 11:43",
        size: "240 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=200&auto=format&fit=crop&q=60",
        name: "Night-sky.jpg",
        date: "07.07.2026 at 10:23",
        size: "310 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200&auto=format&fit=crop&q=60",
        name: "Mountain-trip.jpg",
        date: "28.06.2026 at 09:13",
        size: "96 KB",
      },
      {
        type: "pdf",
        path: "#",
        name: "Travel-notes.pdf",
        date: "14.06.2026 at 22:23",
        size: "88 KB",
      },
    ],
  },
  {
    id: 15,
    name: "Tann Chaston",
    avatar: "https://i.pravatar.cc/150?img=15",
    gender: "Female",
    email: "tchastone@google.fr",
    phone: "359-172-3295",
    about:
      "I love reading, traveling and discovering new things. You need to be happy in life.",
    last_seen: "2 minute ago",
    online_status: "success",
    website: "https://shadcnuikit.com",
    social_links: [
      {
        name: "Facebook",
        url: "https://www.facebook.com/",
      },
      {
        name: "X",
        url: "https://www.x.com/",
      },
      {
        name: "Linkedin",
        url: "https://www.linkedin.com/",
      },
      {
        name: "Instagram",
        url: "https://www.instagram.com/",
      },
      {
        name: "Dribbble",
        url: "https://www.dribbble.com/",
      },
    ],
    country: "Russia",
    medias: [
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=200&auto=format&fit=crop&q=60",
        name: "Night-sky.jpg",
        date: "10.07.2026 at 11:43",
        size: "310 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200&auto=format&fit=crop&q=60",
        name: "Mountain-trip.jpg",
        date: "07.07.2026 at 10:23",
        size: "96 KB",
      },
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=200&auto=format&fit=crop&q=60",
        name: "Sunset-walk.jpg",
        date: "28.06.2026 at 09:13",
        size: "175 KB",
      },
      {
        type: "pdf",
        path: "#",
        name: "Travel-notes.pdf",
        date: "14.06.2026 at 22:23",
        size: "88 KB",
      },
    ],
  },
]

type ContactStore = {
  contacts: UserPropsTypes[]
  selectedContact: UserPropsTypes | null
  setSelectedContact: (contact: UserPropsTypes | null) => void
  addContact: (contact: Omit<UserPropsTypes, "id">) => void
}

export const useContactStore = create<ContactStore>((set) => ({
  contacts: initialContacts,
  selectedContact: null,
  setSelectedContact: (selectedContact) => set({ selectedContact }),
  addContact: (contact) =>
    set((state) => ({
      contacts: [
        {
          ...contact,
          id: Math.max(0, ...state.contacts.map((item) => item.id)) + 1,
        },
        ...state.contacts,
      ],
    })),
}))
