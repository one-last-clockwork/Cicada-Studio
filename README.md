# Cicada Studio

Local-first static ARG authoring studio built as a React + TypeScript + Vite SPA.

The app stores authoring data in browser IndexedDB and exports two deliberately separate zip types:

- Project backup zip: includes author-only project data, drafts, notes, answers, flowcharts, and assets.
- Public site zip: contains only static HTML/CSS/assets, the small public runtime, and encrypted reveal/search/unlock payloads.

## Development

```sh
npm install
npm run dev
```

Validation:

```sh
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm run verify:public-export
```

The E2E command uses Playwright Chromium. On a fresh Linux environment run:

```sh
npx playwright install --with-deps chromium
```

## Cloudflare Pages App Deploy

Use Cloudflare Pages Git integration for the studio itself.

- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: 22

`wrangler.toml` also points static assets at `dist` for Wrangler-based static deployment experiments.

## Public Site Export

In the app, open the Export tab and choose `Export Public Zip`.

Before download, the app runs the same leakage/path traversal checker used by CI. The public zip must not include internal project JSON, drafts, memos, flowchart data, plaintext answers, plaintext search rules, or plaintext unlock payloads.

Deployment options:

- Cloudflare Pages Direct Upload: upload the exported public zip or extracted folder through the Pages dashboard.
- Wrangler: extract the public zip and deploy the static folder with Cloudflare's static assets flow.

References:

- https://developers.cloudflare.com/pages/get-started/direct-upload/
- https://developers.cloudflare.com/workers/static-assets/

## Security Model

Preview is safe by default: scripts are stripped and the iframe sandbox does not use `allow-same-origin`. Script preview requires both project-level and page-level opt-in, and still uses a sandboxed iframe without a parent API.

Public reveal, unlock, and search payloads use browser Web Crypto with PBKDF2 + AES-GCM. This prevents plaintext secrets from appearing by simply opening exported source, but it does not fully prevent offline brute force against short or guessable answers. Use longer phrases and explicit aliases for Japanese or other spelling variants.

Imported YACHO project scripts are never auto-enabled.
