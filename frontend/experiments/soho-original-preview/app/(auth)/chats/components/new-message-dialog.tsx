"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { generateAvatarFallback } from "@/lib/generate-avatar-fallback";
import { useChatStore } from "../chat-store";
import { useContactStore } from "@/app/(auth)/contacts/contact-store";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import UserAvatar from "@/components/user-avatar";
import { Check, ImagePlus, Search } from "lucide-react";

export default function NewMessageDialog({
  open,
  onOpenChange,
  mode = "message",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "message" | "group";
}) {
  const isGroup = mode === "group";
  const contacts = useContactStore((state) => state.contacts);
  const addChat = useChatStore((state) => state.addChat);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupLogo, setGroupLogo] = useState<string | null>(null);

  const filteredContacts = contacts.filter((contact) =>
    contact.name.toLowerCase().includes(query.trim().toLowerCase())
  );
  const selectedContacts = contacts.filter((contact) =>
    selectedIds.includes(contact.id)
  );

  const toggleContact = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleOpenChange = (value: boolean) => {
    onOpenChange(value);
    if (!value) {
      setQuery("");
      setSelectedIds([]);
      setGroupName("");
      setGroupLogo(null);
    }
  };

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setGroupLogo(URL.createObjectURL(file));
    }
  };

  const handleContinue = () => {
    if (isGroup) {
      const name = groupName.trim();

      addChat({
        name,
        image: groupLogo ?? undefined,
        date: "Just now",
        last_message: "Group created",
        messages: [],
        user_id: 0,
        user: { id: 0, name, avatar: groupLogo ?? undefined },
        members: selectedContacts,
      });
    } else {
      selectedContacts.forEach((contact) => {
        addChat({
          date: "Just now",
          last_message: "Say hello 👋",
          messages: [],
          user_id: contact.id,
          user: contact,
        });
      });
    }
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 text-start">
          <DialogTitle className="text-xl">
            {isGroup ? "Create group" : "New message"}
          </DialogTitle>
          <DialogDescription>
            {isGroup
              ? "Give your group a name, pick a logo and add members."
              : "Invite a user to this thread. This will create a new group message."}
          </DialogDescription>
        </DialogHeader>
        {isGroup && (
          <div className="flex items-center gap-3 px-6 pb-4">
            <label className="relative flex size-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed text-muted-foreground transition-colors hover:bg-muted/50">
              {groupLogo ? (
                <img
                  src={groupLogo}
                  alt="Group logo"
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <ImagePlus className="size-5" />
              )}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleLogoChange}
              />
              <span className="sr-only">Choose group logo</span>
            </label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
            />
          </div>
        )}
        <div className="relative flex items-center px-6 pb-2">
          <Search className="absolute start-9 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search user..."
            className="ps-9"
          />
        </div>
        <div className="max-h-72 overflow-y-auto scroll-fade scrollbar-none px-3 py-2">
          {filteredContacts.length ? (
            filteredContacts.map((contact) => {
              const isSelected = selectedIds.includes(contact.id);

              return (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => toggleContact(contact.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-muted",
                    { "bg-muted": isSelected }
                  )}
                >
                  <UserAvatar
                    className="size-10"
                    image={contact.avatar}
                    fallback={generateAvatarFallback(contact.name)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {contact.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {contact.email}
                    </div>
                  </div>
                  {isSelected && <Check className="size-4 shrink-0" />}
                </button>
              );
            })
          ) : (
            <div className="text-center text-sm text-muted-foreground py-8">
              No user found
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-4 border-t px-6 py-4">
          {selectedContacts.length ? (
            <div className="flex -space-x-2">
              {selectedContacts.map((contact) => (
                <UserAvatar
                  key={contact.id}
                  className="size-9 ring-2 ring-background"
                  image={contact.avatar}
                  fallback={generateAvatarFallback(contact.name)}
                />
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              {isGroup
                ? "Select members for this group."
                : "Select users to add to this thread."}
            </span>
          )}
          <Button
            disabled={
              !selectedContacts.length || (isGroup && !groupName.trim())
            }
            onClick={handleContinue}
          >
            {isGroup ? "Create group" : "Continue"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
