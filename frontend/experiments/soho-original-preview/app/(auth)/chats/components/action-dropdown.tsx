"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlusCircle } from "lucide-react";
import NewMessageDialog from "./new-message-dialog";
import AddStatusDialog from "./add-status-dialog";
import { AddContactDialog } from "@/app/(auth)/contacts/components/add-contact";

export default function ActionDropdown() {
  const [newMessageMode, setNewMessageMode] = useState<
    "message" | "group" | null
  >(null);
  const [newUpdateOpen, setNewUpdateOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          <PlusCircle className="w-4 h-4" />
          New
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setNewMessageMode("message")}>
              New chat
              <DropdownMenuShortcut>⇧⌘C</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setNewMessageMode("group")}>
              Create group
              <DropdownMenuShortcut>⌘G</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setNewUpdateOpen(true)}>
              New Update
              <DropdownMenuShortcut>⌘U</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAddContactOpen(true)}>
              Add contact
              <DropdownMenuShortcut>⌘A</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewMessageDialog
        mode={newMessageMode ?? "message"}
        open={newMessageMode !== null}
        onOpenChange={(value) => {
          if (!value) setNewMessageMode(null);
        }}
      />
      <AddStatusDialog open={newUpdateOpen} onOpenChange={setNewUpdateOpen} />
      <AddContactDialog
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
      />
    </>
  );
}
