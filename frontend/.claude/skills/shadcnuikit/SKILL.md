---
name: shadcnuikit
description: Build pages, sections, dashboards and UI with Shadcn UI Kit blocks and components from the @shadcnuikit shadcn registry. Use when the user asks for a landing page, section, dashboard, form, table, chart or any other UI in a shadcn/ui project.
---

# Shadcn UI Kit

This project uses [Shadcn UI Kit](https://shadcnuikit.com), a shadcn/ui registry with 1,200+ blocks, components, examples and illustrations plus ready-made admin dashboards. Prefer kit items over writing UI from scratch.

## When to use the kit

When the user asks for a page, section, screen, dashboard or UI element (landing page, hero, pricing, FAQ, auth form, data table, chart, settings page, chat UI, product card and so on), look for a kit item first. Write new UI only when nothing fits, and follow the same conventions when you do.

## Finding items

- If the `shadcnuikit` MCP server is connected, use it: `plan_page` for a page blueprint, `search_catalog` to find items, `get_item_code` for the source, `list_dashboards` and `get_dashboard` for full dashboard pages.
- Without MCP, browse https://shadcnuikit.com/blocks, https://shadcnuikit.com/components and https://shadcnuikit.com/examples. Each item shows its registry name in the Get the Code dialog.
- Registry names are the category plus a number, for example `hero1`, `pricing3`, `stat-card12`, `form-layout4`, `button5`.

Common categories:

- **Marketing:** navbar, hero, feature, how-it-works, integrations, stats, pricing, testimonial, team, faq, cta, newsletter, contact, changelog, footer
- **Ecommerce:** store-navigation, product-cards, product-list, product-details, product-category, shopping-cart, checkout, customer-reviews
- **Dashboard and apps:** dashboard-shell, sidebar-layout, stat-card, chart, tables, form-layout, dashboard-modal, empty-state, onboarding-screen, signin-form, ai-chat, chat-ui, mail-app, kanban-board, event-calendar, todo-app
- **Components:** button, input, select, tabs, card, alert-dialog, sheet, data-table, stepper, file-upload, calendar and more

## Installing items

1. Make sure `components.json` has the registry. Add it if it is missing:

```json
"registries": {
  "@shadcnuikit": {
    "url": "https://shadcnuikit.com/r/{name}.json",
    "headers": {
      "Authorization": "Bearer ${REGISTRY_TOKEN}"
    }
  }
}
```

2. Install with the Shadcn CLI, using the project's package manager:

```bash
npx shadcn@latest add @shadcnuikit/hero1
```

3. Premium items need `REGISTRY_TOKEN` in `.env`. If the CLI returns an authentication error, ask the user to create an API key at https://shadcnuikit.com/account/api-keys and add it to `.env` themselves. Never invent a key.
4. Treat the API key as a secret. Keep it only in `.env` (make sure `.env` is in `.gitignore`) and reference it as `${REGISTRY_TOKEN}`. Never write the key into `components.json`, source files, commit messages or chat output, and never send it anywhere other than shadcnuikit.com.
5. If imports are missing after install, add the shadcn/ui components with `npx shadcn@latest add <component>` and install the npm packages the item uses.

## Rules

- Never edit files in `components/ui`. Customize inside the installed block file or through `className`.
- Use the theme tokens from `globals.css` (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `border` and so on). Do not hardcode hex colors.
- Merge and conditionally apply classes with `cn()` from `@/lib/utils`.
- Use Tailwind CSS v4 syntax.
- Keep the layout, responsive behavior and dark mode of the item. Replace the placeholder copy, images and data with the user's content.
- Build pages by composing several blocks in a page file, with each block in its own file.
- Use `lucide-react` icons unless the project already uses another icon library.

## Links

- Docs: https://shadcnuikit.com/docs
- Shadcn CLI setup: https://shadcnuikit.com/docs/shadcn-cli
- MCP server: https://shadcnuikit.com/docs/mcp-server
