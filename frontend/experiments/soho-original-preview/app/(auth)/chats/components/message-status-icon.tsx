import { Check, CheckCheck } from "lucide-react";

export default function MessageStatusIcon({ status }: { status?: string }) {
  switch (status) {
    case "read":
      return <CheckCheck className="shrink-0 h-4 w-4 text-green-500" />;
    case "forwarded":
      return <CheckCheck className="shrink-0 h-4 w-4 text-muted-foreground" />;
    case "sent":
      return <Check className="shrink-0 h-4 w-4 text-muted-foreground" />;
    default:
      return null;
  }
}
