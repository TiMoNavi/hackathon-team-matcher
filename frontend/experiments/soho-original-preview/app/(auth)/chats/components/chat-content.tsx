"use client";

import { useEffect, useRef, useState } from "react";
import { ChatMessageProps } from "@/types";
import { cn } from "@/lib/utils";

import { MessageSquarePlus, UsersRound } from "lucide-react";

import ChatFooter from "./chat-footer";
import ChatHeader from "./chat-header";
import ChatBubble from "./chat-bubbles";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { useChatStore } from "../chat-store";
import UserDetailSheet from "./user-detail-sheet";
import GroupDetailDrawer from "./group-detail-drawer";
import NewMessageDialog from "./new-message-dialog";

export default function ChatContent({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const selectedChat = useChatStore((state) => state.selectedChat);
  const [newMessageMode, setNewMessageMode] = useState<
    "message" | "group" | null
  >(null);

  useEffect(() => {
    const viewport = messagesContainerRef.current?.closest(
      '[data-slot="scroll-area-viewport"]'
    );

    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [selectedChat?.id, selectedChat?.messages?.length]);

  if (!selectedChat) {
    return (
      <Empty className="h-full hidden lg:flex">
        <EmptyHeader>
          <EmptyMedia variant="default" className="w-full max-w-xs">
            <img
              className="w-full dark:invert"
              src="/not-selected-chat.svg"
              alt="No chat selected"
            />
          </EmptyMedia>
          <EmptyTitle>No conversation selected</EmptyTitle>
          <EmptyDescription>
            Choose a chat from the list to see its messages here, or start a
            new conversation.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex gap-2">
            <Button onClick={() => setNewMessageMode("message")}>
              <MessageSquarePlus /> New chat
            </Button>
            <Button
              variant="outline"
              onClick={() => setNewMessageMode("group")}
            >
              <UsersRound /> Create group
            </Button>
          </div>
        </EmptyContent>
        <NewMessageDialog
          mode={newMessageMode ?? "message"}
          open={newMessageMode !== null}
          onOpenChange={(value) => {
            if (!value) setNewMessageMode(null);
          }}
        />
      </Empty>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col h-full",
        embedded
          ? "relative p-4 pt-2"
          : "z-50 inset-0 bg-background lg:bg-transparent fixed lg:relative p-4 lg:p-0"
      )}
    >
      <ChatHeader user={selectedChat.user} embedded={embedded} />
      <ScrollArea
        className="w-full flex-1 min-h-0"
        viewportClassName="scroll-fade scroll-fade-16"
      >
        <div ref={messagesContainerRef}>
          <div className="flex flex-col py-6 pe-4 space-y-4">
            {selectedChat?.messages?.length &&
              selectedChat.messages.map((item: ChatMessageProps) => (
                <ChatBubble message={item} type={item.type} key={item.id} />
              ))}
          </div>
        </div>
      </ScrollArea>
      <ChatFooter />
      {selectedChat.name ? (
        <GroupDetailDrawer chat={selectedChat} />
      ) : (
        <UserDetailSheet user={selectedChat.user} />
      )}
    </div>
  );
}
