"use client";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-is-mobile";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import ChatList from "./chat-list";
import ActionDropdown from "./action-dropdown";
import ChatContent from "./chat-content";
import StatusStrip from "./status-strip";
import CallScreen from "./call-screen";
import { useChatStore } from "../chat-store";

export default function ChatsView() {
  const activeCall = useChatStore((state) => state.activeCall);
  const callChatOpen = useChatStore((state) => state.callChatOpen);
  const setCallChatOpen = useChatStore((state) => state.setCallChatOpen);
  const isMobile = useIsMobile();

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      {!activeCall && (
        <div className="min-h-0 w-full flex-1 pb-20 lg:w-96 lg:flex-none lg:shrink-0 lg:pb-0">
          <Card className="h-full gap-0 rounded-none border-e-0 ring-0 lg:border-e">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">Chats</CardTitle>
                <ActionDropdown />
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              <StatusStrip />
              <ChatList />
            </CardContent>
          </Card>
        </div>
      )}
      {activeCall && <CallScreen />}
      {(!activeCall || (callChatOpen && !isMobile)) && (
        <div
          className={cn(
            "min-h-0 min-w-0 lg:p-6",
            activeCall ? "lg:w-[26rem] lg:shrink-0" : "lg:flex-1"
          )}
        >
          <ChatContent />
        </div>
      )}
      {activeCall && isMobile && (
        <Drawer open={callChatOpen} onOpenChange={setCallChatOpen}>
          <DrawerContent className="[--drawer-height:85dvh]">
            <DrawerTitle className="sr-only">Chat</DrawerTitle>
            <ChatContent embedded />
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}
