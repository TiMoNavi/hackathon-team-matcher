# chat-bubble2: Chat Bubble 2
Conversation-style message bubbles for support widgets and chat UIs. Includes sender alignment, avatars, timestamps, and input areas, all using shadcn/ui for consistent styling.
Category: examples/cards/chat-bubble
Preview: https://shadcnuikit.com/examples/cards/chat-bubble/2

## Requirements
shadcn/ui components (add the missing ones): npx shadcn@latest add avatar button card dropdown-menu input scroll-area
npm packages (install the missing ones): lucide-react

## Files
### components/chat-bubble2/data.ts
```ts
export const messagesData = [
  {
    id: 1,
    content: "Did you get a chance to look at the proposal?",
    sender: "Jordan Reed",
    avatar: "https://i.pravatar.cc/150?img=8",
    timestamp: "10:12 AM",
    status: "read",
    type: "received",
  },
  {
    id: 2,
    content: "Yes, just finished. The pricing section looks good—I’ll add a couple of notes and send it back.",
    sender: "You",
    timestamp: "10:14 AM",
    avatar: "https://i.pravatar.cc/150?img=12",
    status: "delivered",
    type: "sent",
  },
  {
    id: 3,
    content: "Sounds good. Do you need anything else from my side before the call?",
    sender: "Jordan Reed",
    avatar: "https://i.pravatar.cc/150?img=8",
    timestamp: "10:15 AM",
    status: "read",
    type: "received",
  },
  {
    id: 4,
    content: "I think we’re set. I’ll share the deck in the channel so everyone can skim before 3pm.",
    sender: "You",
    avatar: "https://i.pravatar.cc/150?img=12",
    timestamp: "10:16 AM",
    status: "sent",
    type: "sent",
  },
  {
    id: 5,
    content: "Perfect, thanks. Talk then.",
    sender: "Jordan Reed",
    avatar: "https://i.pravatar.cc/150?img=8",
    timestamp: "10:17 AM",
    status: "read",
    type: "received",
  },
  {
    id: 6,
    content: "See you then.",
    sender: "You",
    avatar: "https://i.pravatar.cc/150?img=12",
    timestamp: "10:18 AM",
    status: "sent",
    type: "sent",
  },
];

export type Message = (typeof messagesData)[number];
```
### components/chat-bubble2/index.tsx
```tsx
import {
  BanIcon,
  EllipsisIcon,
  Send,
  Share2,
  TrashIcon,
  UserIcon,
} from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MessageListItem from "./message-list-item";

import { messagesData } from "./data";

export default function ChatCard() {
  return (
    <Card className="shadow-none md:w-96">
      <CardHeader>
        <CardTitle>Toby Belhome</CardTitle>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" className="-mt-2">
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <UserIcon size={16} aria-hidden="true" />
                View Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Share2 size={16} aria-hidden="true" />
                Share
              </DropdownMenuItem>
              <DropdownMenuItem>
                <BanIcon size={16} aria-hidden="true" />
                Block
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive">
                <TrashIcon size={16} aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          <div className="space-y-4">
            {messagesData.map((message) => (
              <MessageListItem key={message.id} message={message} />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter>
        <form className="flex w-full items-center space-x-2">
          <Input
            id="message"
            placeholder="Type your message..."
            className="flex-1"
            autoComplete="off"
          />
          <Button type="submit" variant="outline" size="icon">
            <Send />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
```
### components/chat-bubble2/message-list-item.tsx
```tsx
import { cn } from "@/lib/utils";
import { Check, CheckCheck } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { Message } from "./data";

export default function MessageListItem({ message }: { message: Message }) {
  return (
    <div
      className={cn(
        "flex gap-2",
        message.type === "sent" && "flex-row-reverse",
      )}
    >
      <Avatar>
        <AvatarImage src={message.avatar} alt={message.sender} />
        <AvatarFallback>{message.sender[0]}</AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "group flex flex-col space-y-1",
          message.type === "sent" && "items-end",
        )}
      >
        <div
          className={cn(
            "rounded-lg px-3 py-2",
            message.type === "sent"
              ? "bg-primary text-primary-foreground rounded-br-none"
              : "bg-muted rounded-bl-none",
          )}
        >
          <p className="text-sm">{message.content}</p>
        </div>
        <div className="flex items-center gap-1 px-2">
          <span className="text-muted-foreground block text-xs">
            {message.timestamp}
          </span>
          {message.type === "sent" && (
            <div className="text-muted-foreground text-xs">
              {message.status === "sent" && <Check className="size-3" />}
              {message.status === "delivered" && (
                <CheckCheck className="size-3" />
              )}
              {message.status === "read" && (
                <CheckCheck className="size-3 text-blue-500" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```
