# avatar15: With popover
Category: components/avatar
Preview: https://shadcnuikit.com/components/avatar/15

## Requirements
shadcn/ui components (add the missing ones): npx shadcn@latest add avatar button popover
npm packages (install the missing ones): lucide-react

## Files
### components/avatar15.tsx
```tsx
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDown, UserPlusIcon } from "lucide-react";

export default function AvatarComponent() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="flex items-center gap-1">
          <Avatar className="cursor-pointer">
            <AvatarImage
              alt="Tobias Whetton"
              src="https://i.pravatar.cc/150?img=1"
            />
          </Avatar>
          <ChevronDown className="text-muted-foreground size-4" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-full max-w-96">
        <div className="flex gap-4">
          <Avatar className="mt-1 size-14">
            <AvatarImage
              alt="Tobias Whetton"
              src="https://i.pravatar.cc/150?img=1"
            />
          </Avatar>
          <div className="space-y-1">
            <div className="flex justify-between">
              <div>
                <p className="text-base font-semibold tracking-tight">
                  Toby Belhome
                </p>
                <p className="text-muted-foreground text-xs">@tobybelhome</p>
              </div>
              <Button variant="outline" size="sm">
                <UserPlusIcon />
                Follow
              </Button>
            </div>
            <p className="text-muted-foreground text-sm">
              Engineer, designer &amp; developer that can be found inhabiting
              coffee houses
            </p>
            <div className="text-muted-foreground mt-4 flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-foreground font-semibold">321</span>{" "}
                <span>Points</span>
              </div>
              <div>
                <span className="text-foreground font-semibold">30</span>{" "}
                <span>Friends</span>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

# card9: Social profile
Category: components/card
Preview: https://shadcnuikit.com/components/card/9

## Requirements
shadcn/ui components (add the missing ones): npx shadcn@latest add button card
npm packages (install the missing ones): lucide-react

## Files
### components/card9.tsx
```tsx
import { ArrowUpRight, Feather } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const ProfileCardDemo = () => {
  return (
    <Card className="w-full max-w-sm gap-0 overflow-hidden py-0 shadow-none">
      <CardContent className="relative h-36 overflow-hidden bg-foreground px-0">
        <ArrowUpRight
          className="absolute -top-6 -right-6 size-32 text-orange-600"
          strokeWidth={2.5}
        />
      </CardContent>
      <CardContent className="relative flex flex-col gap-4 pt-4 pb-6">
        <div className="absolute -top-8 left-6 flex size-16 items-center justify-center rounded-full bg-green-700 ring-4 ring-background">
          <Feather className="size-7 text-white" />
        </div>
        <div className="flex justify-end">
          <Button className="rounded-full">Follow</Button>
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold leading-snug">
            Notabli AI - Meeting Notetaker
          </h3>
          <p className="text-muted-foreground text-sm">@notabli.ai</p>
        </div>
        <p className="text-sm leading-snug">
          Focus on the Conversation, We&apos;ll Take the Notes.
        </p>
        <div className="flex items-center gap-4 text-sm">
          <p>
            <span className="font-semibold">184</span>{" "}
            <span className="text-muted-foreground">Following</span>
          </p>
          <p>
            <span className="font-semibold">98,215</span>{" "}
            <span className="text-muted-foreground">Followers</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProfileCardDemo;
```
