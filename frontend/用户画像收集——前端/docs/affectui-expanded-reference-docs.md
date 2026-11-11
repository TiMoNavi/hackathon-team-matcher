AffectUI 官方 MCP 文档快照，2026-11-12。仅保存组件说明，安装命令及凭据已排除。inbox 仅作为进一步模板参考，本次未安装。

# glow-cloud

# Glow Cloud (Free)

A glowing cloud with eyes in red-orange or blue – it floats, turns to look around, blinks, follows the pointer and bounces with a wink when clicked

- Page: https://www.affectui.com/illustrations/glow-cloud
- Import: `import … from "@/components/ui/glow-cloud"`

## When to use
- A friendly face for an assistant, an AI feature or a cloud product – as an app icon, an empty state or a feature card
- Landing pages that want a calm, living mascot instead of a static logo

## When not to use
- Tiny sizes below ~48px – the glow and the eyes get lost
- Brands far from blue or orange – the colors are part of the look

## Usage
```tsx
import { GlowCloud } from "@/components/ui/glow-cloud";

export function AssistantCard() {
  return (
    <article style={{ maxWidth: 320 }}>
      <GlowCloud color="blue" />
      <h3>Meet your assistant</h3>
    </article>
  );
}
```

## Props
- `color`: `"blue" | "orange"` (default `"orange"`) – Blue-to-cyan or red-to-orange sky; the cloud's colors follow
- `background`: `boolean` (default `true`) – Fill the whole box with the sky gradient; false leaves the cloud on a transparent background with a soft colored edge
- `followPointer`: `boolean` (default `true`) – The eyes follow the pointer while it's over the illustration
- `label`: `string` – Accessible description of the illustration
- `className`: `string` – Extra class on the root

## Accessibility
- Exposed as one image with a descriptive label
- Clicking only plays an animation – nothing else happens

## Motion
- A bright colored body inside a white glow, with white eyes shaded lightly on the inside
- The cloud floats and breathes; its shadow shrinks and fades as it rises
- Every few seconds it glances left, right, up or down: the body tilts a little, the eyes move further and the shine slides the other way, so it seems to turn
- It blinks at random moments, sometimes twice
- The eyes follow the pointer; a click gives a squishy bounce and a wink
- Runs only while on screen; with prefers-reduced-motion it keeps still and only reacts to clicks

## Requirements
- React 19

Related: frost-cloud, model-wheel


---

# glass-folder

# Glass Folder (Pro)

Glassy blue folder with documents behind a frosted pocket that tips open on hover

- Page: https://www.affectui.com/illustrations/glass-folder
- Import: `import … from "@/components/ui/glass-folder"`

## When to use
- Feature cards about files, uploads, storage or a knowledge base; empty states for documents
- Bento grids that need a calm, friendly illustration above the text

## When not to use
- Showing real files – the documents are decorative and contain placeholder lines only
- Dark sections – the folder and documents are drawn for a light theme

## Usage
```tsx
import { GlassFolder } from "@/components/ui/glass-folder";

export function FeatureCard() {
  return (
    <article style={{ maxWidth: 360 }}>
      <GlassFolder />
      <h3>Card title</h3>
      <p>Short description of the feature.</p>
    </article>
  );
}
```

## Props
- `label`: `string` (default `"Blue folder holding three documents…"`) – Accessible description of the illustration
- `className`: `string` – Extra class on the root, e.g. for width or margins

## Accessibility
- Exposed as one image with a descriptive label; the folder parts inside are hidden from screen readers
- The hover effect is purely decorative, nothing needs to be reached with the keyboard

## Motion
- Hover the folder: the frosted pocket tips forward and each document shifts and turns on its own
- With prefers-reduced-motion the changes happen instantly

## Requirements
- React 19


---

# integration-beam

# Integration Beam (Free)

Your product between the tools it connects – light pulses flow along curved beams, hover to focus a tool, click to pause it

- Page: https://www.affectui.com/illustrations/integration-beam
- Import: `import … from "@/components/ui/integration-beam"`

## When to use
- A hero or integrations section that shows your product sitting between the tools a team already uses
- Landing pages where a calm, self-playing data flow explains “we connect to X and Y” faster than a logo wall

## When not to use
- A real integration settings page – pausing a tool here is only part of the scene, nothing is saved
- More than four tools per side – the beams get crowded; use Integration Grid or Logo Cluster for long lists

## Usage
```tsx
import { IntegrationBeam } from "@/components/ui/integration-beam";

export function IntegrationsSection() {
  return (
    <section style={{ maxWidth: 640, margin: "0 auto" }}>
      <IntegrationBeam />
    </section>
  );
}
```

## Props
- `left`: `{ name: string; logo: ReactNode }[]` (default `Slack, Notion, Gmail`) – Tools that send data in – on the left, or above the hub on narrow widths. The logo fills a 28 × 28 box
- `right`: `{ name: string; logo: ReactNode }[]` (default `HubSpot, Linear, Google Drive`) – Tools that receive data – on the right, or below the hub on narrow widths
- `center`: `{ name: string; logo?: ReactNode }` (default `{ name: "Acme" }`) – Your product. The logo is drawn white into a 36 × 36 box on the dark tile (currentColor); a neutral flower mark when left out
- `label`: `string` (default `"Acme connected to Slack, Notion, …"`) – Accessible name of the scene
- `className`: `string` – Extra class on the root, e.g. for width or margins

## Keyboard
- Tab: Moves between the tool tiles; the focused tool's beam comes forward and its name shows
- Enter / Space: Pauses or reconnects the focused tool

## Accessibility
- The scene is a labelled group; every tool is a toggle button with aria-pressed and a name like “Slack, connected”
- Pausing or reconnecting is announced in a polite live region, with the new count (“5 of 6 connected”)
- The beams, pulses and logos are decorative and hidden from screen readers
- Visible focus ring on the tiles; the tooltip also shows on keyboard focus

## Motion
- Sync cycles: pulses leave the left tools 280 ms apart, travel 1.5 s along their beam and, as they land, the hub glows and the next wave leaves for the right tools
- Each pulse is a short gradient – clear tail, accent body, pale tip – with a soft blurred glow; one accent color only
- The status chip under the hub slides between “Syncing…” and “6 connected”, and its width glides with the text
- When the layout switches between side by side and stacked, the tiles glide to their new spots and the curves morph with them (460 ms)
- The loop only runs while the scene is on screen (IntersectionObserver)
- With prefers-reduced-motion the beams are drawn as static lines – no pulses, no glides; hover, focus and pausing still work

## Requirements
- React 19

Related: integration-grid, integration-flow, logo-cluster, agent-team


---

# integration-flow

# Integration Flow (Pro)

Integration pills rotating along a dashed arc, each beaming its data into a central analysis hub

- Page: https://www.affectui.com/illustrations/integration-flow
- Import: `import … from "@/components/ui/integration-flow"`

## When to use
- A hero or feature section that shows your product pulling data in from the tools teams already use
- Integration or data-platform pages where a short, self-playing loop explains the idea better than a logo wall

## When not to use
- A real list of connected integrations – the pills are decorative, not interactive
- Very small spaces below ~320px wide, where the pill text gets hard to read
- Brands that clash with the warm coral background

## Usage
```tsx
import { IntegrationFlow } from "@/components/ui/integration-flow";

export function IntegrationsSection() {
  return (
    <section style={{ maxWidth: 1100, margin: "0 auto" }}>
      <IntegrationFlow />
    </section>
  );
}
```

## Props
- `items`: `{ name: string; icon: ReactNode; title?: string; mono?: boolean }[]` (default `Okta, Snowflake, Slack, ClickUp, Zendesk`) – Integrations that rotate through the pills (5 or more look best). The icon fills a 64 × 64 box; mono logos turn black in the centre
- `label`: `string` (default `"Integrations like Slack, Okta and Snowflake…"`) – Accessible description of the scene
- `className`: `string` – Extra class on the root, e.g. for width or margins

## Accessibility
- The scene is exposed as one image with a descriptive label; the pills and cards inside are hidden from screen readers

## Motion
- The pills travel along the dashed arc one slot at a time (0.9 s); the one landing in the centre turns light and shows its logo in color
- The centre pill charges up, a beam sweeps over to the Data Analysis hub (1.1 s) and the hub lights up as it arrives
- The coral background blobs drift and breathe slowly on a 16 s loop
- With prefers-reduced-motion everything stands still in the centre state, with the beam drawn in

## Requirements
- React 19


---

# agent-team

# Agent Team (Free)

A prompt types itself and branches out into three agents, each with a role and overlapping tool logos

- Page: https://www.affectui.com/illustrations/agent-team
- Import: `import … from "@/components/ui/agent-team"`

## When to use
- AI and automation products where one prompt sets up several agents or roles
- Feature cards about teams, delegation or workflows that span several tools

## When not to use
- Real org charts or live agent status – the scene is decorative and loops on its own
- More than three agents – the layout is built for exactly three

## Usage
```tsx
import { AgentTeam } from "@/components/ui/agent-team";

export function FeatureCard() {
  return (
    <article style={{ maxWidth: 560 }}>
      <AgentTeam
        prompt="Build a team to work my inbound pipeline"
        members={[
          { role: "Lead Researcher", avatar: "/team/lena.jpg", tools: ["linkedin", "hubspot"] },
          { role: "Inbound Qualifier", avatar: "/team/theo.jpg", tools: ["hubspot", "slack"] },
          { role: "Outbound SDR", avatar: "/team/noah.jpg", tools: ["gmail", "salesforce"] },
        ]}
      />
    </article>
  );
}
```

## Props
- `prompt`: `string` (default `"Build a team to work my inbound pipeline"`) – Text that types itself into the prompt pill
- `members`: `[AgentTeamMember, AgentTeamMember, AgentTeamMember]` – Required. Three agents, left to right – { role, avatar, tools? } with up to two of linkedin, hubspot, slack, gmail, salesforce
- `label`: `string` – Accessible description – by default built from the prompt and the roles
- `className`: `string` – Extra class on the root, e.g. for width or margins

## Accessibility
- Exposed as one image with a label built from the prompt and the roles; everything inside is hidden from screen readers
- Nothing in the scene is interactive

## Motion
- The prompt types itself, the send button presses and a soft pink-to-violet glow blooms behind it, dashed lines draw down and the three agents pop in one after another – then it starts over
- Each status dot pops in last; the tool circles overlap slightly
- With prefers-reduced-motion it shows the finished team and stays still

## Requirements
- React 19


---

# project-flow

# Project Flow (Pro)

Animated scene of a client task branching into subtasks, notes and assigned roles

- Page: https://www.affectui.com/illustrations/project-flow
- Import: `import … from "@/components/ui/project-flow"`

## When to use
- A feature section that shows how tasks, clients and roles connect in your product
- Landing pages where a short, self-playing scene explains a workflow better than text

## When not to use
- Interactive product UI – the scene is a decorative illustration, not working components
- Very small spaces below ~320px wide, where the card text gets hard to read

## Usage
```tsx
import { ProjectFlow } from "@/components/ui/project-flow";

export function FeatureSection() {
  return (
    <section style={{ maxWidth: 960, margin: "0 auto" }}>
      <ProjectFlow />
    </section>
  );
}
```

## Props
- `theme`: `"light" | "dark"` (default `"light"`) – Light or dark cards
- `label`: `string` (default `"A client task branching…"`) – Accessible description of the scene
- `className`: `string` – Extra class on the root, e.g. for width or margins

## Accessibility
- The scene is exposed as one image with a descriptive label; its inner elements are hidden from screen readers

## Motion
- The cards build up one after another: client, task, notes, roles and team, connected by lines that draw in
- A hand drags the subtask cards in, drops them with a small bounce and lets go
- With prefers-reduced-motion everything appears in its final state right away

## Requirements
- React 19


---

# layer-stack

# Layer Stack (Free)

Isometric stack of five layers with a list beside it – the chosen entry lifts its layer out in color

- Page: https://www.affectui.com/illustrations/layer-stack
- Import: `import … from "@/components/ui/layer-stack"`

## When to use
- Explaining a layered product or platform – each entry is one layer of the stack
- Feature sections that walk through capabilities one by one, with a visual that follows along

## When not to use
- More than five layers – the stack and the list are sized for up to five
- Navigation that changes page content – this is an illustration with its own small state

## Usage
```tsx
import { LayerStack } from "@/components/ui/layer-stack";

export function PlatformSection() {
  return (
    <section style={{ maxWidth: 640 }}>
      <LayerStack
        items={[
          { title: "Triggered by events", hint: "Webhooks", icon: "bolt" },
          { title: "Grounded in your data", hint: "Context", icon: "database" },
          { title: "Connected to your apps", hint: "APIs", icon: "plug" },
          { title: "Works with any model", hint: "Routing", icon: "spark" },
          { title: "Traced at every step", hint: "Logs", icon: "pulse" },
        ]}
      />
    </section>
  );
}
```

## Props
- `items`: `LayerStackItem[]` (default `five sample layers`) – Up to five entries, top layer first – { title, hint?, icon? } with icon one of bolt, database, plug, spark, pulse
- `defaultIndex`: `number` (default `0`) – Entry to start on
- `interval`: `number` (default `2600`) – Time per entry while it plays on its own, in ms
- `onChange`: `(index: number) => void` – Called when the user picks an entry
- `className`: `string` – Extra class on the root, e.g. for width or margins

## Keyboard
- Tab: Moves focus to the chosen entry
- ↑ / ↓: Picks the previous or next entry

## Accessibility
- The list is a vertical tablist with real buttons; the chosen entry has aria-selected
- The stack itself is decorative and hidden from screen readers

## Motion
- The chosen layer and the ones above it glide up to open a gap; its face, edge and icon turn blue and a soft glow fades in beneath it
- A white card glides behind the chosen entry in the list
- Steps through the entries on its own and pauses while hovered or focused; after a click or key press it stays put
- With prefers-reduced-motion it doesn't play on its own and changes happen instantly

## Requirements
- React 19


---

# cover-flow

# Cover Flow (Free)

Browse covers in 3D – drag, flick or scrub the row, it springs to the nearest cover; images drift in their frames over a soft reflection

- Page: https://www.affectui.com/illustrations/cover-flow
- Import: `import … from "@/components/ui/cover-flow"`

## When to use
- Six to twenty visual items where looking at one at a time is the point – albums, places, products, case studies, templates
- A showcase row that should feel physical: drag, flick, sideways trackpad scroll

## When not to use
- Text-heavy slides or many items to compare side by side – use a plain carousel or a grid
- Large libraries – a grid with a lightbox scales better

## Usage
```tsx
import { CoverFlow } from "@/components/ui/cover-flow";

export function Albums() {
  return (
    <CoverFlow
      aria-label="New releases"
      items={[
        { id: 1, title: "Low Tide", subtitle: "Mara Lind", image: "/covers/low-tide.jpg" },
        { id: 2, title: "Night Drive", subtitle: "Okto", image: "/covers/night-drive.jpg" },
        { id: 3, title: "Paper Moon", subtitle: "Ilse & June", image: "/covers/paper-moon.jpg" },
      ]}
      onSelect={(item) => openAlbum(item.id)}
    />
  );
}
```

## Props
- `items`: `CoverFlowItem[]` – { id, title?, subtitle?, image?, alt?, cover? } – pass an image URL or any ReactNode as cover
- `index`: `number` – Controlled front cover – pair with onIndexChange
- `defaultIndex`: `number` (default `middle cover`) – Starting cover when uncontrolled
- `onIndexChange`: `(index: number) => void` – Called whenever a different cover reaches the front, also while dragging
- `onSelect`: `(item, index) => void` – Clicking the front cover or pressing Enter – e.g. open a detail view
- `itemWidth`: `number` (default `280`) – Cover width in px – the whole row scales down in narrow containers (to half at most)
- `itemHeight`: `number` (default `280`) – Cover height in px
- `angle`: `number` (default `50`) – How far the side covers turn away, in degrees
- `reflection`: `boolean` (default `true`) – Mirror the covers on the floor
- `caption`: `boolean` (default `true`) – Title and subtitle of the front cover
- `renderCaption`: `(item, index) => ReactNode` – Replaces the default caption
- `controls`: `boolean` (default `true`) – Previous and next buttons beside the caption
- `ticks`: `boolean` (default `true`) – Small position ticks under the caption – clicking one jumps there
- `sound`: `boolean` (default `false`) – A soft click each time a new cover reaches the front (Web Audio, no file)
- `aria-label`: `string` (default `"Cover flow"`) – Names the carousel
- `className`: `string` – Extra class on the root

## Keyboard
- ← / →: Previous or next cover while the row has focus
- Home / End: First or last cover
- ↵: Selects the front cover (calls onSelect)

## Accessibility
- A region with aria-roledescription="carousel"; each cover is a group with aria-roledescription="slide" and a label like "3 of 10: Alpenglow"
- Covers away from the front are aria-hidden; the reflections are aria-hidden and inert
- The caption is a polite live region, so the new front cover is announced
- Previous / next are real buttons; the ticks are labelled "Show <title>" with aria-current and stay out of the tab order

## Motion
- A spring carries the row: drag 1:1, flick and it travels with your speed, then lands on a cover – a quick flick always moves at least one
- Sideways trackpad scrolling scrubs the row and settles in the direction of the swipe; vertical scrolling stays with the page
- Covers turn, recede, scale down and dim with distance; a light sheen sits on the side facing the center and each image drifts inside its frame
- The ends rubber-band; the caption rises in from the direction of travel
- With prefers-reduced-motion covers jump into place and the drift is off

## Requirements
- React 19

Related: tilt-card, logo-marquee, segmented-control


---

# team-invite

# Team Invite (Free)

Connected teammates – a cursor drags a new one into the empty slot, the line turns solid and they go online

- Page: https://www.affectui.com/illustrations/team-invite
- Import: `import … from "@/components/ui/team-invite"`

## When to use
- Feature cards about inviting teammates, collaboration, sharing or multiplayer
- Onboarding steps like “Invite your team” where a friendly, moving scene helps

## When not to use
- Showing your real team list – the scene is decorative and loops on its own
- Places that need to stay completely still – use prefers-reduced-motion or a static image

## Usage
```tsx
import { TeamInvite } from "@/components/ui/team-invite";

export function FeatureCard() {
  return (
    <article style={{ maxWidth: 420 }}>
      <TeamInvite
        avatars={[
          { src: "/team/maya.png", name: "Maya" },
          { src: "/team/finn.png", name: "Finn" },
          { src: "/team/lea.png", name: "Lea" },
        ]}
      />
      <h3>Invite your team</h3>
      <p>Bring everyone into the same workspace in seconds.</p>
    </article>
  );
}
```

## Props
- `avatars`: `[TeamInviteAvatar, TeamInviteAvatar, TeamInviteAvatar]` – Required. The two connected teammates, then the one being invited – each { src, name? } with a square portrait
- `label`: `string` – Accessible description – by default built from the names
- `className`: `string` – Extra class on the root, e.g. for width or margins

## Accessibility
- Exposed as one image with a descriptive label built from the names; avatars, lines and cursor are hidden from screen readers
- Nothing in the scene is interactive

## Motion
- A 4.4 s loop with soft ease-in-out: the cursor picks up the third avatar, carries it into the dashed slot, the line draws solid and the green status dot pops in
- Only transforms, opacity and a stroke offset are animated – no layout work
- With prefers-reduced-motion it stays a still frame of the waiting state

## Requirements
- React 19


---

# blur-crossfade

# Blur Crossfade (Pro)

Swaps content with a soft blur while the box glides smoothly to the size of what comes next

- Page: https://www.affectui.com/motion/blur-crossfade
- Import: `import … from "@/components/ui/blur-crossfade"`

## When to use
- Button labels and status text that change in place – Save → Saving… → Saved
- Panels, tips or steps that swap content of different lengths without a jump in the layout

## When not to use
- Navigating between pages or large views – use a route transition instead
- Content that updates many times per second, like counters or live prices

## Usage
```tsx
import { BlurCrossfade } from "@/components/ui/blur-crossfade";

export function SaveButton({ status }) {
  return (
    <button>
      <BlurCrossfade id={status} morph="both" as="span">
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save"}
      </BlurCrossfade>
    </button>
  );
}

// Height glides between messages of different length
<BlurCrossfade id={step}>
  <p>{steps[step]}</p>
</BlurCrossfade>
```

## Props
- `id`: `string | number` – Key of the current content – changing it starts the swap
- `children`: `ReactNode` – Content for the current id
- `duration`: `number` (default `420`) – Length of the swap and the size morph in ms
- `blur`: `number` (default `10`) – Blur in px at the outer ends of the fade
- `morph`: `"height" | "both" | "none"` (default `"height"`) – Which sides glide to the new size; both makes the box as wide as its content
- `as`: `"div" | "span"` (default `"div"`) – Root element – span inside buttons and other inline content
- `className`: `string` – Extra class on the box

## Accessibility
- Only the current content is exposed – the leaving copy is aria-hidden and inert
- Put aria-live on a surrounding element when the change should be announced, e.g. a status button

## Motion
- The old content blurs, fades and grows slightly as the new one sharpens in from 98 %, while the box glides to the new height (and width)
- Quick changes stay clean: only the latest leaving copy and the current content are ever on screen
- Reduced motion swaps instantly

## Requirements
- React 19

Related: text-reveal, gradient-text


---

# tilt-card

# Tilt Card (Pro)

A card that tilts in 3D towards the pointer, with a soft glare that follows it and a smooth spring back

- Page: https://www.affectui.com/motion/tilt-card
- Import: `import … from "@/components/ui/tilt-card"`

## When to use
- Showcase cards: membership or pricing cards, product shots, featured items
- A single hero object that should feel tangible on hover

## When not to use
- Grids of many cards – the motion becomes noise when every card tilts
- Cards full of controls or text to read – the moving surface makes them harder to use

## Usage
```tsx
import { TiltCard } from "@/components/ui/tilt-card";

export function MembershipCard() {
  return (
    <TiltCard maxTilt={10} scale={1.02}>
      <div className="membership">
        <span>affectUI Pro</span>
        <span>•••• 4821</span>
      </div>
    </TiltCard>
  );
}
```

## Props
- `children`: `ReactNode` – The card's content – it fills the tilting surface
- `maxTilt`: `number` (default `10`) – Maximum tilt in degrees
- `glare`: `boolean` (default `true`) – Show a soft glare that follows the pointer
- `scale`: `number` (default `1.02`) – Scale while the pointer is over the card
- `perspective`: `number` (default `900`) – Perspective distance in px – smaller is more dramatic
- `className`: `string` – Extra class on the wrapper; set --ui-tc-radius to match your card's corners

## Accessibility
- Purely visual: the tilt adds no roles or tab stops, and the glare is aria-hidden
- Keyboard focus on anything inside the card lifts it slightly, so focus is visible in the motion too

## Motion
- Pointer moves are batched with requestAnimationFrame and written to CSS variables; only transform and opacity animate
- On leave the card springs back to rest with a soft overshoot
- Touch pointers don't tilt
- Reduced motion: no tilt or glare, only the shadow changes

## Requirements
- React 19


---

# gradient-text

# Gradient Text (Pro)

Letters cut from a liquid, ever-flowing gradient – the color sweeps across the word the first time it's seen

- Page: https://www.affectui.com/motion/gradient-text
- Import: `import … from "@/components/ui/gradient-text"`

## When to use
- One word or a short phrase in a hero headline that should carry the brand
- A highlight inside a heading, like a product name or the payoff of a sentence

## When not to use
- Body copy or long passages – a moving gradient makes them harder to read
- Several highlights on one screen – the effect works because it's rare

## Usage
```tsx
import { GradientText } from "@/components/ui/gradient-text";

export function Hero() {
  return (
    <h1>
      Interfaces people actually <GradientText>feel.</GradientText>
    </h1>
  );
}
```

## Props
- `children`: `ReactNode` – The text to fill with the gradient
- `colors`: `string[]` (default `["#dd0674", "#5e3ee0", "#ff5fae", "#7c5cff"]`) – Gradient start, end and up to two blob colors; replaces the dark-mode colors too
- `speed`: `number` (default `8`) – Seconds per flow cycle
- `sweep`: `boolean` (default `true`) – Sweep the color in from left to right when the text scrolls into view
- `as`: `"span" | "h1" | "h2" | "p"` (default `"span"`) – Element to render
- `className`: `string` – Extra class on the root

## Accessibility
- The text stays real, selectable text – the gradient copy on top is aria-hidden
- Pick colors with enough contrast against your background; the defaults are tuned for white and near-black

## Motion
- Soft color blobs drift across a two-color base in a slow loop; the sweep wipes the color in once, the first time the text is 60% visible
- Reduced motion shows the finished gradient, standing still

## Requirements
- React 19

Related: text-reveal


---

# text-reveal

# Text Reveal (Free)

Text that arrives word by word or letter by letter – each piece rises out of a soft blur as it scrolls into view

- Page: https://www.affectui.com/motion/text-reveal
- Import: `import … from "@/components/ui/text-reveal"`

## When to use
- Headlines and short intros on landing pages that should arrive as you scroll
- A key sentence you want read in order, like a mission statement or a quote

## When not to use
- Long paragraphs or anything people need to read right away – waiting for words gets tiring
- Text that changes often, like live data – the reveal plays only when it enters the view

## Usage
```tsx
import { TextReveal } from "@/components/ui/text-reveal";

export function Intro() {
  return <TextReveal as="h2" text="Words that arrive one at a time." />;
}
```

## Props
- `text`: `string` – The text to reveal
- `by`: `"word" | "char"` (default `"word"`) – Reveal word by word or letter by letter
- `stagger`: `number` (default `40`) – Time between two pieces, in ms
- `delay`: `number` (default `0`) – Wait before the first piece, in ms
- `duration`: `number` (default `700`) – Time each piece takes to arrive, in ms
- `as`: `"p" | "h1" | "h2" | "h3" | "span"` (default `"p"`) – Element to render
- `once`: `boolean` (default `true`) – Reveal only the first time; otherwise it plays again each time it enters the view
- `className`: `string` – Extra class on the root

## Accessibility
- Screen readers get the full sentence from a visually hidden copy; the animated pieces are aria-hidden
- Words never break in the middle, and spaces stay real, so lines wrap like normal text

## Motion
- Each piece fades in out of a blur while it rises a little, one after another, once 30% of the text is visible
- Reduced motion shows the text right away

## Requirements
- React 19

Related: gradient-text


---

# grid-background

# Grid Background (Free)

A fine line grid that drifts slowly behind your content and fades out towards the edges

- Page: https://www.affectui.com/motion/grid-background
- Import: `import … from "@/components/ui/grid-background"`

## When to use
- Hero sections and feature headers that need a quiet, technical backdrop
- Empty states or panels that feel too flat on a plain background

## When not to use
- Behind dense text or data tables – the lines compete with the content
- Several moving backgrounds on one screen – keep it to one per view

## Usage
```tsx
import { GridBackground } from "@/components/ui/grid-background";

export function Hero() {
  return (
    <GridBackground size={48} direction="diagonal">
      <section style={{ display: "grid", placeItems: "center", minHeight: 480 }}>
        <h1>Build on a steady grid</h1>
      </section>
    </GridBackground>
  );
}
```

## Props
- `children`: `ReactNode` – Content rendered above the grid
- `size`: `number` (default `48`) – Cell size in px
- `color`: `string` (default `rgba(0,0,0,.07)`) – Line color; dark mode defaults to rgba(255,255,255,.07)
- `speed`: `number` (default `3`) – Seconds per cell; 0 keeps the grid still
- `direction`: `"up" | "down" | "left" | "right" | "diagonal"` (default `"diagonal"`) – Drift direction; diagonal runs from top right to bottom left
- `reveal`: `boolean` (default `true`) – Uncover the grid with a circle growing from the center when it first comes into view
- `fade`: `number` (default `70`) – Radius of the edge fade, in % of the distance to the corners
- `className`: `string` – Extra class on the container – give it a height or let the content size it

## Accessibility
- The grid layer is decorative: aria-hidden and pointer-events: none
- Content sits in its own layer above the grid and stays fully interactive

## Motion
- The lines move by exactly one cell per loop, so the drift is seamless; only transform is animated
- The reveal grows a circular mask from the center once, when the grid is 20% in view
- Reduced motion: the grid stays still and appears without the reveal

## Requirements
- React 19


---

# decision-card

# Decision Card (Pro)

An agent's question, asked the way Claude asks one – its own card just above the chat composer: numbered options with one Recommended, Approve / Decline for an approval, preview tiles for a pick, and a last row for your own words; a click or 1–5 answers, Later folds it to one line

- Page: https://www.affectui.com/components/decision-card?style=classic
- Import: `import … from "@/components/ui/decision-card"`
- Styles: classic (`decision-card`) and clean (`decision-card-clean`) – this page is the classic one; both share these docs

## When to use
- An agent in a chat needs one answer from you before it goes on – which option, approve or not, which variant
- Several tasks wait on you at once: one card with a pager, right where you type
- You want answers by keyboard – 1–5, arrows, Enter – without leaving the chat

## When not to use
- Many open decisions across agents, worked through as a list – use Decision Inbox
- Approving tool calls, file changes or messages with their diff or arguments – use Approval Gates
- Steering a run while it works – use Agent Steering

## Usage
```tsx
import { DecisionCard, type Decision } from "@/components/ui/decision-card";

const decisions: Decision[] = [
  {
    id: "queue",
    task: "Ingest pipeline",
    question: "Which queue should the ingest service use?",
    options: [
      { id: "kafka", title: "Kafka", summary: "A durable log – a day of events to replay", recommended: true },
      { id: "sqs", title: "SQS", summary: "Managed, nothing to run – but no replay" },
      { id: "pg", title: "Postgres queue", summary: "The database you already have" },
    ],
  },
];

export function Chat() {
  const [open, setOpen] = useState(decisions);
  return (
    <>
      <DecisionCard
        decisions={open}
        onDecide={(id, answer) => {
          agent.answer(id, answer);
          setOpen((l) => l.filter((d) => d.id !== id));
        }}
      />
      <Composer />
    </>
  );
}
```

## Props
- `decisions`: `Decision[]` – The open decisions, oldest first – an answered one leaves the card at once; drop it from the array in onDecide
- `onDecide`: `(id: string, answer: DecisionAnswer) => void` – An answer: { option } for a row or tile, { text } for your own words, "approve" or "decline"
- `onLater`: `(id: string) => void` – Later or Esc folded the card to one line
- `defaultFolded`: `boolean` (default `false`) – Start folded to "2 decisions waiting · Show"
- `reveal`: `number` – Change it to bring the card up – it unfolds, pulses gray once and focuses the selected row
- `labels`: `Partial<DecisionCardLabels>` – Every text, e.g. needsYou, later, show, recommended, approve, decline, own, waiting(n), of(i, n)
- `className`: `string` – Extra class on the root
- `Decision`: `{ id, question, task?, kind?, options?, facts? }` – kind: "decision" (default) | "pick" | "approval"; options: three to five { id, title, summary?, recommended?, preview?, blocks? }; facts: two or three { label, value } for an approval

## Keyboard
- 1 / – / 5: Answer with that row at once; the next number goes into the field
- Home / End: First or last row
- ↑ / ↓: Move between the rows (← → on tiles); ↓ from the last row goes into the field, ↑ from an empty field back
- Enter / Space: Answer with the row in focus; in the field, Enter sends your own words
- Esc: Later – folds the card to one line

## Accessibility
- The card is a group labelled by the question; the rows are a listbox with one tab stop that moves with the arrows
- Every row says its number key (aria-keyshortcuts); Later says Escape
- Answers and Later are announced politely – what you picked and how many still wait
- Focus rings show only for the keyboard (:focus-visible); the field for your own words gets no ring, only a firmer edge
- After an answer the focus moves to the next decision, the pager arrows keep it while you page, Later moves it to Show and Show back to the row – it never falls back to the page, even when your array drops the decision in focus
- After the last answer the card folds away and can't know your composer: move the focus there yourself in onDecide, e.g. if (open.length === 1) composerRef.current?.focus()

## Motion
- The next decision fades in; after the last answer the card folds away – its height to zero, then gone
- Brought up with reveal, the card pulses gray once
- With prefers-reduced-motion everything simply appears

## Notes
- Put it right above the chat composer, in the same column – the composer stays for new prompts, the card has its own field
- Keep options to three to five with a one-line summary each; mark at most one recommended
- Remove a decision from the array in onDecide – after the last one the card folds away by itself; then focus the composer

## Requirements
- React 19

Related: decision-inbox, approval-gates, chat-composer, agent-steering


---

# agent-trail

# Agent Trail (Pro)

The steps an agent works through, as one quiet trail – a header with the task and "3/5", done ones with a check and their time, the one it is on says what it is doing and branches into its sub-steps with a live timer, a step that needs approval waits with a dashed ring; a short fading light runs down the trail into the sub-step it is on

- Page: https://www.affectui.com/components/agent-trail?style=classic
- Import: `import … from "@/components/ui/agent-trail"`
- Styles: classic (`agent-trail`) and clean (`agent-trail-clean`) – this page is the classic one; both share these docs

## When to use
- Showing where an agent is in a task while it runs – what's done, what it is doing right now and what comes next
- A chat answer, a side panel or a task card that should show the agent's steps without a full trace
- Plans with a step that needs approval – merging, sending, paying – so people see the stop coming

## When not to use
- Reviewing or editing a plan before it runs – use Agent Plan
- Timing and cost of every call in a run – use Trace Waterfall or Cost Waterfall
- The decision itself, when a step waits – use Approval Card or Decision Card

## Usage
```tsx
import { AgentTrail, type TrailStep } from "@/components/ui/agent-trail";

const steps: TrailStep[] = [
  { id: "read", title: "Read the bug report", state: "done", duration: 8000 },
  { id: "repro", title: "Reproduce the crash", state: "done", duration: 34000 },
  {
    id: "patch",
    title: "Patch the checkout form",
    state: "running",
    status: "Testing",
    startedAt: Date.now(),
    substeps: [
      { title: "Found the empty-cart case", detail: "cart.ts:142" },
      { title: "Added a guard and 2 tests", detail: "+18 −3" },
      { title: "Running the test suite", detail: "182/214", state: "running" },
    ],
  },
  { id: "notes", title: "Write the release note", state: "pending" },
  { id: "pr", title: "Open a pull request", state: "pending", gate: true },
];

export function Progress() {
  return <AgentTrail title="Fix the checkout crash" steps={steps} />;
}
```

## Props
- `steps`: `TrailStep[]` – { id, title, state, duration?, status?, startedAt?, gate?, substeps? } – in the order the agent walks them
- `title`: `string` – The task, in a header over the trail with how many steps are done – "3/5". Leave it out for no header
- `state`: `"done" | "running" | "pending" | "waiting" | "failed"` – Per step – done shows a tinted check and its time, running a spinning ring with its status, waiting an amber Needs you, failed a red mark
- `duration`: `number | string` – How long a done step took – ms as a number (12s, 1m 4s, 1h 2m, 3d 4h), or your own text
- `status / startedAt`: `string / number` – What a running step does right now, shimmering – "Testing" – and when it started (Date.now()) for a live timer next to it
- `gate`: `boolean` – Needs approval before it runs – a dashed amber ring and "Approval" until it is reached, then "Needs you" while state is waiting
- `substeps`: `{ id?, title, state?, detail? }[]` – What the agent does inside a step – state done (default), running or pending, and a short fact on the right (long ones keep their end: "src/…Wrapper.tsx:1284"). The light runs to the running one; more than six fold to five around it with "+N earlier" and "+N more"
- `expanded / onExpandedChange`: `string[] / (ids) => void` – Which steps show their sub-steps. By default the running one opens, the rest open with a click
- `labels`: `Partial<AgentTrailLabels>` – Every word: title (the list's name without a header), running, approval, waiting, failed, done, pending, empty (no steps – "No steps yet"), untitled (a step without a title), earlier / more / fewer (the rows that fold long sub-step lists)
- `className`: `string` – Extra class on the root – set the color variables on it

## Keyboard
- Tab: Moves to each step that has sub-steps
- Enter / Space: Opens or closes its sub-steps
- Tab / Enter: On "+N earlier" or "+N more": shows every sub-step; "Show fewer" folds them again – focus stays on the row

## Accessibility
- An ordered list named after the task; the running step and sub-step carry aria-current="step"
- The header count reads "3 of 5 steps done"
- Each step reads its title, state and time – "Read the bug report – Done, 8s"; a step with sub-steps is a button with aria-expanded
- Closed sub-steps are inert, so the keyboard and screen readers skip them
- A step that loses its sub-steps while focused keeps the focus; times, badges and status read in their own direction, so "<1s" stays "<1s" in right-to-left pages
- A polite live region says when a step finishes, fails or waits for you
- Focus rings show for the keyboard only (:focus-visible), in light and dark

## Motion
- A short light – full at the front, fading to nothing at the back – runs from the running step down its branch into the sub-step it is on, and that dot rings once as it arrives
- The running marker's arc goes round, its status shimmers and the timer counts up
- A finished step's check pops in and draws itself; the line to the next step fills
- Sub-steps fold open and closed, the branch line follows
- With prefers-reduced-motion everything changes at once and the light stays off

## Notes
- Give every step a stable id – opening, closing and the live region track steps by it
- Keep status to one word in the present – "Testing", "Writing"
- Sub-step titles say what happened – "Found the empty-cart case" – and detail a short fact: a file, a diff, a count
- Only one step should be running; the light goes to its running sub-step
- Colors are variables on .ui-atr – --ui-atr-accent and --ui-atr-wash set the trail, --ui-atr-loop the light's speed

## Requirements
- React 19

Related: agent-plan, agent-monitor, thinking-state, approval-card


---

# writing-assistant

# Writing Assistant (Pro)

AI chat card with a soft gradient glow, suggestions, streaming replies and live voice dictation

- Page: https://www.affectui.com/components/writing-assistant?style=classic
- Import: `import … from "@/components/ui/writing-assistant"`
- Styles: classic (`writing-assistant`) and clean (`writing-assistant-clean`) – this page is the classic one; both share these docs

## When to use
- A small AI helper inside an editor, CRM or sidebar – rewrite, shorten, translate or draft
- Landing pages that should show an assistant you can actually try, including voice input

## When not to use
- Long conversations with files, tools and model settings – use the Chat Composer or the AI Chat / Start screen
- When you can't send voice to the browser's speech service – set speech="simulate" or hide the mic

## Usage
```tsx
import { WritingAssistant } from "@/components/ui/writing-assistant";

export function Helper() {
  return (
    <WritingAssistant
      name="Quill"
      tagline="Your writing companion."
      respond={async (message) => {
        const res = await fetch("/api/write", { method: "POST", body: JSON.stringify({ message }) });
        return (await res.json()).text;
      }}
    />
  );
}
```

## Props
- `name`: `string` (default `"Quill"`) – Assistant name on top
- `tagline`: `string` (default `"Your writing companion."`) – Line under the name
- `greeting`: `string` (default `"What should we write?"`) – Big line on the welcome screen
- `suggestions`: `string[]` – Chips that send themselves as a message
- `placeholder`: `string` (default `"Ask anything…"`) – Placeholder of the prompt field
- `respond`: `(message) => string | Promise<string>` – Your answer for a message; a sample writer is used by default
- `speech`: `"auto" | "simulate"` (default `"auto"`) – auto uses the browser's speech recognition when available, simulate always plays a sample take
- `dictation`: `string` – Sentence used for simulated dictation
- `className`: `string` – Extra class on the root

## Keyboard
- Enter: Sends what's in the prompt field
- Shift / Enter: Starts a new line – the field grows up to four lines, then scrolls
- Tab: Moves through the suggestions, the field, Send, the mic and New chat

## Accessibility
- The mic is a toggle button with aria-pressed and a label that says what it does next
- New messages are announced politely; the typing dots carry a label
- Everything works with the keyboard; dictation is optional

## Motion
- The glow keeps drifting in the lower half; the welcome view hands over to the chat with a short rise
- While listening, the mic turns dark with three calm bars and a soft ring breathing outwards; words appear live in the field
- When you stop speaking, the finished sentence moves into the chat as your message; replies stream in word by word
- With prefers-reduced-motion the glow stands still and replies appear at once

## Requirements
- React 19


---

# prompt-library

# Prompt Library (Pro)

Saved prompt templates with variables – type straight into the sentence, watch the finished prompt assemble below, and use it once every variable is filled

- Page: https://www.affectui.com/components/prompt-library?style=classic
- Import: `import … from "@/components/ui/prompt-library"`
- Styles: classic (`prompt-library`) and clean (`prompt-library-clean`) – this page is the classic one; both share these docs

## When to use
- AI products where people reuse the same prompts with small changes – summaries, release notes, outreach, debugging
- Next to a chat composer, as the place to pick a saved prompt, fill in the blanks and send it
- Team prompt libraries where the template stays fixed and only a few words change per use

## When not to use
- Free writing – a plain composer is faster when nothing repeats
- Long templates with many variables – past about six fields a form with labels reads better than a sentence
- Choosing a command or action – use Command Menu

## Usage
```tsx
import { PromptLibrary } from "@/components/ui/prompt-library";

export function Prompts() {
  return (
    <PromptLibrary
      templates={[
        {
          id: "meeting",
          title: "Summarize a meeting",
          category: "Notes",
          body: "Summarize the meeting below for {audience} in under {length}.",
          variables: { length: { default: "150 words" } },
        },
        {
          id: "error",
          title: "Explain an error",
          category: "Debug",
          body: "Explain this {language} error in plain words: {error}.",
        },
      ]}
      onUse={(prompt) => send(prompt)}
    />
  );
}
```

## Props
- `templates`: `PromptTemplate[]` – { id, title, category?, tone?, body, variables? } – body holds the variables in curly braces, e.g. {audience}; variables maps a name to { description?, default? }
- `value`: `string` – Id of the chosen template (controlled)
- `defaultValue`: `string` – Id chosen at first when uncontrolled – the first template by default
- `onSelect`: `(id: string) => void` – Called when another template is chosen
- `onUse`: `(prompt: string, template: PromptTemplate, values: Record<string, string>) => void` – Called with the finished prompt when Use is pressed – only possible once every variable is filled
- `onCopy`: `(prompt: string) => void` – Called after the prompt was copied to the clipboard
- `title`: `string` (default `"Prompts"`) – Heading above the list
- `useLabel`: `string` (default `"Use prompt"`) – Label of the use button
- `className`: `string` – Extra class on the root

## Keyboard
- ↓: From the search field into the list
- ↑ / ↓ / Home / End: Move through the list – the template opens as you go
- Esc: Clears the search
- Tab: Through the variable fields, then Copy and Use
- Enter: In a variable field: jumps to the next empty one, or uses the prompt once all are filled

## Accessibility
- A group named by the list's title; the templates are a listbox with options and aria-selected, only the chosen one is in the tab order
- Every variable is a real text field labelled with its name and description
- Use stays focusable while not ready (aria-disabled) and the tray says how many variables are missing
- A polite live region announces when all variables are filled, when the prompt was copied and when it was used
- The outgoing template that fades out during a switch is inert and hidden from screen readers

## Motion
- The highlight slides along the list to the chosen template while the content crossfades – the old one fades out underneath
- The part you type into lights up in the field and in the preview, then fades back
- Use pulses once when the last variable gets filled; Copy turns into a check for a moment
- With prefers-reduced-motion everything switches without movement

## Notes
- Variables are written as {name} with letters, digits, - or _; the same name used twice is one field
- Values are kept per template inside the card, so switching back and forth keeps what was typed
- Category colors follow the order the categories appear; set tone on a template to pick one

## Requirements
- React 19

Related: chat-composer, command-menu, writing-assistant


---

# tag-input

# Tag Input (Free)

Several values in one field as chips – paste a whole list, a check per value, duplicates flash, Backspace and arrow keys to edit

- Page: https://www.affectui.com/components/tag-input?style=classic
- Import: `import … from "@/components/ui/tag-input"`
- Styles: classic (`tag-input`) and clean (`tag-input-clean`) – this page is the classic one; both share these docs

## When to use
- Several short values in one field: email addresses to invite, labels, keywords, domains, stop words
- Lists people paste from elsewhere – commas, spaces or new lines turn into chips at once

## When not to use
- Picking from a fixed list – use the Combobox, which suggests as you type
- A single value – use the Text Field

## Usage
```tsx
import { useState } from "react";
import { TagInput } from "@/components/ui/tag-input";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function InviteField() {
  const [emails, setEmails] = useState<string[]>([]);

  return (
    <TagInput
      label="Invite people"
      value={emails}
      onChange={setEmails}
      placeholder="name@company.com"
      avatar
      splitOnSpace
      max={10}
      normalize={(t) => t.trim().toLowerCase()}
      validate={(t) => (EMAIL.test(t) ? true : `“${t}” doesn't look like an email address.`)}
      name="emails"
    />
  );
}
```

## Props
- `value`: `string[]` – The chips – makes it controlled
- `defaultValue`: `string[]` (default `[]`) – Starting chips when uncontrolled
- `onChange`: `(tags: string[]) => void` – Called when a chip is added or removed
- `validate`: `(tag: string) => true | string` – Checks a value before it becomes a chip; a message keeps it in the field and shows under it
- `normalize`: `(tag: string) => string` (default `trim`) – Cleans a value first, e.g. lowercases an email
- `splitOnSpace`: `boolean` (default `false`) – Also split on spaces – right for emails and single words, wrong for labels with spaces
- `max`: `number` – At most this many chips; shows "3/10" under the field
- `avatar`: `boolean` (default `false`) – A small circle with the first letter on every chip, for people
- `label`: `ReactNode` – Shown above the field and tied to its input
- `hint`: `ReactNode` – A quiet line under the field – a message takes its place while there is one
- `error`: `ReactNode` – Marks the field invalid from outside and shows the message
- `optional`: `boolean` (default `false`) – Adds "Optional" next to the label
- `placeholder`: `string` (default `"Add…"`) – Shown while there are no chips; "Add more…" after the first
- `name`: `string` – Sends the chips with a form, one hidden input per chip
- `disabled`: `boolean` (default `false`) – Dims the field and ignores input

## Keyboard
- Enter / ,: Turns what you typed into a chip (Tab does too, then moves on)
- Space: Also adds, with splitOnSpace
- ⌫: On an empty field: the first press marks the last chip, the second removes it
- ← / →: Walk the chips; Backspace or Delete removes the one in focus
- Esc: Empties what you were typing

## Accessibility
- A real text input with a label; the chips sit before it, each with a labelled Remove button
- Added and removed values are announced in a polite live region; a message sets aria-invalid on the input
- Chips are reachable with ← from the start of the field, so Tab still moves straight on to the next control

## Motion
- New chips pop in out of a short blur; a duplicate makes the chip it repeats flash instead of adding it twice
- No focus ring on the field – its edge firms up; a chip in keyboard focus gets the ring
- With prefers-reduced-motion everything switches instantly

## Requirements
- React 19

Related: text-field, combobox, select, button


---

# dropzone

# Dropzone (Pro)

Drag files in and watch them upload – fanning documents, colored type badges, progress with time left, errors with retry

- Page: https://www.affectui.com/components/dropzone?style=classic
- Import: `import … from "@/components/ui/dropzone"`
- Styles: classic (`dropzone`) and clean (`dropzone-clean`) – this page is the classic one; both share these docs

## When to use
- Uploading documents, images or media – attachments, imports, asset libraries, onboarding
- Several files at once, where people want to see what's done, what's still running and what failed

## When not to use
- A single avatar or logo – a simple picker with a preview is lighter
- Huge uploads that run in the background for minutes – show them in a separate transfer panel

## Usage
```tsx
import { Dropzone } from "@/components/ui/dropzone";

export function Attachments() {
  return (
    <Dropzone
      accept={[".pdf", ".png", ".jpg", ".xlsx"]}
      maxSize={25 * 1024 * 1024}
      onUpload={(file, onProgress) =>
        new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.onprogress = (e) => onProgress(e.loaded / e.total);
          xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
          xhr.onerror = () => reject(new Error("Upload failed – connection lost"));
          xhr.open("POST", "/api/upload");
          xhr.send(file);
        })
      }
      onChange={(items) => setAttachments(items.filter((i) => i.status === "done"))}
    />
  );
}
```

## Props
- `accept`: `string[]` – Allowed extensions, e.g. [".pdf", ".png"]; any file when left out. Other files get a row with an error
- `maxSize`: `number` (default `25 MB`) – Largest file in bytes; bigger files get a "Too large" row
- `onUpload`: `(file: File, onProgress: (p: number) => void) => Promise<void>` – Uploads one file and reports progress from 0 to 1; reject to mark it as failed (the message is shown, Retry calls it again). Simulated when left out
- `onChange`: `(items: UploadItem[]) => void` – Every change of the list: { id, name, size, status, progress, error?, file? }
- `hint`: `string` – Text under the title; defaults to the accepted types and the size limit
- `autoplay`: `boolean` (default `false`) – Plays a sample drop of four files – for previews and landing pages
- `className`: `string` – Extra class on the root

## Keyboard
- Tab: Reaches the drop area, then Retry and Remove in every row
- ↵: On the drop area: opens the file picker (Space works too)

## Accessibility
- The drop area is a button that opens the file picker, described by the accepted types and size
- Every row has a progress bar with its value; Retry and Remove are named after the file
- Finished, failed and rejected files are announced in a polite live region

## Motion
- Dragging files over the area fans the three little documents out, the outline turns solid blue and the title counts the files
- Rows grow in one after another; the bar fills in one solid color, a small check pops in when a file is done
- A failed row gives a short shake and its bar turns red; removed rows fold away
- With prefers-reduced-motion everything switches instantly

## Requirements
- React 19

Related: chat-composer, ai-answer, glass-folder


---

# inbox

# Agent / Inbox (Pro)

What your orchestrator needs from you, one question at a time – pick an option, a variant or approve, send it in a keystroke and the next one glides in

- Page: https://www.affectui.com/screens/inbox
- Import: `import … from "@/components/ui/inbox"`

## When to use
- You work with one orchestrator in one thread, and it hands you the decisions it can't make alone – a choice between options, a variant to pick, an action to approve or a question to answer
- Clearing what waits on you quickly, from the keyboard, without reading traces or agent trees

## When not to use
- Watching how a run unfolds – use Agent / Orchestration or AI Chat / Run
- A few decisions inside another page – use Decision Inbox or Approval Card

## Usage
```tsx
import { InboxScreen } from "@/components/ui/inbox";

export default function Page() {
  const [items, setItems] = useState(initialItems);
  return (
    <InboxScreen
      items={items}
      running={tasks.filter((t) => t.running).length}
      onDecide={(id, answer) => api.answer(id, answer)}
      onLater={(id) => api.snooze(id)}
      onNavigate={(label) => router.push(routes[label])}
    />
  );
}
```

## Props
- `onNavigate`: `(label: string) => void` – Called with the label of a sidebar item – and with "Tasks" from the empty state
- `workspace`: `string` (default `"Fieldwork"`) – The workspace in the sidebar
- `items`: `{ id; kind: "decision" | "pick" | "approval" | "question"; question; context?; task; at; unread?; options?; facts?; suggestions?; done? }[]` – Everything the orchestrator asked. at is a timestamp in ms; options { id, title, summary?, recommended?, pros?, cons?, wireframe?, preview? } for decision and pick – the recommended one is chosen when it opens; facts { label, value } for approval; suggestions for question; done { answer, at, label? } lists it under Done. Pass a stable array (state) – the screen follows it when it changes
- `running`: `number` (default `3`) – How many tasks keep running – the line under "You're all caught up"
- `defaultTab`: `"open" | "done"` (default `"open"`) – The list the screen opens with
- `defaultSelected`: `string` – The item open when the screen starts, by id – for a deep link, e.g. a task's Decide on the Tasks screen (?item=queue); it opens in its own list, and on phones full-width
- `onDecide`: `(id: string, answer: { option?: string; text?: string } | "approve" | "decline") => void` – Called when you send – with the chosen option, what you wrote in the reply field, or both; approve / decline for an approval
- `onLater`: `(id: string) => void` – Later – the item moves to the end of the open list
- `onReopen`: `(id: string) => void` – Reopen on a done item – it moves back to the top of the open list
- `onSelect`: `(id: string | null) => void` – Called when another item shows, and with null when none is left
- `tasks`: `Record<string, { goal?; project?; status?; started?; steps?; artifacts? }>` – About each task, by its name – shown in the Task panel on the right
- `artifacts`: `Record<string, { updated?; doc?; table?; sheet?; code?; image?; files?; preview? }>` – What each artifact shows in its tab, by file name. doc { title, paragraphs?, bullets?, html? } opens as a page you write in – bullets that start with "[ ] " / "[x] " make a checklist, html is what you wrote; table is rows of strings (a cell starting with = is a formula) with sheet { widths?, styles? } for column widths and cell styles by "row:col" ({ bold?, format?: "general" | "number" | "percent" | "currency" }); files is a folder – names, or { name, size?, modified?, kind?, files? } with size in bytes and modified as an ISO date or timestamp; a name without an extension is a subfolder
- `defaultOpenArtifacts`: `{ task: string; name: string }[]` – Artifacts already open as tabs in the Task panel when the screen starts – once every tab was closed, the panel comes back with the task alone
- `suggested`: `WorkspaceSource[]` (default `a few of the artifacts`) – Suggested in a New tab of the Task panel (the + after its tabs) – one with an artifact opens it in that tab
- `onOpenArtifact`: `(task: string, name: string) => void` – Called when an artifact opens – from the Task panel, a done item or a folder
- `onArtifactChange`: `(name: string, artifact: ShellArtifact) => void` – Called with the whole artifact whenever you change it in its tab – a cell, a column width, a style, the document's text, a folder's entries. The screen keeps every change itself while it lives (switch tabs, close and reopen); save it here
- `labels`: `{ inbox?; open?; done?; send?; later?; approve?; decline?; reopen?; recommended?; reply?; answer?; sent?; caughtUp?; tasks?; running?: (n) => string; … }` – Labels, e.g. for a translation
- `user`: `{ name: string; avatar?: string }` (default `{ name: "Alex Morgan" }`) – Account at the bottom of the sidebar
- `loading`: `boolean` – While your items load: gray rows in the list, a gray question in the reading column and gray lines in the Task panel, in the shape of the real ones (the shared Skeleton)
- `className`: `string` – Extra class on the root

## Keyboard
- J / K: Next and previous item – anywhere in the screen, as long as you're not typing
- ↑ / ↓ / Home / End: In the list: move through the items (one Tab stop, the selected row takes it); the item shows on the right as you go
- 1 / 2 / 3: Pick that option or variant; in the options themselves ↑ ↓ ← → move between them
- Enter: Send – from anywhere, from the reply field too; on an option, picks it and sends. An approval is approved (or your words are sent instead)
- L: Later – the item moves to the end of the list and the next one shows
- R / /: Focus the reply field (on a question: the answer field)
- Shift Enter: A new line in a question's answer
- Esc: Leave the reply field – on phones, go back from the item to the list
- ← →: Open / Done: switch between the two lists
- ← → / Home / End: Task panel tabs: move between them; Delete closes the focused tab – the task too; closing the last one folds the panel and the focus moves to its open button
- ↑ ↓ ← → / Shift + arrows / ⌘ + arrows: Sheet: move the active cell, extend the selection, jump to the edge of the data
- Tab / Shift Tab / Enter / Shift Enter: Sheet: move right / left / down / up like Excel; Tab at the last column (Shift Tab at A) leaves the sheet
- Type / F2 / Enter / Esc: Sheet: typing replaces the cell (arrows then write it and move on), F2 or a double-click edits in place, Enter or Tab writes, Esc cancels; = starts a formula and a click on a cell adds its name
- ⌘A / ⌘C / ⌘X / ⌘V / ⌘Z / ⇧⌘Z / ⌘B / Delete: Sheet: select all, copy / cut / paste as tab-separated text, undo, redo, bold, clear the selection
- ⌘B / ⌘I / ⌘U / ⇧⌘X / ⌘E / ⌘K: Document: bold, italic, underline, strikethrough, inline code, link
- ⇧⌘7 / ⇧⌘8 / ⇧⌘9 / ⌘Enter / Tab: Document: numbered, bulleted and checklist; ⌘Enter ticks a checklist item; Tab / Shift Tab nest a list item. Typing "# ", "## ", "- ", "1. ", "[ ] " or "> " at the start of a line formats it
- ↑ ↓ / Shift ↑ ↓ / ⌘A / Enter / Space: Folder: move, extend, select all, open (a file in its own tab, a folder in place), Quick Look; type a name's start to jump to it
- ⌘[ / ⌘] / ⌘↑ / F2 / ⌘D / ⌘⌫ / ⇧⌘N / ⌘1 / ⌘2 / ⌘F: Folder: back, forward, up, rename, duplicate, move to trash, new folder, list / icons, search
- Shift F10 / Context menu key: Opens the context menu on the active cell, the caret or the selected item; ↑ ↓ move, → opens a submenu, ← and Esc go back

## Accessibility
- The list is a listbox with a roving tabindex – one Tab stop; every row is named in full: its kind, the question, the task, when it came in and whether it's unread
- Options and variants are radio groups – the chosen one is checked, its pros and cons are read with it and hidden from the others
- After you send, the focus stays on the item's heading while it confirms, then moves to the next item's heading – or to "You're all caught up"; Later and Reopen move it the same way, so it's never dropped
- A polite live region says what happened: "Sent. 4 left.", "Later. Next: …", "Reopened. 5 open."
- Shortcuts are listed on their buttons (aria-keyshortcuts) and never fire while you type, apart from Enter and Esc
- Every control shows the accent focus ring for the keyboard only (:focus-visible) – inside rows and option cards it sits inset, so a scroller never cuts it
- Long questions, tasks and options end in '…' with the full text in a tooltip; right-to-left text reads in its own direction
- The artifact toolbars are role="toolbar" with one Tab stop – ← → Home End move between the 28px tools; every tool has a name and a tip with its shortcut, toggles are aria-pressed
- The sheet is a role="grid" with aria-activedescendant on the active cell and aria-selected on every selected one; the active cell's ring turns accent while the sheet has the focus; changes, sorts and formula results are announced in a polite live region
- The document is a multi-line textbox; the folder a multi-select listbox with the keyboard's place shown as an inset accent ring; Quick Look is a dialog that leaves the focus in the list
- Menus, the link field and Quick Look close with Esc and hand the focus back; context menus are role="menu" with menuitem / menuitemcheckbox items, disabled ones marked aria-disabled
- The Task panel is the App Shell's work area: a tablist whose every tab – the task included – has a labelled ×; + opens a New tab with Suggested artifacts; the viewers, toolbars and menus are the App Shell's
- No shortcut fires while you type in a field, and the work area never scrolls sideways – only the sheet does, inside itself

## Motion
- One moment: sending turns the answer into a check that draws itself and "Sent – it'll take it from here", then the row folds out of the list and the next item glides in
- The chosen option opens to its pros and cons; the unread dot fades once you've seen the item
- Menus, tips and Quick Look fade in quickly; the sheet's selection moves without animation, like Excel's
- With prefers-reduced-motion nothing slides, folds or draws – the confirmation simply shows

## Requirements
- React 19
- @hugeicons/react
- @hugeicons/core-free-icons

Related: decision-inbox, agent-inbox, approval-card

