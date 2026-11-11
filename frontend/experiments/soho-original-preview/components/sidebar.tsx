"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useState } from "react";
import { useTheme } from "next-themes";

import {
  Archive,
  LogOut,
  MessageCircle,
  Settings,
  SunMoon,
  Users,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SettingsDialog } from "./settings-dialog";
import ConfirmDialog from "./confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "./ui/switch";
import UserAvatar from "./user-avatar";

const navItems = [
  { href: "/", label: "Chats", icon: MessageCircle },
  { href: "/contacts", label: "Contacts", icon: Users },
];

function NavLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const pathname = usePathname();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:h-10 md:w-10",
              { "bg-accent text-accent-foreground": pathname === href }
            )}
          />
        }
      >
        <Icon className="size-5" />
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function Aside() {
  return (
    <aside className="fixed start-0 top-0 flex min-h-screen inset-y-0 left-0 z-10 w-20 flex-col border-r bg-background pt-2">
      <nav className="flex flex-col items-center gap-4">
        <Link
          href="#"
          className="group w-full aspect-square flex shrink-0 rounded-lg items-center justify-center gap-2 text-lg font-semibold text-primary-foreground md:text-base md:h-12 md:w-12"
        >
          <Image
            src="/logo.svg"
            width={24}
            height={24}
            className="size-9 dark:invert"
            alt="soho logo svg"
          />
          <span className="sr-only">SohoPro</span>
        </Link>
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>
      <nav className="mt-auto flex flex-col items-center gap-4 px-2 py-4">
        <NavLink href="/archive" label="Archived messages" icon={Archive} />
        <UserMenu />
      </nav>
    </aside>
  );
}

const onlineStatuses = [
  { value: "success", label: "Online", dot: "bg-green-500" },
  { value: "warning", label: "Away", dot: "bg-orange-400" },
  { value: "danger", label: "Do not disturb", dot: "bg-red-500" },
  { value: "offline", label: "Offline", dot: "bg-muted-foreground/40" },
] as const;

type OnlineStatus = (typeof onlineStatuses)[number]["value"];

function UserMenu({
  side = "right",
  align = "end",
}: {
  side?: "right" | "top";
  align?: "start" | "center" | "end";
}) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [status, setStatus] = useState<OnlineStatus>("success");
  const { resolvedTheme, setTheme } = useTheme();

  const currentStatus =
    onlineStatuses.find((item) => item.value === status) ?? onlineStatuses[0];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              className="rounded-full outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="User menu"
            />
          }
        >
          <UserAvatar
            className="size-10"
            image="https://i.pravatar.cc/150?img=13"
            indicator={status === "offline" ? undefined : status}
            fallback="TB"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent side={side} align={align} className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <div className="flex items-center gap-3">
                <UserAvatar
                  className="size-9"
                  image="https://i.pravatar.cc/150?img=13"
                  fallback="TB"
                />
                <div className="flex flex-col">
                  <span className="font-medium">Toby Belhome</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    toby@example.com
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span
                className={cn(
                  "size-2.5 rounded-full mx-0.5",
                  currentStatus.dot
                )}
              />
              {currentStatus.label}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={status}
                onValueChange={(value) => setStatus(value as OnlineStatus)}
              >
                {onlineStatuses.map((item) => (
                  <DropdownMenuRadioItem key={item.value} value={item.value}>
                    <span
                      className={cn("size-2.5 rounded-full me-1", item.dot)}
                    />
                    {item.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/archive" />}>
            <Archive /> Archived messages
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
            <Settings /> Settings
          </DropdownMenuItem>
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <SunMoon /> Dark mode
            <Switch
              checked={resolvedTheme === "dark"}
              tabIndex={-1}
              aria-hidden="true"
              className="ms-auto pointer-events-none"
            />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmLogout(true)}
          >
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="Log out?"
        description="You will be signed out of your account on this device."
        actionLabel="Log out"
        onConfirm={() => router.push("/login")}
      />
    </>
  );
}

function BottomBar() {
  const pathname = usePathname();

  return (
    <aside className="fixed start-0 end-0 bottom-0 flex z-10 flex-col bg-background py-4 border-t">
      <nav className="flex flex-row items-center justify-around gap-4">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:h-10 md:w-10",
              { "bg-accent text-accent-foreground": pathname === item.href }
            )}
          >
            <item.icon className="size-5" />
            <span className="sr-only">{item.label}</span>
          </Link>
        ))}
        <UserMenu side="top" />
      </nav>
    </aside>
  );
}

export default function Sidebar() {
  return (
    <>
      <div className="hidden lg:block">
        <Aside />
      </div>
      <div className="block lg:hidden">
        <BottomBar />
      </div>
    </>
  );
}
