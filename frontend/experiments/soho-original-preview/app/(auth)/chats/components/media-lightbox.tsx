"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { ArrowLeft, ArrowRight, X } from "lucide-react";

export type LightboxItem = { type: "image" | "video"; src: string };

export default function MediaLightbox({
  items,
  initialIndex = 0,
  onClose,
}: {
  items: LightboxItem[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const item = items[index];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") {
        setIndex((value) => Math.max(0, value - 1));
      }
      if (event.key === "ArrowRight") {
        setIndex((value) => Math.min(items.length - 1, value + 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [items.length, onClose]);

  if (!item) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 supports-backdrop-filter:backdrop-blur-xs"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 p-3 text-white/70 transition-colors hover:text-white outline-none"
      >
        <X className="size-5" />
        <span className="sr-only">Close</span>
      </button>
      {item.type === "video" ? (
        <video
          src={item.src}
          controls
          autoPlay
          playsInline
          className="max-h-[90vh] max-w-full rounded-xl bg-black"
        />
      ) : (
        <img
          src={item.src}
          alt=""
          className="max-h-[90vh] max-w-full rounded-xl object-contain"
        />
      )}
      {items.length > 1 && (
        <>
          <button
            type="button"
            className="absolute start-4 top-1/2 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-background shadow disabled:opacity-50 disabled:cursor-default"
            onClick={() => setIndex(Math.max(0, index - 1))}
            disabled={index === 0}
          >
            <ArrowLeft className="size-5" />
            <span className="sr-only">Previous</span>
          </button>
          <button
            type="button"
            className="absolute end-4 top-1/2 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-background shadow disabled:opacity-50 disabled:cursor-default"
            onClick={() => setIndex(Math.min(items.length - 1, index + 1))}
            disabled={index === items.length - 1}
          >
            <ArrowRight className="size-5" />
            <span className="sr-only">Next</span>
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white/90">
            {index + 1} / {items.length}
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
