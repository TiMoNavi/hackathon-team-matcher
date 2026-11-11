"use client";

import { useEffect, useState } from "react";

import { ArrowLeft, ArrowRight, X } from "lucide-react";

import { StatusItemProps } from "@/types";
import { generateAvatarFallback } from "@/lib/generate-avatar-fallback";

import {
  Reel,
  ReelContent,
  ReelFooter,
  ReelHeader,
  ReelImage,
  ReelMuteButton,
  ReelNavigation,
  ReelPlayButton,
  ReelProgress,
  ReelVideo,
  type ReelItem,
} from "@/components/ui/reel";
import UserAvatar from "@/components/user-avatar";

const STATUS_DURATION = 5;

export function StatusReel({
  status,
  onPrevious,
  onNext,
  onComplete,
}: {
  status: StatusItemProps;
  onPrevious?: () => void;
  onNext?: () => void;
  onComplete?: () => void;
}) {
  const [index, setIndex] = useState(0);

  const medias =
    status.items ??
    status.images.map((image) => ({ type: "image" as const, src: image }));

  const items: ReelItem[] = medias.map((media, key) => ({
    id: key,
    type: media.type,
    src: media.src,
    duration: STATUS_DURATION,
    alt: `${status.user.name} status`,
    description: "caption" in media ? media.caption : undefined,
  }));

  const currentItem = items[index];
  const isFirstItem = index === 0;
  const isLastItem = index === items.length - 1;

  return (
    <>
      <button
        type="button"
        className="size-12 shrink-0 cursor-pointer bg-background shadow rounded-full hidden lg:flex items-center justify-center disabled:opacity-50 disabled:cursor-default"
        onClick={() => (isFirstItem ? onPrevious?.() : setIndex(index - 1))}
        disabled={isFirstItem && !onPrevious}
      >
        <ArrowLeft className="size-5" />
        <span className="sr-only">Previous</span>
      </button>
      <div className="w-full max-w-sm lg:w-auto lg:max-w-full">
        <Reel
          data={items}
          index={index}
          onIndexChange={setIndex}
          onComplete={onComplete}
          className="w-full max-h-[85vh] rounded-2xl lg:w-auto lg:h-[85dvh] lg:max-w-full"
        >
          <ReelProgress />
          <ReelHeader className="flex items-center gap-3 pt-5">
            <UserAvatar
              className="size-9"
              image={status.user.avatar}
              fallback={generateAvatarFallback(status.user.name)}
            />
            <div className="min-w-0 flex-1 text-white">
              <div className="text-sm font-medium truncate">
                {status.user.name}
              </div>
              <div className="text-xs text-white/70">{status.date}</div>
            </div>
            {currentItem?.type === "video" && (
              <ReelMuteButton className="shrink-0" />
            )}
            <ReelPlayButton className="shrink-0" />
          </ReelHeader>
          <ReelContent>
            {(item) =>
              item.type === "video" ? (
                <ReelVideo src={item.src} />
              ) : (
                <ReelImage
                  alt={item.alt ?? ""}
                  duration={item.duration}
                  src={item.src}
                />
              )
            }
          </ReelContent>
          <ReelNavigation />
          {currentItem?.description && (
            <ReelFooter>
              <p className="text-white text-sm text-center text-balance pb-2">
                {currentItem.description}
              </p>
            </ReelFooter>
          )}
        </Reel>
      </div>
      <button
        type="button"
        className="size-12 shrink-0 cursor-pointer bg-background shadow rounded-full hidden lg:flex items-center justify-center disabled:opacity-50 disabled:cursor-default"
        onClick={() => (isLastItem ? onNext?.() : setIndex(index + 1))}
        disabled={isLastItem && !onNext}
      >
        <ArrowRight className="size-5" />
        <span className="sr-only">Next</span>
      </button>
    </>
  );
}

export default function StatusViewer({
  statuses,
  index,
  onIndexChange,
  onClose,
}: {
  statuses: StatusItemProps[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const status = statuses[index];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!status) return null;

  const hasPrevious = index > 0;
  const hasNext = index < statuses.length - 1;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 supports-backdrop-filter:backdrop-blur-xs flex items-center justify-center gap-4 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-50 p-3 text-white/70 transition-colors hover:text-white outline-none"
      >
        <X className="size-5" />
        <span className="sr-only">Close</span>
      </button>
      <StatusReel
        key={status.id}
        status={status}
        onPrevious={hasPrevious ? () => onIndexChange(index - 1) : undefined}
        onNext={hasNext ? () => onIndexChange(index + 1) : onClose}
        onComplete={hasNext ? () => onIndexChange(index + 1) : onClose}
      />
    </div>
  );
}
