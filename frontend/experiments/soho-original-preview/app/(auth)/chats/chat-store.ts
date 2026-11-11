import { create } from "zustand"

import { ChatItemProps, ChatMessageProps } from "@/types"

import { initialContacts } from "@/app/(auth)/contacts/contact-store"

const chatsData: Omit<ChatItemProps, "user">[] = [
  {
    id: 1,
    date: "10 minutes",
    last_message: "Great! Looking forward to it. See you later!",
    status: "sent",
    is_archive: false,
    messages: [
      {
        id: 1,
        content: "Hey Toby! Are we still on for the hike this weekend?",
        type: "text",
        read: true,
        own_message: false,
      },
      {
        id: 2,
        content: "Absolutely! I was just going over the route this morning.",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 3,
        type: "file",
        data: {
          file_name: "trail-map.pdf",
          path: "/files/trail-map.pdf",
          size: "2.4MB",
        },
        read: true,
        own_message: true,
      },
      {
        id: 4,
        content:
          "Here's the trail map. It's about 12km round trip with a great viewpoint halfway.",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 5,
        content: "Perfect, thanks! The route looks totally doable.",
        type: "text",
        read: true,
        own_message: false,
      },
      {
        id: 6,
        type: "image",
        data: {
          images: [
            "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&auto=format&fit=crop&q=60",
          ],
        },
        read: true,
        own_message: false,
      },
      {
        id: 7,
        content:
          "This is from the summit last year. The night sky up there is unreal.",
        type: "text",
        read: true,
        own_message: false,
      },
      {
        id: 8,
        type: "video",
        data: {
          cover:
            "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&auto=format&fit=crop&q=60",
          path: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4",
          duration: "0:10",
        },
        read: true,
        own_message: true,
      },
      {
        id: 9,
        content:
          "That's the forest section from my last trip — watch it till the end!",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 10,
        type: "sound",
        data: {
          path: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        },
        read: true,
        own_message: false,
      },
      {
        id: 11,
        type: "image",
        data: {
          images: [
            "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&auto=format&fit=crop&q=60",
            "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&auto=format&fit=crop&q=60",
            "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&auto=format&fit=crop&q=60",
            "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&auto=format&fit=crop&q=60",
            "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&auto=format&fit=crop&q=60",
          ],
        },
        read: true,
        own_message: true,
      },
      {
        id: 12,
        content: "Some shots from my last few trips. Saturday can't come soon enough!",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 13,
        content: "Great! Looking forward to it. See you later!",
        type: "text",
        read: false,
        own_message: false,
      },
    ],
    user_id: 1,
    medias: [
      {
        type: "image",
        path: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&auto=format&fit=crop&q=60",
      },
      {
        type: "pdf",
        path: "/path/file.pdf",
      },
      {
        type: "excel",
        path: "/path/file.excel",
      },
      {
        type: "file",
        path: "/path/file.txt",
      },
    ],
  },
  {
    id: 2,
    date: "40 minutes",
    last_message:
      "Sounds perfect! I've been wanting to try that place. See you there!",
    status: "read",
    is_archive: true,
    messages: [
      {
        id: 1,
        content: "Have you heard about the new ramen place on 5th Avenue?",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 2,
        content: "No! Is it any good?",
        type: "text",
        read: true,
        own_message: false,
      },
      {
        id: 3,
        type: "image",
        data: {
          images: [
            "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&auto=format&fit=crop&q=60",
          ],
        },
        read: true,
        own_message: true,
      },
      {
        id: 4,
        content:
          "A friend sent me this — the tonkotsu looks incredible. Dinner on Friday?",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 5,
        content:
          "Sounds perfect! I've been wanting to try that place. See you there!",
        type: "text",
        read: false,
        own_message: false,
      },
    ],
    user_id: 2,
  },
  {
    id: 3,
    date: "Yesterday",
    last_message: "How about 7 PM at the new Italian place downtown?",
    status: "read",
    is_archive: true,
    messages: [
      {
        id: 1,
        content: "We should catch up over dinner this week!",
        type: "text",
        read: true,
        own_message: false,
      },
      {
        id: 2,
        content: "Count me in. Where were you thinking?",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 3,
        content: "How about 7 PM at the new Italian place downtown?",
        type: "text",
        read: true,
        own_message: false,
      },
    ],
    user_id: 3,
  },
  {
    id: 4,
    date: "13 days",
    last_message: "What time should we meet?",
    status: "sent",
    messages: [
      {
        id: 1,
        type: "image",
        data: {
          images: [
            "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&auto=format&fit=crop&q=60",
            "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&auto=format&fit=crop&q=60",
          ],
        },
        read: true,
        own_message: false,
      },
      {
        id: 2,
        content: "Look at these spots I found for the weekend!",
        type: "text",
        read: true,
        own_message: false,
      },
      {
        id: 3,
        content: "Wow, that lake looks amazing. I'm in!",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 4,
        content: "What time should we meet?",
        type: "text",
        read: true,
        own_message: false,
      },
    ],
    user_id: 4,
  },
  {
    id: 5,
    date: "2 days",
    last_message:
      "No worries at all! I’ll grab a table and wait for you. Drive safe!",
    status: "forwarded",
    messages: [
      {
        id: 1,
        content: "Stuck in traffic, might be 15 minutes late 😩",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 2,
        type: "sound",
        data: {
          path: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
        },
        read: true,
        own_message: false,
      },
      {
        id: 3,
        content:
          "No worries at all! I’ll grab a table and wait for you. Drive safe!",
        type: "text",
        read: true,
        own_message: false,
      },
    ],
    user_id: 5,
  },
  {
    id: 6,
    date: "Yesterday",
    last_message: "She just told me today.",
    status: "read",
    messages: [
      {
        id: 1,
        content: "Did you hear? Mia got the job at the design studio! 🎉",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 2,
        content: "I know, isn't it great?",
        type: "text",
        read: true,
        own_message: false,
      },
      {
        id: 3,
        content: "How did you find out so fast? 😄",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 4,
        content: "She just told me today.",
        type: "text",
        read: true,
        own_message: false,
      },
    ],
    user_id: 6,
  },
  {
    id: 7,
    date: "1 day",
    last_message: "See you in 5 minutes!",
    status: "sent",
    messages: [
      {
        id: 1,
        content: "I'm at the corner café, grabbed us a spot by the window.",
        type: "text",
        read: true,
        own_message: false,
      },
      {
        id: 2,
        content: "Just parked the car.",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 3,
        content: "See you in 5 minutes!",
        type: "text",
        read: true,
        own_message: true,
      },
    ],
    user_id: 7,
  },
  {
    id: 8,
    date: "3 hours",
    last_message: "Got it, thanks! You can mail the printed copies later.",
    status: "forwarded",
    messages: [
      {
        id: 1,
        content: "Could you send over the signed contract when you get a chance?",
        type: "text",
        read: true,
        own_message: false,
      },
      {
        id: 2,
        type: "file",
        data: {
          file_name: "signed_contract.pdf",
          path: "/files/signed_contract.pdf",
          size: "184KB",
        },
        read: true,
        own_message: true,
      },
      {
        id: 3,
        content: "Here it is. Let me know if anything's missing.",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 4,
        content: "Got it, thanks! You can mail the printed copies later.",
        type: "text",
        read: true,
        own_message: false,
      },
    ],
    user_id: 8,
  },
  {
    id: 9,
    date: "1 day",
    last_message:
      "Absolutely! It’s amazing to see her so happy and passionate about it.",
    status: "read",
    messages: [
      {
        id: 1,
        content: "I finally put together the video from our road trip!",
        type: "text",
        read: true,
        own_message: false,
      },
      {
        id: 2,
        type: "video",
        data: {
          cover:
            "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&auto=format&fit=crop&q=60",
          path: "https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4",
          duration: "0:10",
        },
        read: true,
        own_message: false,
      },
      {
        id: 3,
        content: "This is beautiful! The drone shots came out incredible.",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 4,
        content: "Right? Ana edited the whole thing herself.",
        type: "text",
        read: true,
        own_message: false,
      },
      {
        id: 5,
        content:
          "Absolutely! It’s amazing to see her so happy and passionate about it.",
        type: "text",
        read: true,
        own_message: true,
      },
    ],
    user_id: 9,
  },
  {
    id: 10,
    date: "1 day",
    last_message: "Yeah, she mentioned it last week.",
    status: "read",
    messages: [
      {
        id: 1,
        content: "Is Sarah really moving to Berlin? Someone mentioned it at lunch.",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 2,
        content: "Yeah, she mentioned it last week.",
        type: "text",
        read: true,
        own_message: false,
      },
    ],
    user_id: 10,
  },
  {
    id: 11,
    date: "Yesterday",
    last_message: "Thanks, I appreciate it! ",
    status: "sent",
    messages: [
      {
        id: 1,
        content: "Could you take a look at my pitch deck before tomorrow?",
        type: "text",
        read: true,
        own_message: false,
      },
      {
        id: 2,
        type: "file",
        data: {
          file_name: "pitch_deck.pdf",
          path: "/files/pitch_deck.pdf",
          size: "6.1MB",
        },
        read: true,
        own_message: false,
      },
      {
        id: 3,
        content:
          "Just went through it — left a few comments on the market slide. Strong work!",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 4,
        content: "Thanks, I appreciate it!",
        type: "text",
        read: true,
        own_message: false,
      },
    ],
    user_id: 11,
  },
  {
    id: 12,
    date: "1 hours",
    last_message: "Drive safe!",
    status: "read",
    messages: [
      {
        id: 1,
        content: "Are you on your way?",
        type: "text",
        read: true,
        own_message: false,
      },
      {
        id: 2,
        type: "sound",
        data: {
          path: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
        },
        read: true,
        own_message: true,
      },
      {
        id: 3,
        content: "Just left home, I'll be there in 20.",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 4,
        content: "Drive safe!",
        type: "text",
        read: true,
        own_message: false,
      },
    ],
    user_id: 12,
  },
  {
    id: 13,
    date: "10 days",
    last_message: "I might be 10 minutes late. Sorry!",
    status: "read",
    messages: [
      {
        id: 1,
        content: "Meeting still at 3 PM?",
        type: "text",
        read: true,
        own_message: false,
      },
      {
        id: 2,
        content: "Yes, at the usual spot.",
        type: "text",
        read: true,
        own_message: true,
      },
      {
        id: 3,
        content: "I might be 10 minutes late. Sorry!",
        type: "text",
        read: true,
        own_message: false,
      },
    ],
    user_id: 13,
  },
]

export const initialChats: ChatItemProps[] = chatsData
  .map((chat) => ({
    ...chat,
    user: initialContacts.find((contact) => contact.id === chat.user_id)!,
  }))
  .filter((chat) => chat.user)

type ChatStore = {
  chats: ChatItemProps[]
  selectedChat: ChatItemProps | null
  activeCall: { type: "video" | "voice" } | null
  callChatOpen: boolean
  profileOpen: boolean
  setProfileOpen: (open: boolean) => void
  setSelectedChat: (chat: ChatItemProps | null) => void
  startCall: (type: "video" | "voice") => void
  endCall: () => void
  toggleCallChat: () => void
  setCallChatOpen: (open: boolean) => void
  addChat: (chat: Omit<ChatItemProps, "id">) => void
  sendMessage: (
    message: Omit<ChatMessageProps, "id" | "own_message" | "read">,
    lastMessage: string
  ) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  chats: initialChats,
  selectedChat: null,
  activeCall: null,
  callChatOpen: true,
  profileOpen: false,
  setProfileOpen: (profileOpen) => set({ profileOpen }),
  setSelectedChat: (selectedChat) => set({ selectedChat }),
  startCall: (type) =>
    set({
      activeCall: { type },
      // Side panel starts open on desktop; the chat drawer starts closed on mobile
      callChatOpen:
        typeof window === "undefined" ||
        window.matchMedia("(min-width: 1024px)").matches,
    }),
  endCall: () => set({ activeCall: null, callChatOpen: true }),
  toggleCallChat: () =>
    set((state) => ({ callChatOpen: !state.callChatOpen })),
  setCallChatOpen: (callChatOpen) => set({ callChatOpen }),
  addChat: (chat) =>
    set((state) => {
      const newChat: ChatItemProps = {
        ...chat,
        id: Math.max(0, ...state.chats.map((item) => item.id)) + 1,
      }

      return { chats: [newChat, ...state.chats], selectedChat: newChat }
    }),
  sendMessage: (message, lastMessage) =>
    set((state) => {
      if (!state.selectedChat) return state

      const messages = state.selectedChat.messages ?? []

      const newMessage: ChatMessageProps = {
        ...message,
        id: Math.max(0, ...messages.map((item) => item.id)) + 1,
        own_message: true,
        read: true,
      }

      const updatedChat: ChatItemProps = {
        ...state.selectedChat,
        messages: [...messages, newMessage],
        last_message: lastMessage,
        date: "Just now",
        status: "sent",
      }

      return {
        selectedChat: updatedChat,
        chats: [
          updatedChat,
          ...state.chats.filter((chat) => chat.id !== updatedChat.id),
        ],
      }
    }),
}))
