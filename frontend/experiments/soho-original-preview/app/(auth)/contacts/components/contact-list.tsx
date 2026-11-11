"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";
import { UserPropsTypes } from "@/types";
import { useContactStore } from "../contact-store";
import ContactListItem from "./contact-list-item";

export default function ContactList() {
  const contacts = useContactStore((state) => state.contacts);
  const selectedContact = useContactStore((state) => state.selectedContact);
  const [query, setQuery] = useState("");

  const filteredContacts = contacts.filter((contact) =>
    contact.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <>
      <div className="pb-3 px-6 relative flex items-center shrink-0">
        <Search className="absolute w-4 h-4 start-9 text-muted-foreground" />
        <Input
          type="text"
          className="ps-9"
          placeholder="Search contacts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="flex-1 min-h-0 flex">
        <ScrollArea className="w-full" viewportClassName="scroll-fade">
          <div className="divide-y">
            {filteredContacts.length ? (
              filteredContacts.map((contact: UserPropsTypes) => (
                <ContactListItem
                  contact={contact}
                  key={contact.id}
                  active={selectedContact && selectedContact.id === contact.id}
                />
              ))
            ) : (
              <div className="text-center text-muted-foreground text-sm mt-4">
                No contact found
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
