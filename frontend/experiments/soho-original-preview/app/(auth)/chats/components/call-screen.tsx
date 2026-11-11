"use client";

import { useEffect, useRef, useState } from "react";

import {
  CircleDot,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  Settings,
  Video,
  VideoOff,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { generateAvatarFallback } from "@/lib/generate-avatar-fallback";
import { OWN_USER } from "../status-store";
import { useChatStore } from "../chat-store";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsDialog } from "@/components/settings-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import UserAvatar from "@/components/user-avatar";

function formatCallDuration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60
  ).padStart(2, "0")}`;
}

function CallControlButton({
  active = false,
  onClick,
  children,
  label,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={active ? "default" : "secondary"}
            size="icon"
            className="size-11 rounded-full"
            onClick={onClick}
          />
        }
      >
        {children}
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export default function CallScreen() {
  const activeCall = useChatStore((state) => state.activeCall);
  const endCall = useChatStore((state) => state.endCall);
  const selectedChat = useChatStore((state) => state.selectedChat);
  const callChatOpen = useChatStore((state) => state.callChatOpen);
  const toggleCallChat = useChatStore((state) => state.toggleCallChat);

  const [seconds, setSeconds] = useState(0);
  const [micOff, setMicOff] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selfStreamReady, setSelfStreamReady] = useState(false);
  const selfVideoRef = useRef<HTMLVideoElement>(null);

  const isVideoCall = activeCall?.type === "video";
  const showSelfVideo = isVideoCall && !cameraOff && selfStreamReady;

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((value) => value + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Use the real camera for the self preview when possible
  useEffect(() => {
    if (!isVideoCall || cameraOff) return;

    let stream: MediaStream | undefined;
    let cancelled = false;

    navigator.mediaDevices
      ?.getUserMedia({ video: true })
      .then((mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        stream = mediaStream;
        if (selfVideoRef.current) {
          selfVideoRef.current.srcObject = mediaStream;
          setSelfStreamReady(true);
        }
      })
      .catch(() => {
        // No camera access, fall back to the avatar
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      setSelfStreamReady(false);
    };
  }, [isVideoCall, cameraOff]);

  if (!activeCall) return null;

  const user = selectedChat?.user;
  const unreadCount =
    selectedChat?.messages?.filter(
      (message) => !message.read && !message.own_message
    ).length ?? 0;

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 flex flex-col gap-4 bg-background p-4 lg:static lg:z-auto lg:min-w-0 lg:flex-1 lg:p-6",
        { "lg:pe-0": callChatOpen }
      )}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-muted">
        {user?.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <UserAvatar
              className="size-32"
              image={user?.avatar}
              fallback={generateAvatarFallback(user?.name ?? "?")}
            />
          </div>
        )}
        <div className="absolute bottom-3 end-3 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
          {user?.name}
        </div>
        <div className="absolute top-3 end-3 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white tabular-nums">
          {formatCallDuration(seconds)}
        </div>
        <div className="absolute start-3 top-3 aspect-video w-32 overflow-hidden rounded-xl border border-white/20 bg-background shadow-lg lg:w-44">
          <video
            ref={selfVideoRef}
            autoPlay
            muted
            playsInline
            className={
              showSelfVideo ? "size-full -scale-x-100 object-cover" : "hidden"
            }
          />
          {!showSelfVideo && (
            <div className="flex size-full items-center justify-center bg-muted">
              <UserAvatar
                className="size-12 lg:size-16"
                image={OWN_USER.avatar}
                fallback={generateAvatarFallback(OWN_USER.name)}
              />
            </div>
          )}
          <div className="absolute bottom-1.5 start-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
            You
          </div>
        </div>
      </div>
      <Card className="shrink-0 gap-0 py-0">
        <CardContent className="flex items-center gap-2 p-3">
          <div className="hidden flex-1 sm:block" />
          <div className="flex flex-1 items-center justify-start gap-2 sm:justify-center">
            <CallControlButton
              active={micOff}
              label={micOff ? "Unmute" : "Mute"}
              onClick={() => setMicOff(!micOff)}
            >
              {micOff ? (
                <MicOff className="size-4.5" />
              ) : (
                <Mic className="size-4.5" />
              )}
            </CallControlButton>
            {isVideoCall && (
              <CallControlButton
                active={cameraOff}
                label={cameraOff ? "Turn camera on" : "Turn camera off"}
                onClick={() => setCameraOff(!cameraOff)}
              >
                {cameraOff ? (
                  <VideoOff className="size-4.5" />
                ) : (
                  <Video className="size-4.5" />
                )}
              </CallControlButton>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className={
                      recording
                        ? "size-11 rounded-full text-red-600 hover:text-red-600"
                        : "size-11 rounded-full"
                    }
                    onClick={() => setRecording(!recording)}
                  />
                }
              >
                <CircleDot
                  className={recording ? "size-4.5 animate-pulse" : "size-4.5"}
                />
                <span className="sr-only">Record</span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {recording ? "Stop recording" : "Record"}
              </TooltipContent>
            </Tooltip>
            <CallControlButton
              active={sharing}
              label="Share screen"
              onClick={() => setSharing(!sharing)}
            >
              <MonitorUp className="size-4.5" />
            </CallControlButton>
            <span className="relative">
              <CallControlButton
                active={callChatOpen}
                label={callChatOpen ? "Hide chat" : "Show chat"}
                onClick={toggleCallChat}
              >
                <MessageSquare className="size-4.5" />
              </CallControlButton>
              {!callChatOpen && unreadCount > 0 && (
                <span className="pointer-events-none absolute end-0 top-0 size-2.5 rounded-full bg-red-500 ring-2 ring-card" />
              )}
            </span>
            <CallControlButton
              label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="size-4.5" />
            </CallControlButton>
          </div>
          <div className="flex flex-1 justify-end">
            <Button type="button" variant="destructive" onClick={endCall}>
              End Call
            </Button>
          </div>
        </CardContent>
      </Card>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
