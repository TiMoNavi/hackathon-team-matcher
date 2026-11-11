import { createFileRoute } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect } from "react";
import { SiteShell } from "@/components/site/SiteShell";
import { JoinInviteCard } from "@/components/site/JoinInviteCard";
import { brandText, brandTitle } from "@/lib/brand";

const joinSearch = z.object({
  slug: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/join")({
  validateSearch: zodValidator(joinSearch),
  head: () => ({
    meta: [
      { title: brandTitle("You're invited") },
      {
        name: "description",
        content: brandText("Open your ciaorelated invitation in the app."),
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { slug } = Route.useSearch();

  // TODO: deep-link script slot.
  // /public/deep-link.js will be loaded here by the production setup so that
  // the real handoff to the native app (AppsFlyer, custom URL scheme, App
  // Store fallback, etc.) can be wired in without touching the React tree.
  // We do NOT redirect away from /join and we preserve all query params.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("app-deeplink-script")) return;
    const s = document.createElement("script");
    s.id = "app-deeplink-script";
    s.src = "/deep-link.js";
    s.async = true;
    s.defer = true;
    document.body.appendChild(s);
  }, []);

  return (
    <SiteShell>
      <section className="relative overflow-hidden py-16">
        <div className="pointer-events-none absolute inset-0 hero-glow opacity-70" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
          <JoinInviteCard slug={slug} />
        </div>
      </section>
    </SiteShell>
  );
}
