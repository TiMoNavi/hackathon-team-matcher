"use client";

import { useContactStore } from "../contact-store";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import UserAvatar from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { SocialIcon } from "@/components/social-icons";
import Link from "next/link";
import { generateAvatarFallback } from "@/lib/generate-avatar-fallback";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ContactContent() {
  const user = useContactStore((state) => state.selectedContact);
  const setSelectedContact = useContactStore(
    (state) => state.setSelectedContact
  );

  if (!user) {
    return (
      <figure className="text-center h-full hidden lg:flex items-center justify-center">
        <img
          className="max-w-sm dark:invert"
          src="/not-selected-chat.svg"
          alt="No contact selected"
        />
      </figure>
    );
  }

  return (
    <Card className="lg:max-w-(--breakpoint-md) flex flex-col z-50 inset-0 fixed lg:relative lg:h-full min-h-0 gap-0">
      <CardHeader className="flex flex-row items-center justify-between gap-4 shrink-0 border-b [.border-b]:pb-5">
        <div className="flex items-center gap-4 min-w-0">
          <Button
            size="icon"
            variant="outline"
            className="flex lg:hidden shrink-0"
            onClick={() => setSelectedContact(null)}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <UserAvatar
            className="size-14"
            image={user.avatar}
            indicator={user.online_status}
            fallback={generateAvatarFallback(user.name)}
          />
          <div className="flex flex-col min-w-0">
            <span className="text-lg font-semibold truncate">{user.name}</span>
            <span className="text-sm text-muted-foreground truncate">
              {user.email}
            </span>
          </div>
        </div>
        <div className="fixed bottom-0 start-0 end-0 z-10 bg-background border-t p-4 lg:relative lg:bg-transparent lg:border-0 lg:p-0 shrink-0">
          <Button className="w-full lg:w-auto">
            <MessageCircle className="w-4 h-4" /> New Chat
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0">
        <ScrollArea className="h-full" viewportClassName="scroll-fade">
          <div className="px-6 pt-6 pb-28 lg:pb-6 space-y-8">
            {user.about && (
              <div className="space-y-2">
                <div className="uppercase text-muted-foreground text-xs tracking-wide">
                  About
                </div>
                <p className="text-sm leading-relaxed">{user.about}</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
              {user.phone && (
                <div className="space-y-1">
                  <div className="uppercase text-muted-foreground text-xs tracking-wide">
                    Phone
                  </div>
                  <div className="text-sm">{user.phone}</div>
                </div>
              )}
              {user.country && (
                <div className="space-y-1">
                  <div className="uppercase text-muted-foreground text-xs tracking-wide">
                    Country
                  </div>
                  <div className="text-sm">{user.country}</div>
                </div>
              )}
              {user.gender && (
                <div className="space-y-1">
                  <div className="uppercase text-muted-foreground text-xs tracking-wide">
                    Gender
                  </div>
                  <div className="text-sm">{user.gender}</div>
                </div>
              )}
              {user.last_seen && (
                <div className="space-y-1">
                  <div className="uppercase text-muted-foreground text-xs tracking-wide">
                    Last seen
                  </div>
                  <div className="text-sm">{user.last_seen}</div>
                </div>
              )}
              {user.website && (
                <div className="space-y-1">
                  <div className="uppercase text-muted-foreground text-xs tracking-wide">
                    Website
                  </div>
                  <Link
                    href={user.website}
                    className="text-sm inline-block hover:underline"
                    target="_blank"
                  >
                    {user.website}
                  </Link>
                </div>
              )}
            </div>
            {user.social_links?.length ? (
              <div className="space-y-2 border-t pt-6">
                <div className="uppercase text-muted-foreground text-xs tracking-wide">
                  Social Links
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {user.social_links.map((item, key) => (
                    <Button
                      key={key}
                      variant="secondary"
                      className="size-11 items-center rounded-full"
                      nativeButton={false}
                      render={<Link href={item.url ?? "#"} target="_blank" />}
                    >
                      <SocialIcon name={item.name} className="size-5" />
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
