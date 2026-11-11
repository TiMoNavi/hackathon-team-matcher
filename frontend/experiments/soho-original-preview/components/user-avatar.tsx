import { cn } from "@/lib/utils";

import { Avatar, AvatarImage, AvatarFallback, AvatarBadge } from "./ui/avatar";

const indicatorClasses = {
  success: "bg-green-400",
  warning: "bg-orange-400",
  danger: "bg-red-400",
} as const;

type UserAvatarProps = {
  image?: string;
  indicator?: keyof typeof indicatorClasses | null;
  fallback?: string;
  className?: string;
};

export default function UserAvatar({
  image,
  indicator,
  fallback,
  className,
}: UserAvatarProps) {
  return (
    <Avatar size="default" className={cn("size-12", className)}>
      <AvatarImage src={image} alt="avatar image" />
      {indicator ? (
        <AvatarBadge className={cn("size-3!", indicatorClasses[indicator])} />
      ) : null}
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  );
}
