"use client";

import { useState } from "react";

import { Search } from "lucide-react";
import ChatListItem from "./chat-list-item";
import { useChatStore } from "../chat-store";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ChatList({ archive = false }: { archive?: boolean }) {
  const chats = useChatStore((state) => state.chats);
  const selectedChat = useChatStore((state) => state.selectedChat);
  const [query, setQuery] = useState("");

  const filteredChats = chats
    .filter((chat) => (archive ? chat.is_archive : true))
    .filter((chat) =>
      (chat.name ?? chat.user.name)
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    );

  return (
    <>
      <div className="pb-3 px-6 relative flex items-center shrink-0">
        <Search className="absolute w-4 h-4 start-9 text-muted-foreground" />
        <Input
          type="text"
          className="ps-9"
          placeholder="Search chats..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="flex-1 min-h-0 flex">
        <ScrollArea className="w-full min-w-0" viewportClassName="scroll-fade">
          <div className="block divide-y min-w-0">
            {filteredChats.length ? (
              filteredChats.map((chat) => (
                <ChatListItem
                  chat={chat}
                  key={chat.id}
                  active={selectedChat ? selectedChat.id === chat.id : false}
                />
              ))
            ) : (
              <div className="text-center text-muted-foreground text-sm mt-4">
                No chat found
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
