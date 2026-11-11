"use client";

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import UserAvatar from "@/components/user-avatar";
import {
  BellIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  UserRoundIcon,
} from "lucide-react";

type SettingRow =
  | { type: "switch"; label: string; description?: string; defaultChecked?: boolean }
  | { type: "value"; label: string; description?: string; value: string }
  | { type: "input"; label: string; description?: string; defaultValue: string }
  | { type: "avatar"; label: string; description?: string; image: string };

const sections: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: SettingRow[];
}[] = [
  {
    id: "profile",
    label: "Profile",
    icon: UserRoundIcon,
    rows: [
      {
        type: "avatar",
        label: "Avatar",
        description: "Use 800×800 px (PNG/JPG)",
        image: "https://i.pravatar.cc/150?img=13",
      },
      { type: "input", label: "Display name", defaultValue: "Toby Belhome" },
      {
        type: "switch",
        label: "Private profile",
        description: "Only contacts can see your profile details",
        defaultChecked: false,
      },
      {
        type: "switch",
        label: "Show online status",
        description: "Let others see when you are online",
        defaultChecked: true,
      },
    ],
  },
  {
    id: "general",
    label: "General",
    icon: SlidersHorizontalIcon,
    rows: [
      {
        type: "switch",
        label: "Enter to send",
        description: "Pressing Enter sends your message",
        defaultChecked: true,
      },
      {
        type: "switch",
        label: "Media auto-download",
        description: "Download photos and videos automatically",
        defaultChecked: true,
      },
      { type: "value", label: "Language", value: "English" },
      {
        type: "switch",
        label: "Show archived chats",
        description: "Keep archived chats visible in the sidebar",
        defaultChecked: false,
      },
    ],
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: BellIcon,
    rows: [
      {
        type: "switch",
        label: "Message notifications",
        description: "Get notified about new messages",
        defaultChecked: true,
      },
      {
        type: "switch",
        label: "Notification sounds",
        defaultChecked: true,
      },
      {
        type: "switch",
        label: "Email notifications",
        description: "Receive a summary of missed messages by email",
        defaultChecked: false,
      },
      {
        type: "switch",
        label: "Do not disturb",
        description: "Mute all notifications",
        defaultChecked: false,
      },
    ],
  },
  {
    id: "privacy",
    label: "Privacy",
    icon: ShieldCheckIcon,
    rows: [
      {
        type: "switch",
        label: "Read receipts",
        description: "Others can see when you read their messages",
        defaultChecked: true,
      },
      {
        type: "switch",
        label: "Two-step verification",
        description: "Require a PIN when signing in",
        defaultChecked: true,
      },
      {
        type: "switch",
        label: "Confirm message requests",
        description: "Approve people before they can message you",
        defaultChecked: true,
      },
      { type: "value", label: "Blocked contacts", value: "3" },
    ],
  },
];

function SettingControl({ row }: { row: SettingRow }) {
  switch (row.type) {
    case "switch":
      return <Switch defaultChecked={row.defaultChecked} />;
    case "value":
      return <span className="text-sm text-muted-foreground">{row.value}</span>;
    case "input":
      return (
        <Input
          defaultValue={row.defaultValue}
          className="h-8 w-44 text-sm"
        />
      );
    case "avatar":
      return <UserAvatar className="size-12" image={row.image} />;
  }
}

export function SettingsDialog({
  children,
  open,
  onOpenChange,
}: {
  children?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger render={children} />}
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Settings</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="profile">
          <TabsList className="w-full">
            {sections.map((item) => (
              <TabsTrigger key={item.id} value={item.id}>
                <item.icon className="size-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {sections.map((section) => (
            <TabsContent key={section.id} value={section.id}>
              <div className="divide-y max-h-[55dvh] overflow-y-auto overflow-x-hidden scroll-fade scrollbar-none">
                {section.rows.map((row, key) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-6 py-4"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{row.label}</div>
                      {row.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {row.description}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0">
                      <SettingControl row={row} />
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
