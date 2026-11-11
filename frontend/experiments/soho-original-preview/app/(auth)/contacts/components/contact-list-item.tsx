import { cn } from "@/lib/utils";
import { UserPropsTypes } from "@/types";

import ContactListDropdown from "./contact-list-item-dropdown";
import { generateAvatarFallback } from "@/lib/generate-avatar-fallback";
import UserAvatar from "@/components/user-avatar";
import { useContactStore } from "../contact-store";

export default function ContactListItem({
  contact,
  active,
}: {
  contact: UserPropsTypes;
  active?: boolean | null;
}) {
  const setSelectedContact = useContactStore(
    (state) => state.setSelectedContact
  );

  const handleClick = (contact: UserPropsTypes) => {
    setSelectedContact(contact);
  };

  return (
    <div
      onClick={() => handleClick(contact)}
      className={cn(
        "flex items-center gap-4 py-4 px-6 hover:bg-muted group cursor-pointer min-w-0 relative",
        { "bg-gray-200! dark:bg-muted!": active }
      )}
    >
      <UserAvatar
        image={contact.avatar}
        fallback={generateAvatarFallback(contact.name)}
      />
      <div className="flex-1 min-w-0">
        <div className="flex flex-col gap-0.5 justify-between">
          <span className="font-medium truncate">{contact.name}</span>
          <span className="text-sm text-muted-foreground">{contact.phone}</span>
        </div>
      </div>
      <div className="absolute opacity-0 group-hover:opacity-100 end-4">
        <ContactListDropdown />
      </div>
    </div>
  );
}
