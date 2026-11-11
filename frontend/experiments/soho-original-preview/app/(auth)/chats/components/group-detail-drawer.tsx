"use client";

import { useState } from "react";
import { ChatItemProps } from "@/types";
import { generateAvatarFallback } from "@/lib/generate-avatar-fallback";
import { OWN_USER } from "../status-store";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Bell, BellOff, LogOut, X } from "lucide-react";
import { useChatStore } from "../chat-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import UserAvatar from "@/components/user-avatar";
import { Button } from "@/components/ui/button";

export default function GroupDetailDrawer({ chat }: { chat: ChatItemProps }) {
  const profileOpen = useChatStore((state) => state.profileOpen);
  const setProfileOpen = useChatStore((state) => state.setProfileOpen);
  const [muted, setMuted] = useState(false);

  const members = [OWN_USER, ...(chat.members ?? [])];

  return (
    <Drawer
      open={profileOpen}
      onOpenChange={setProfileOpen}
      swipeDirection="right"
    >
      <DrawerContent>
        <DrawerHeader className="flex-row items-center justify-between p-6 pb-2">
          <DrawerTitle className="text-xl">Group details</DrawerTitle>
          <DrawerClose
            render={
              <Button variant="ghost" size="icon" className="rounded-full" />
            }
          >
            <X className="w-4 h-4" />
            <span className="sr-only">Close</span>
          </DrawerClose>
        </DrawerHeader>
        <ScrollArea className="flex-1 min-h-0" viewportClassName="scroll-fade">
          <div className="px-6 pb-6 text-start">
            <div className="flex flex-col items-center mt-2 mb-6">
              <UserAvatar
                image={chat.image}
                className="size-32 mb-4"
                fallback={generateAvatarFallback(chat.name ?? "Group")}
              />
              <h4 className="text-lg font-semibold">{chat.name}</h4>
              <div className="text-sm text-muted-foreground mt-0.5">
                Group · {members.length} members
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setMuted(!muted)}>
                {muted ? (
                  <Bell className="size-4" />
                ) : (
                  <BellOff className="size-4" />
                )}
                {muted ? "Unmute" : "Mute"}
              </Button>
              <Button
                variant="destructive"
                onClick={() => setProfileOpen(false)}
              >
                <LogOut className="size-4" /> Leave group
              </Button>
            </div>
            <div className="space-y-3 border-t mt-6 pt-5">
              <h5 className="text-sm font-semibold">
                Members ({members.length})
              </h5>
              <div className="-mx-2 space-y-1">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted"
                  >
                    <UserAvatar
                      className="size-10"
                      image={member.avatar}
                      indicator={member.online_status}
                      fallback={generateAvatarFallback(member.name)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {member.id === OWN_USER.id ? "You" : member.name}
                      </div>
                      {member.phone && (
                        <div className="text-xs text-muted-foreground truncate">
                          {member.phone}
                        </div>
                      )}
                    </div>
                    {member.id === OWN_USER.id && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Admin
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
