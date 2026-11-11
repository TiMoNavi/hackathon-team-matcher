"use client";

import Link from "next/link";
import { useState } from "react";
import { MediaItemProps, UserPropsTypes } from "@/types";
import { generateAvatarFallback } from "@/lib/generate-avatar-fallback";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { FileText, X } from "lucide-react";
import { SocialIcon } from "@/components/social-icons";
import { useChatStore } from "../chat-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import UserAvatar from "@/components/user-avatar";
import { Button } from "@/components/ui/button";

function SharedFileItem({ item }: { item: MediaItemProps }) {
  return (
    <div className="flex items-center gap-3">
      {item.type === "image" ? (
        <img
          className="size-12 rounded-xl object-cover shrink-0"
          src={item.path}
          alt={item.name ?? "media"}
        />
      ) : (
        <div className="size-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
          <FileText className="size-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{item.name}</div>
        <div className="text-xs text-muted-foreground">{item.date}</div>
      </div>
      <div className="text-xs text-muted-foreground shrink-0">{item.size}</div>
    </div>
  );
}

export default function UserDetailDrawer({ user }: { user: UserPropsTypes }) {
  const profileOpen = useChatStore((state) => state.profileOpen);
  const setProfileOpen = useChatStore((state) => state.setProfileOpen);
  const [showAllFiles, setShowAllFiles] = useState(false);

  const medias = user.medias ?? [];
  const visibleMedias = showAllFiles ? medias : medias.slice(0, 4);

  return (
    <Drawer
      open={profileOpen}
      onOpenChange={setProfileOpen}
      swipeDirection="right"
    >
      <DrawerContent>
        <DrawerHeader className="flex-row items-center justify-between p-6 pb-2">
          <DrawerTitle className="text-xl">Profile</DrawerTitle>
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
                image={user.avatar}
                indicator={user.online_status}
                className="size-32 mb-4 [&_[data-slot=avatar-badge]]:size-5! [&_[data-slot=avatar-badge]]:right-2.5 [&_[data-slot=avatar-badge]]:bottom-2.5"
                fallback={generateAvatarFallback(user.name)}
              />
              <h4 className="text-lg font-semibold">{user.name}</h4>
              <div className="text-sm text-muted-foreground mt-0.5">
                {user.online_status == "success" ? (
                  <span className="text-green-600 dark:text-green-500">
                    Online
                  </span>
                ) : (
                  <>Last seen: {user.last_seen}</>
                )}
              </div>
              {user.social_links?.length ? (
                <div className="flex items-center gap-1 mt-3">
                  {user.social_links.map((item, key) => (
                    <Button
                      key={key}
                      variant="ghost"
                      size="icon"
                      className="rounded-full text-muted-foreground hover:text-foreground"
                      nativeButton={false}
                      render={<Link href={item.url ?? "#"} target="_blank" />}
                    >
                      <SocialIcon name={item.name} className="size-4" />
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="space-y-6 border-t pt-6">
              {user.about && (
                <div className="space-y-1.5">
                  <h5 className="uppercase text-xs text-muted-foreground tracking-wide">
                    About
                  </h5>
                  <p className="text-sm leading-relaxed">{user.about}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {user.phone && (
                  <div className="space-y-1">
                    <h5 className="uppercase text-xs text-muted-foreground tracking-wide">
                      Phone
                    </h5>
                    <div className="text-sm">{user.phone}</div>
                  </div>
                )}
                {user.country && (
                  <div className="space-y-1">
                    <h5 className="uppercase text-xs text-muted-foreground tracking-wide">
                      Country
                    </h5>
                    <div className="text-sm">{user.country}</div>
                  </div>
                )}
                {user.website && (
                  <div className="space-y-1 col-span-2">
                    <h5 className="uppercase text-xs text-muted-foreground tracking-wide">
                      Website
                    </h5>
                    <a
                      href={user.website}
                      target="_blank"
                      className="text-sm hover:underline"
                    >
                      {user.website}
                    </a>
                  </div>
                )}
              </div>
              {medias.length > 0 && (
                <div className="space-y-3 border-t pt-5">
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-semibold">Shared files</h5>
                    {medias.length > 4 && (
                      <button
                        type="button"
                        onClick={() => setShowAllFiles(!showAllFiles)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showAllFiles ? "Show less" : "See all"}
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {visibleMedias.map((item, key) => (
                      <SharedFileItem item={item} key={key} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
