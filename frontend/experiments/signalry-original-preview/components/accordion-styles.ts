/**
 * Restyles the shadcn AccordionTrigger to the Signalry look: semibold title that
 * turns violet when open, and the built-in chevron drawn inside a round chip.
 * Class names are written out in full so Tailwind can detect them.
 */
export const roundTriggerClass = [
  "items-center gap-4 font-semibold text-foreground hover:text-primary hover:no-underline aria-expanded:text-primary",
  "**:data-[slot=accordion-trigger-icon]:size-6 **:data-[slot=accordion-trigger-icon]:rounded-full **:data-[slot=accordion-trigger-icon]:bg-secondary **:data-[slot=accordion-trigger-icon]:p-1 **:data-[slot=accordion-trigger-icon]:text-primary",
  "aria-expanded:**:data-[slot=accordion-trigger-icon]:bg-primary aria-expanded:**:data-[slot=accordion-trigger-icon]:text-white",
].join(" ");
