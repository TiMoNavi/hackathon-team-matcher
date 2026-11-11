"use client";

import { useEffect, useState } from "react";

import { UserPropsTypes } from "@/types";
import { generateAvatarFallback } from "@/lib/generate-avatar-fallback";

import {
  ArrowLeft,
  Ellipsis,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Video,
  Volume2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ChatUserDropdown from "./chat-list-item-dropdown";
import UserAvatar from "@/components/user-avatar";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useChatStore } from "../chat-store";
import { Button } from "@/components/ui/button";

function CallControl({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      {children}
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function CallDrawer({
  icon,
  tooltip,
  type,
  user,
}: {
  icon: React.ReactNode;
  tooltip: string;
  type: "video" | "voice";
  user: UserPropsTypes;
}) {
  const startCall = useChatStore((state) => state.startCall);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);

  // Simulate the call being answered after a short ring
  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => {
      setOpen(false);
      startCall(type);
    }, 3000);

    return () => clearTimeout(timer);
  }, [open, startCall, type]);

  return (
    <Tooltip>
      <TooltipTrigger render={<div />}>
        <Drawer
          open={open}
          onOpenChange={(value) => {
            setOpen(value);
            if (!value) {
              setMuted(false);
              setSpeakerOn(false);
            }
          }}
        >
          <DrawerTrigger render={<Button variant="outline" size="icon" />}>
            {icon}
          </DrawerTrigger>
          <DrawerContent>
            <DrawerTitle className="sr-only">{tooltip}</DrawerTitle>
            <div className="mx-auto flex w-full max-w-sm flex-col items-center px-6 pb-10 pt-4 text-center">
              <span className="relative mb-5 mt-4">
                <span className="absolute -inset-2 animate-ping rounded-full bg-green-500/20" />
                <span className="absolute -inset-2 rounded-full border border-green-500/40" />
                <UserAvatar
                  className="relative size-24"
                  image={user.avatar}
                  fallback={generateAvatarFallback(user.name)}
                />
              </span>
              <h4 className="text-xl font-semibold">{user.name}</h4>
              <p className="mt-1 mb-10 text-sm text-muted-foreground">
                Ringing...
              </p>
              <div className="flex items-end gap-6">
                <CallControl label={muted ? "Unmute" : "Mute"}>
                  <Button
                    type="button"
                    variant={muted ? "default" : "secondary"}
                    className="size-12 rounded-full"
                    onClick={() => setMuted(!muted)}
                  >
                    {muted ? (
                      <MicOff className="size-5" />
                    ) : (
                      <Mic className="size-5" />
                    )}
                  </Button>
                </CallControl>
                <CallControl label="End call">
                  <DrawerClose
                    render={
                      <Button
                        variant="destructive"
                        className="size-16 rounded-full"
                      />
                    }
                  >
                    <PhoneOff className="size-6" />
                  </DrawerClose>
                </CallControl>
                <CallControl label="Speaker">
                  <Button
                    type="button"
                    variant={speakerOn ? "default" : "secondary"}
                    className="size-12 rounded-full"
                    onClick={() => setSpeakerOn(!speakerOn)}
                  >
                    <Volume2 className="size-5" />
                  </Button>
                </CallControl>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export default function ChatHeader({
  user,
  embedded = false,
}: {
  user: UserPropsTypes;
  embedded?: boolean;
}) {
  const setSelectedChat = useChatStore((state) => state.setSelectedChat);
  const selectedChat = useChatStore((state) => state.selectedChat);
  const activeCall = useChatStore((state) => state.activeCall);

  const isGroup = Boolean(selectedChat?.name);
  const memberCount = (selectedChat?.members?.length ?? 0) + 1;

  return (
    <div className="flex gap-4 justify-between items-center shrink-0 pb-4 border-b lg:border-b-0 lg:pb-0">
      <div className="flex gap-3 items-center">
        <Button
          size="icon"
          variant="outline"
          className={embedded ? "hidden" : "flex lg:hidden"}
          onClick={() => setSelectedChat(null)}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <UserAvatar
          image={user.avatar}
          indicator={user.online_status}
          fallback={generateAvatarFallback(user.name)}
        />
        <div className="flex flex-col">
          <span className="font-semibold leading-tight">{user.name}</span>
          {isGroup ? (
            <span className="text-xs text-muted-foreground">
              {memberCount} members
            </span>
          ) : user.online_status == "success" ? (
            <span className="text-xs text-green-600 dark:text-green-500">
              Online
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {user.last_seen}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <div className={activeCall ? "hidden" : "flex gap-1 lg:gap-2"}>
          <CallDrawer
            icon={<Video className="w-4 h-4" />}
            tooltip="Start Video Chat"
            type="video"
            user={user}
          />
          <CallDrawer
            icon={<PhoneCall className="w-4 h-4" />}
            tooltip="Start Call"
            type="voice"
            user={user}
          />
        </div>
        <ChatUserDropdown isGroup={isGroup}>
          <Button size="icon" variant="ghost">
            <Ellipsis className="w-4 h-4" />
          </Button>
        </ChatUserDropdown>
      </div>
    </div>
  );
}
