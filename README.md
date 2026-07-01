# Cicada Studio

Local-first static ARG authoring studio built as a React + TypeScript + Vite SPA.

The app stores authoring data in browser IndexedDB and exports two deliberately separate zip types:

- Project backup zip: includes author-only project data, drafts, notes, answers, Story Maps, and assets.
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

Before download, the app runs the same leakage/path traversal checker used by CI. The public zip must not include internal project JSON, drafts, memos, Story Map data, plaintext answers, plaintext search rules, or plaintext unlock payloads.

Deployment options:

- Cloudflare Pages Direct Upload: upload the exported public zip or extracted folder through the Pages dashboard.
- Wrangler: extract the public zip and deploy the static folder with Cloudflare's static assets flow.

References:

- https://developers.cloudflare.com/pages/get-started/direct-upload/
- https://developers.cloudflare.com/workers/static-assets/

## Contributing

Cicada Studio accepts external contributions under the contribution policy documented in `CONTRIBUTING.md`.

The project is designed to support AGPL community releases and future commercial, hosted, cloud, proprietary, or closed source editions. Code, documentation, design assets, tests, and other copyrightable contributions require agreement to the Cicada Studio Contributor License Agreement before merge.

See:

- `CONTRIBUTING.md`
- `docs/legal/CLA-POLICY.md`
- `docs/legal/CONTRIBUTOR-LICENSE-AGREEMENT.md`
- `docs/legal/LICENSE-BOUNDARIES.md`

## Security Model

Preview is safe by default: scripts are stripped and the iframe sandbox does not use `allow-same-origin`. Script preview requires both project-level and page-level opt-in, and still uses a sandboxed iframe without a parent API.

Public reveal, unlock, and search payloads use browser Web Crypto with PBKDF2 + AES-GCM. This prevents plaintext secrets from appearing by simply opening exported source, but it does not fully prevent offline brute force against short or guessable answers. Use longer phrases and explicit aliases for Japanese or other spelling variants.

Imported YACHO project scripts are never auto-enabled.

## License

Cicada Studio itself is licensed under AGPL-3.0-or-later. See `LICENSE`.

User-created project data, stories, page content, assets, and published site content are not licensed under AGPL merely because they were created, edited, exported, or deployed with Cicada Studio. Users can license their own works under terms they choose.

Public site exports can include Cicada Studio-provided runtime and template materials such as `runtime.js` and generated HTML shell/widget markup. Those exported runtime/template materials are licensed under MIT when included in generated public site exports. See `LICENCE-OUTPUT.md`.
