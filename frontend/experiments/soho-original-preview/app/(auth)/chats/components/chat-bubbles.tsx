"use client";

import { useMemo, useRef, useState } from "react";

import { ChatMessageProps } from "@/types";
import { cn } from "@/lib/utils";

import MediaLightbox from "./media-lightbox";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/confirm-dialog";
import {
  Ellipsis,
  FileIcon,
  Forward,
  PauseIcon,
  PlayIcon,
  SquarePen,
  Star,
  Trash2,
} from "lucide-react";
import MessageStatusIcon from "./message-status-icon";

function MessageActionsDropdown({ message }: { message: ChatMessageProps }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className={cn(
        "shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity",
        { "order-2": !message.own_message }
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" className="rounded-full" />}
        >
          <Ellipsis className="w-4 h-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-40">
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <Forward /> Forward
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Star /> Star
            </DropdownMenuItem>
            {message.own_message && (
              <DropdownMenuItem>
                <SquarePen /> Edit
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this message?"
        description="This message will be removed for everyone in the conversation. This action cannot be undone."
        actionLabel="Delete"
      />
    </div>
  );
}

function MessageMeta({ message }: { message: ChatMessageProps }) {
  return (
    <div
      className={cn("flex items-center gap-1 mt-1", {
        "justify-end": message.own_message,
      })}
    >
      <time className="text-xs text-muted-foreground tabular-nums">
        05:23 PM
      </time>
      {message.own_message && <MessageStatusIcon status="read" />}
    </div>
  );
}

function ChatBubbleWrapper({
  message,
  children,
}: {
  message: ChatMessageProps;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("group flex w-full flex-col", {
        "items-end": message.own_message,
        "items-start": !message.own_message,
      })}
    >
      <div className="flex items-center gap-1 min-w-0 max-w-[min(85%,42rem)]">
        {children}
        <MessageActionsDropdown message={message} />
      </div>
      <MessageMeta message={message} />
    </div>
  );
}

function MessageBubble({
  message,
  children,
  className,
}: {
  message: ChatMessageProps;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Bubble
      variant={message.own_message ? "default" : "muted"}
      align={message.own_message ? "end" : "start"}
      className={cn("max-w-full", { "order-1": message.own_message })}
    >
      <BubbleContent className={className}>{children}</BubbleContent>
    </Bubble>
  );
}

function TextChatBubble({ message }: { message: ChatMessageProps }) {
  return (
    <ChatBubbleWrapper message={message}>
      <MessageBubble message={message}>{message.content}</MessageBubble>
    </ChatBubbleWrapper>
  );
}

function FileChatBubble({ message }: { message: ChatMessageProps }) {
  return (
    <ChatBubbleWrapper message={message}>
      <MessageBubble message={message} className="flex items-center p-4">
        <FileIcon
          className="w-8 h-8 opacity-50 me-4 shrink-0"
          strokeWidth={1.5}
        />
        <div className="flex flex-col gap-2 min-w-0">
          <div className="font-medium truncate">
            {message.data?.file_name}
            <span
              className={cn("text-xs font-normal ms-2", {
                "text-primary-foreground/70": message.own_message,
                "text-muted-foreground": !message.own_message,
              })}
            >
              ({message.data?.size})
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant={message.own_message ? "secondary" : "outline"}
              size="sm"
            >
              Download
            </Button>
            <Button
              variant={message.own_message ? "secondary" : "outline"}
              size="sm"
            >
              Preview
            </Button>
          </div>
        </div>
      </MessageBubble>
    </ChatBubbleWrapper>
  );
}

function VideoChatBubble({ message }: { message: ChatMessageProps }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const videoPath = message?.data?.path;

  return (
    <ChatBubbleWrapper message={message}>
      <Bubble
        variant="ghost"
        align={message.own_message ? "end" : "start"}
        className={cn({ "order-1": message.own_message })}
      >
        <BubbleContent className="p-0">
          {message?.data?.cover ? (
            <div
              style={{ backgroundImage: `url(${message.data.cover})` }}
              onClick={() => setLightboxOpen(true)}
              className="cursor-pointer w-64 aspect-4/3 bg-cover bg-center rounded-2xl flex items-center justify-center relative hover:opacity-90 transition-opacity"
            >
              <div className="size-12 rounded-full bg-black/50 flex items-center justify-center">
                <PlayIcon className="text-white w-5 h-5 fill-white" />
              </div>
              {message.data.duration && (
                <div className="absolute top-2 end-2 text-white text-xs font-medium bg-black/50 rounded-full px-2 py-0.5">
                  {message.data.duration}
                </div>
              )}
            </div>
          ) : videoPath ? (
            <div
              className="relative cursor-pointer overflow-hidden rounded-2xl transition-opacity hover:opacity-90"
              onClick={() => setLightboxOpen(true)}
            >
              <video
                className="w-64 bg-black pointer-events-none"
                playsInline
                muted
                preload="metadata"
                src={videoPath}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="size-12 rounded-full bg-black/50 flex items-center justify-center">
                  <PlayIcon className="text-white w-5 h-5 fill-white" />
                </div>
              </div>
            </div>
          ) : null}
        </BubbleContent>
      </Bubble>
      {lightboxOpen && (
        <MediaLightbox
          items={[
            videoPath
              ? { type: "video", src: videoPath }
              : { type: "image", src: message?.data?.cover ?? "" },
          ]}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </ChatBubbleWrapper>
  );
}

const WAVEFORM_BARS = 32;

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const value = Math.round(seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

// Deterministic pseudo-waveform seeded by the audio source
function generateWaveform(src: string) {
  let seed = 7;
  for (const char of src) seed = (seed * 31 + char.charCodeAt(0)) % 233280;

  return Array.from({ length: WAVEFORM_BARS }, () => {
    seed = (seed * 9301 + 49297) % 233280;
    return 0.2 + (seed / 233280) * 0.8;
  });
}

function SoundChatBubble({ message }: { message: ChatMessageProps }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const src = message?.data?.path ?? "";
  const own = message.own_message;

  const bars = useMemo(() => generateWaveform(src), [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * audio.duration;
  };

  return (
    <ChatBubbleWrapper message={message}>
      <MessageBubble message={message} className="flex flex-col gap-1 p-3">
        {message.content && <span className="px-1">{message.content}</span>}
        <div className="flex items-center gap-3">
          <audio
            ref={audioRef}
            src={src}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              setProgress(0);
              setCurrentTime(0);
            }}
            onDurationChange={(e) => setDuration(e.currentTarget.duration)}
            onTimeUpdate={(e) => {
              const audio = e.currentTarget;
              setCurrentTime(audio.currentTime);
              setProgress(audio.currentTime / (audio.duration || 1));
            }}
          />
          <Button
            type="button"
            size="icon"
            variant={own ? "secondary" : "default"}
            className="size-9 shrink-0 rounded-full"
            onClick={togglePlay}
          >
            {playing ? (
              <PauseIcon className="size-4 fill-current" />
            ) : (
              <PlayIcon className="size-4 fill-current" />
            )}
            <span className="sr-only">{playing ? "Pause" : "Play"}</span>
          </Button>
          <div
            className="flex h-9 w-40 cursor-pointer items-center gap-0.5 sm:w-48"
            onClick={handleSeek}
          >
            {bars.map((height, key) => (
              <span
                key={key}
                style={{ height: `${Math.round(height * 100)}%` }}
                className={cn(
                  "min-w-0 flex-1 rounded-full transition-colors",
                  progress > 0 && key / WAVEFORM_BARS < progress
                    ? own
                      ? "bg-primary-foreground"
                      : "bg-foreground"
                    : own
                      ? "bg-primary-foreground/40"
                      : "bg-foreground/25"
                )}
              />
            ))}
          </div>
          <span
            className={cn("text-xs tabular-nums min-w-9 text-end shrink-0", {
              "text-primary-foreground/70": own,
              "text-muted-foreground": !own,
            })}
          >
            {formatAudioTime(playing || currentTime > 0 ? currentTime : duration)}
          </span>
        </div>
      </MessageBubble>
    </ChatBubbleWrapper>
  );
}

function ImageChatBubble({ message }: { message: ChatMessageProps }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const images_limit = 4;
  const images = message?.data?.images ?? [];
  const images_with_limit = images.slice(0, images_limit);

  return (
    <ChatBubbleWrapper message={message}>
      <MessageBubble message={message} className="flex flex-col gap-2 p-1.5">
        {message.content && (
          <div className="px-2 pt-1">{message.content}</div>
        )}
        {images.length > 0 && (
          <div
            className={cn("grid gap-1.5", {
              "grid-cols-1": images.length === 1,
              "grid-cols-2": images.length > 1,
            })}
          >
            {images_with_limit.map((image, key) => (
              <figure
                className="relative rounded-[calc(var(--radius-3xl)-6px)] overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                key={key}
                onClick={() => setLightboxIndex(key)}
              >
                <img
                  className="aspect-4/3 object-cover w-52"
                  src={image}
                  alt="image"
                />
                {images.length > images_limit && key + 1 === images_limit && (
                  <div className="text-2xl text-white flex items-center justify-center font-semibold absolute inset-0 bg-black/40">
                    +{images.length - images_with_limit.length}
                  </div>
                )}
              </figure>
            ))}
          </div>
        )}
      </MessageBubble>
      {lightboxIndex !== null && (
        <MediaLightbox
          items={images.map((image) => ({ type: "image" as const, src: image }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </ChatBubbleWrapper>
  );
}

export default function ChatBubble({
  message,
  type,
}: {
  message: ChatMessageProps;
  type?: string;
}) {
  switch (type) {
    case "text":
      return <TextChatBubble message={message} />;
    case "video":
      return <VideoChatBubble message={message} />;
    case "sound":
      return <SoundChatBubble message={message} />;
    case "image":
      return <ImageChatBubble message={message} />;
    case "file":
      return <FileChatBubble message={message} />;
    default:
      return null;
  }
}
