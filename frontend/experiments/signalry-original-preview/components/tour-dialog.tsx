"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Opens the product tour video in a modal. The video only mounts while the
 * dialog is open, so it autoplays on open and stops when closed.
 */
export function TourDialog({ children }: { children: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        showCloseButton={false}
        // Above the floating site header (z-100).
        overlayClassName="z-[200] bg-night/70 supports-backdrop-filter:backdrop-blur-sm"
        className="z-[201] max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-2xl border-0 bg-night p-0 shadow-[0_40px_120px_-20px_rgba(37,22,120,0.6)] ring-white/10 sm:max-w-5xl"
      >
        <DialogTitle className="sr-only">Signalry product tour</DialogTitle>
        <DialogDescription className="sr-only">
          A walkthrough of the Signalry inbox, AI themes, roadmap and pricing.
        </DialogDescription>
        <video
          className="aspect-video w-full bg-night"
          src="/videos/signalry-tour.mp4"
          poster="/videos/signalry-tour-poster.jpg"
          autoPlay
          controls
          playsInline
        />
        <DialogClose asChild>
          <Button
            size="icon-sm"
            aria-label="Close video"
            className="absolute top-3 right-3 rounded-full bg-night/70 text-white backdrop-blur hover:bg-night"
          >
            <X />
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
