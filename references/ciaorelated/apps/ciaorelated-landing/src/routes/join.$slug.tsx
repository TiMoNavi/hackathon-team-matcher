import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { SiteShell } from "@/components/site/SiteShell";
import { JoinInviteCard } from "@/components/site/JoinInviteCard";
import { brandText, brandTitle } from "@/lib/brand";

export const Route = createFileRoute("/join/$slug")({
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
  component: JoinSlugPage,
});

function JoinSlugPage() {
  const { slug } = Route.useParams();

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
