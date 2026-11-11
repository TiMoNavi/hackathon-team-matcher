import Hero from "@/components/sections/hero";
import Features from "@/components/sections/features";
import WorkflowSteps from "@/components/sections/workflow-steps";
import Advantage from "@/components/sections/advantage";
import AiIntelligence from "@/components/sections/ai-intelligence";
import Integrations from "@/components/sections/integrations";
import Testimonials from "@/components/sections/testimonials";
import Pricing from "@/components/sections/pricing";
import Faq from "@/components/sections/faq";
import Footer from "@/components/sections/footer";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Hero />
      <Features />
      <WorkflowSteps />
      <AiIntelligence />
      <Advantage />
      <Integrations />
      <Testimonials />
      <Pricing />
      <Faq />
      <Footer />
    </main>
  );
}
