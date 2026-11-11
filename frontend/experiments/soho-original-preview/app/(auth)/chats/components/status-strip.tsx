"use client";

import { useState } from "react";
import { generateAvatarFallback } from "@/lib/generate-avatar-fallback";
import { OWN_USER, useStatusStore } from "../status-store";

import { Eye, Plus } from "lucide-react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import UserAvatar from "@/components/user-avatar";
import StatusViewer from "@/components/status-viewer";
import AddStatusDialog from "./add-status-dialog";

export default function StatusStrip() {
  const updates = useStatusStore((state) => state.updates);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [addStatusOpen, setAddStatusOpen] = useState(false);

  const ownStatus = updates.find((status) => status.user_id === OWN_USER.id);
  const otherUpdates = updates.filter(
    (status) => status.user_id !== OWN_USER.id
  );

  return (
    <>
      <Carousel
        opts={{ align: "start", dragFree: true }}
        className="px-6 pb-4 shrink-0"
      >
        <CarouselContent className="-ml-2 cursor-grab active:cursor-grabbing">
          <CarouselItem className="basis-1/5 pl-2">
            {ownStatus ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className="flex w-full flex-col items-center gap-1.5 outline-none group"
                    />
                  }
                >
                  <UserAvatar
                    className="size-14 border-2 border-green-500 p-0.5 transition-opacity group-hover:opacity-80"
                    image={OWN_USER.avatar}
                    fallback={generateAvatarFallback(OWN_USER.name)}
                  />
                  <span className="text-xs text-muted-foreground w-full truncate text-center">
                    You
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-44" align="start">
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onClick={() =>
                        setSelectedIndex(updates.indexOf(ownStatus))
                      }
                    >
                      <Eye className="size-4" /> View status
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setAddStatusOpen(true)}>
                      <Plus className="size-4" /> New status
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button
                type="button"
                onClick={() => setAddStatusOpen(true)}
                className="flex w-full flex-col items-center gap-1.5 outline-none group"
              >
                <span className="relative">
                  <UserAvatar
                    className="size-14 border-2 border-dashed border-muted-foreground/40 p-0.5 transition-opacity group-hover:opacity-80"
                    image={OWN_USER.avatar}
                    fallback={generateAvatarFallback(OWN_USER.name)}
                  />
                  <span className="absolute bottom-0 end-0 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
                    <Plus className="size-3.5" />
                  </span>
                </span>
                <span className="text-xs text-muted-foreground w-full truncate text-center">
                  Add status
                </span>
              </button>
            )}
          </CarouselItem>
          {otherUpdates.map((status) => (
            <CarouselItem key={status.id} className="basis-1/5 pl-2">
              <button
                type="button"
                onClick={() => setSelectedIndex(updates.indexOf(status))}
                className="flex w-full flex-col items-center gap-1.5 outline-none group"
              >
                <UserAvatar
                  className="size-14 border-2 border-green-500 p-0.5 transition-opacity group-hover:opacity-80"
                  image={status.user.avatar}
                  fallback={generateAvatarFallback(status.user.name)}
                />
                <span className="text-xs text-muted-foreground w-full truncate text-center">
                  {status.user.name.split(" ")[0]}
                </span>
              </button>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <AddStatusDialog open={addStatusOpen} onOpenChange={setAddStatusOpen} />
      {selectedIndex !== null && (
        <StatusViewer
          statuses={updates}
          index={selectedIndex}
          onIndexChange={setSelectedIndex}
          onClose={() => setSelectedIndex(null)}
        />
      )}
    </>
  );
}
