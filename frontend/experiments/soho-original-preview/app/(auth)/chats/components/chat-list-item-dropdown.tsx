"use client";

import * as React from "react";
import { useState } from "react";
import { useChatStore } from "../chat-store";

import {
  Archive,
  Ban,
  LogOut,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ConfirmDialog from "@/components/confirm-dialog";

type ConfirmAction = "block" | "leave" | "delete";

const CONFIRM_CONTENT: Record<
  ConfirmAction,
  { title: string; description: string; actionLabel: string }
> = {
  block: {
    title: "Block this contact?",
    description:
      "They will no longer be able to send you messages or see your status updates.",
    actionLabel: "Block",
  },
  leave: {
    title: "Leave this group?",
    description:
      "You will stop receiving messages from this group. You can only rejoin if someone adds you back.",
    actionLabel: "Leave group",
  },
  delete: {
    title: "Delete this chat?",
    description:
      "The entire conversation history will be removed. This action cannot be undone.",
    actionLabel: "Delete",
  },
};

export default function ChatUserDropdown({
  children,
  isGroup = false,
}: {
  children: React.ReactElement;
  isGroup?: boolean;
}) {
  const setProfileOpen = useChatStore((state) => state.setProfileOpen);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={children} />
        <DropdownMenuContent className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setProfileOpen(true)}>
              {isGroup ? (
                <>
                  <UsersRound /> Group details
                </>
              ) : (
                <>
                  <UserRound /> View profile
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Archive /> Add to archive
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {isGroup ? (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirmAction("leave")}
              >
                <LogOut /> Leave group
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirmAction("block")}
              >
                <Ban /> Block
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmAction("delete")}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {confirmAction && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
          {...CONFIRM_CONTENT[confirmAction]}
        />
      )}
    </>
  );
}
