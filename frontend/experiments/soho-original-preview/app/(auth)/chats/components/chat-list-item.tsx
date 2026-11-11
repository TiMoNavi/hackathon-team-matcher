import { cn } from "@/lib/utils";
import { ChatItemProps } from "@/types";

import ChatUserDropdown from "./chat-list-item-dropdown";
import { Ellipsis } from "lucide-react";
import { generateAvatarFallback } from "@/lib/generate-avatar-fallback";
import { useChatStore } from "../chat-store";
import UserAvatar from "@/components/user-avatar";
import MessageStatusIcon from "./message-status-icon";
import { Button } from "@/components/ui/button";

export default function ChatListItem({
  chat,
  active,
}: {
  chat: ChatItemProps;
  active: boolean | null;
}) {
  const setSelectedChat = useChatStore((state) => state.setSelectedChat);

  const handleClick = (chat: ChatItemProps) => {
    setSelectedChat(chat);
  };

  const unreadMessageCount = chat?.messages?.filter((item) => !item.read) ?? [];

  return (
    <div
      onClick={() => handleClick(chat)}
      className={cn(
        "flex items-center gap-4 py-4 px-6 hover:bg-muted group cursor-pointer min-w-0 relative",
        { "bg-gray-200! dark:bg-muted!": active }
      )}
    >
      <UserAvatar
        image={chat.user?.avatar}
        indicator={chat.user?.online_status}
        fallback={generateAvatarFallback(chat.user?.name)}
      />
      <div className="grow min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium truncate">{chat.user?.name}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            {chat.date}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <MessageStatusIcon status={chat.status} />
          <span className="truncate text-start text-sm text-muted-foreground">
            {chat.last_message}
          </span>
          {unreadMessageCount.length > 0 && (
            <div className="text-xs font-medium flex items-center justify-center size-5 shrink-0 rounded-full bg-green-500 text-white ms-auto">
              {unreadMessageCount.length}
            </div>
          )}
        </div>
      </div>
      <div
        className={cn(
          "absolute opacity-0 group-hover:opacity-100 end-0 top-0 bottom-0 flex items-center px-4 bg-linear-to-l from-50%",
          { "from-muted": !active },
          { "from-gray-200 dark:from-muted": active }
        )}
      >
        <ChatUserDropdown isGroup={Boolean(chat.name)}>
          <Button size="icon" variant="outline" className="rounded-full">
            <Ellipsis className="w-4 h-4" />
          </Button>
        </ChatUserDropdown>
      </div>
    </div>
  );
}
