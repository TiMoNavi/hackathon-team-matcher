import { create } from "zustand"

import { StatusItemProps, StatusMediaProps, UserPropsTypes } from "@/types"

import { initialContacts } from "@/app/(auth)/contacts/contact-store"

export const OWN_USER: UserPropsTypes = {
  id: 0,
  name: "Toby Belhome",
  avatar: "https://i.pravatar.cc/150?img=13",
}

const statusData: Omit<StatusItemProps, "user">[] = [
  {
    id: 1,
    images: [
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&auto=format&fit=crop&q=60",
    ],
    date: "40 minutes ago",
    read: true,
    user_id: 1,
  },
  {
    id: 2,
    images: [
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&auto=format&fit=crop&q=60",
    ],
    date: "5 hours ago",
    read: false,
    user_id: 2,
  },
  {
    id: 3,
    images: [
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&auto=format&fit=crop&q=60",
    ],
    date: "13 hours ago",
    read: false,
    user_id: 3,
  },
  {
    id: 4,
    images: [
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&auto=format&fit=crop&q=60",
    ],
    date: "20 hours ago",
    read: false,
    user_id: 4,
  },
  {
    id: 5,
    user_id: 5,
    date: "1 hour ago",
    images: [
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&auto=format&fit=crop&q=60",
    ],
  },
  {
    id: 6,
    user_id: 6,
    date: "3 hours ago",
    images: [
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&auto=format&fit=crop&q=60",
    ],
  },
  {
    id: 7,
    user_id: 7,
    date: "6 hours ago",
    images: [
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&auto=format&fit=crop&q=60",
    ],
  },
  {
    id: 8,
    user_id: 8,
    date: "9 hours ago",
    images: [
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&auto=format&fit=crop&q=60",
    ],
  },
  {
    id: 9,
    user_id: 9,
    date: "12 hours ago",
    images: [
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&auto=format&fit=crop&q=60",
    ],
  },
]

export const initialUpdates: StatusItemProps[] = statusData
  .map((status) => ({
    ...status,
    user: initialContacts.find((contact) => contact.id === status.user_id)!,
  }))
  .filter((status) => status.user)

type StatusStore = {
  updates: StatusItemProps[]
  selectedStatus: StatusItemProps | null
  setSelectedStatus: (status: StatusItemProps | null) => void
  addOwnStatus: (media: StatusMediaProps) => void
}

export const useStatusStore = create<StatusStore>((set) => ({
  updates: initialUpdates,
  selectedStatus: null,
  setSelectedStatus: (selectedStatus) => set({ selectedStatus }),
  addOwnStatus: (media) =>
    set((state) => {
      const own = state.updates.find((status) => status.user_id === OWN_USER.id)

      if (own) {
        return {
          updates: state.updates.map((status) =>
            status.user_id === OWN_USER.id
              ? {
                  ...status,
                  items: [...(status.items ?? []), media],
                  date: "Just now",
                }
              : status
          ),
        }
      }

      return {
        updates: [
          {
            id: 0,
            images: [],
            items: [media],
            date: "Just now",
            user_id: OWN_USER.id,
            user: OWN_USER,
          },
          ...state.updates,
        ],
      }
    }),
}))
