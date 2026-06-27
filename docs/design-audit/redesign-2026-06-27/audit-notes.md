# Cicada Studio Redesign Audit

Date: 2026-06-27
Viewport coverage: desktop 1440x1024, mobile 390x844

## Audit Scope

Existing local-first Cicada Studio app, focused on the primary production surfaces:

1. Dashboard
2. Pages
3. Editor
4. Search
5. Export
6. Mobile dashboard
7. Mobile editor

Screenshots are saved in this folder as `01-dashboard.png` through `07-mobile-editor.png`.

## User Goal And Accessibility Target

The user needs an ARG production workspace that feels polished and modern while staying easy to understand during repeated editing work. The interface should help creators see project state, move between authoring tasks, and trust local/export boundaries.

Accessibility target: preserve clear labels, visible focus, sufficient contrast, stable responsive layout, and keyboard-reachable controls.

## Strengths

- The app already has a clear functional map: project controls, sections, authoring, preview, export, and safety messaging exist.
- Core controls use native inputs, buttons, and selects, which gives the redesign a good accessibility baseline.
- The editor's three-column mental model is useful: page settings, HTML body, preview.
- Export is separated from authoring, which supports the local-first/security story.

## UX Risks

- The top area is crowded and flat. Project identity, language, save state, save actions, new project, and snapshot compete for attention.
- The tab bar reads like a row of generic buttons, not a durable product navigation system. On mobile it clips and makes the active location hard to parse.
- Dashboard metrics are present but do not explain production readiness or next actions clearly.
- Several surfaces feel empty or unfinished in default state, especially Search, Assets, and Flowchart. The empty space does not guide the user.
- The visual hierarchy relies heavily on bordered boxes, making important panels and secondary panels feel equally weighted.
- The editor has the right functional columns, but the HTML editor dominates without clear affordances for page metadata, reveal/unlock state, or preview health.
- Button labels mix product actions and implementation terms, so new users may not understand what to do next.

## Accessibility Risks

- Some active states rely mainly on dark fill in a small tab area; focus-visible treatment should be stronger after redesign.
- Mobile tabs overflow horizontally without a clear cue that more sections exist.
- Dense topbar wrapping on mobile separates related status and actions, increasing reading-order friction.
- Long Japanese labels and mixed English technical terms need resilient wrapping and spacing.
- The muted beige palette risks weak contrast between borders, surfaces, and background.

## Opportunity Areas

- Convert the topbar into a quieter command header: project identity on the left, status and primary actions on the right.
- Replace the button-tab strip with a left rail or grouped navigation that shows the creator's workflow.
- Add a compact "production status" band on the dashboard: pages, published, pending rules, snapshots, and export readiness.
- Make empty states instructional and action-oriented without adding long explanatory text.
- Give the editor a more deliberate split: inspector, writing canvas, live preview, and secondary reveal/unlock drawers.
- Use a restrained palette with one accent color, neutral surfaces, and clearer typography.
- Keep radii tight and surfaces mostly flat; use borders and subtle tints before shadows.

## Recommendations For Ideation

1. Explore a professional studio console with a left navigation rail and a dense but calm command header.
2. Explore a narrative case-board direction that makes ARG structure visible through pages, clues, and routes.
3. Explore a clean document editor direction that prioritizes writing and preview while keeping security/export status nearby.

## Evidence Limits

- Screenshots confirm visual hierarchy, layout, and responsive issues, but do not prove full keyboard or screen-reader behavior.
- Image generation will be based on inspected screenshots and written evidence. The current ImageGen interface in this environment does not accept direct screenshot attachments.
