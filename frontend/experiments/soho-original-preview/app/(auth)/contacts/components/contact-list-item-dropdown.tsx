"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ConfirmDialog from "@/components/confirm-dialog";
import { Ellipsis } from "lucide-react";

type ConfirmAction = "block" | "delete";

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
  delete: {
    title: "Delete this contact?",
    description:
      "This contact and your conversation history will be removed. This action cannot be undone.",
    actionLabel: "Delete",
  },
};

export default function ContactListDropdown() {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="icon" variant="outline" className="rounded-full" />
          }
        >
          <Ellipsis className="w-4 h-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuItem>New Chat</DropdownMenuItem>
            <DropdownMenuItem>Share</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmAction("block")}
            >
              Block
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmAction("delete")}
            >
              Delete
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
