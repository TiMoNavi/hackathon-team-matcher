import { notFound } from "next/navigation";
import ReferenceScene from "@/components/reference-scene";
import { referenceItems } from "@/lib/reference-catalog";
const scenes = referenceItems.map(item => item.id);
export default async function ReferenceView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!scenes.includes(slug)) notFound();
  return <ReferenceScene slug={slug}/>;
}

