import Image from "next/image";
import Link from "next/link";

const legalLinks = [
  { label: "Terms of Service", href: "#" },
  { label: "Privacy Policy", href: "#" },
  { label: "Cookie Policy", href: "#" },
];

export default function GuestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <Image
          src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&auto=format&fit=crop&q=80"
          alt="Mountain landscape"
          fill
          sizes="50vw"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/50" />
        <Link
          href="/"
          className="absolute start-8 top-8 flex items-center gap-2 text-lg font-semibold text-white"
        >
          <Image
            src="/logo.svg"
            width={28}
            height={28}
            className="invert"
            alt="Soho logo"
          />
          Soho
        </Link>
        <nav className="absolute inset-x-0 bottom-6 flex justify-center gap-5">
          {legalLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-xs text-white/70 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex flex-col items-center justify-center px-4 py-10">
        <main className="flex w-full max-w-sm flex-col gap-6">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 text-lg font-semibold lg:hidden"
          >
            <Image
              src="/logo.svg"
              width={28}
              height={28}
              className="dark:invert"
              alt="Soho logo"
            />
            Soho
          </Link>
          {children}
        </main>
      </div>
    </div>
  );
}
