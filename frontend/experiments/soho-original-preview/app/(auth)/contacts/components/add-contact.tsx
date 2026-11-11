"use client";

import * as React from "react";
import { useState } from "react";

import { useContactStore } from "../contact-store";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function AddContactDialog({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const addContact = useContactStore((state) => state.addContact);
  const [internalOpen, setInternalOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const open = controlledOpen ?? internalOpen;

  const handleOpenChange = (value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
    if (!value) {
      setName("");
      setPhone("");
      setEmail("");
    }
  };

  const handleSave = () => {
    addContact({
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      online_status: null,
    });
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {children && <DialogTrigger render={children} />}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Add contact</DialogTitle>
          <DialogDescription>
            Add someone to your contacts to start chatting with them.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4 py-2">
          <Field>
            <FieldLabel htmlFor="contact-name">Name</FieldLabel>
            <Input
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Olivia Bennett"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="contact-phone">Phone</FieldLabel>
            <Input
              id="contact-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 555 55 55"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="contact-email">
              Email{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </FieldLabel>
            <Input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button disabled={!name.trim()} onClick={handleSave}>
            Save contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
