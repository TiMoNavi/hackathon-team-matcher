"use client";

import { useState } from "react";

import { ImagePlus, X } from "lucide-react";

import { useStatusStore } from "../status-store";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export default function AddStatusDialog({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const addOwnStatus = useStatusStore((state) => state.addOwnStatus);
  const [internalOpen, setInternalOpen] = useState(false);
  const [preview, setPreview] = useState<{
    type: "image" | "video";
    src: string;
  } | null>(null);
  const [caption, setCaption] = useState("");

  const open = controlledOpen ?? internalOpen;

  const handleOpenChange = (value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
    if (!value) {
      setPreview(null);
      setCaption("");
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPreview({
        type: file.type.startsWith("video/") ? "video" : "image",
        src: URL.createObjectURL(file),
      });
    }
  };

  const handleShare = () => {
    if (preview) {
      addOwnStatus({
        type: preview.type,
        src: preview.src,
        caption: caption.trim() || undefined,
      });
    }
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {children && <DialogTrigger render={children} />}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Add status</DialogTitle>
          <DialogDescription>
            Share a photo or video with your contacts. It disappears after 24
            hours.
          </DialogDescription>
        </DialogHeader>
        {preview ? (
          <div className="relative overflow-hidden rounded-xl">
            {preview.type === "video" ? (
              <video
                src={preview.src}
                className="max-h-80 w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
              />
            ) : (
              <img
                src={preview.src}
                alt="Status preview"
                className="max-h-80 w-full object-cover"
              />
            )}
            <Button
              variant="secondary"
              size="icon-sm"
              className="absolute top-2 end-2 rounded-full"
              onClick={() => setPreview(null)}
            >
              <X />
              <span className="sr-only">Remove media</span>
            </Button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-12 text-muted-foreground cursor-pointer transition-colors hover:bg-muted/50">
            <ImagePlus className="size-8" strokeWidth={1.5} />
            <span className="text-sm">Click to choose a photo or video</span>
            <input
              type="file"
              accept="image/*,video/*"
              className="sr-only"
              onChange={handleFileChange}
            />
          </label>
        )}
        <Input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add a caption..."
        />
        <DialogFooter>
          <Button disabled={!preview} onClick={handleShare}>
            Share status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
