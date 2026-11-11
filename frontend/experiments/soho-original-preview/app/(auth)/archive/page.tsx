import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Archived Messages",
};

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ChatList from "../chats/components/chat-list";
import ChatContent from "../chats/components/chat-content";

export default function Page() {
  return (
    <div className="flex flex-col lg:flex-row h-dvh">
      <div className="w-full flex-1 lg:flex-none lg:w-96 lg:shrink-0 min-h-0 pb-20 lg:pb-0">
        <Card className="gap-0 h-full rounded-none ring-0 border-e-0 lg:border-e">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Archive</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
            <ChatList archive />
          </CardContent>
        </Card>
      </div>
      <div className="min-w-0 min-h-0 lg:flex-1 lg:p-6">
        <ChatContent />
      </div>
    </div>
  );
}
