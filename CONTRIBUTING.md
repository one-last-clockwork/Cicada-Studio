# Contributing to Cicada Studio

Cicada Studio welcomes issues, discussions, and carefully scoped pull requests.

Before submitting code, documentation, design assets, tests, examples, build scripts, or other copyrightable material, read these documents:

- [CLA policy](docs/legal/CLA-POLICY.md)
- [Contributor License Agreement](docs/legal/CONTRIBUTOR-LICENSE-AGREEMENT.md)
- [License boundaries](docs/legal/LICENSE-BOUNDARIES.md)

## Contribution Policy

Cicada Studio is released as an AGPL-3.0-or-later community project.

The project is also designed to serve as the basis for commercial, hosted, cloud, proprietary, and closed source editions.

For that reason, code or other copyrightable contributions cannot be accepted solely under AGPL-3.0-or-later.

External contributions require agreement to the Cicada Studio Contributor License Agreement before merge.

The CLA is intended to let the project maintain the AGPL community version while also allowing future commercial and closed source versions.

## Pull Request Requirements

Before a pull request can be merged, the contributor must confirm the following:

- The contributor has read and agrees to the Contributor License Agreement.
- The contributor has the right to submit the contribution.
- The contribution does not include third-party code, assets, or text unless their license and origin are clearly disclosed.
- The contribution can be used in AGPL, commercial, hosted, cloud, proprietary, and closed source versions of Cicada Studio.

Until an automated CLA workflow is configured, maintainers use an explicit pull request comment as the acceptance record.

Use this exact text when requested by a maintainer:

```text
I have read and agree to the Cicada Studio Contributor License Agreement in docs/legal/CONTRIBUTOR-LICENSE-AGREEMENT.md, and I confirm that I have the right to submit this contribution.
```

If the contribution is made on behalf of an employer or organization, the contributor must have authority to grant the required rights.

Maintainers require a corporate CLA when organizational authority is necessary, and decline the contribution when the required authority is not confirmed.

## What Can Be Accepted

Bug reports, feature requests, design notes, and discussions can be submitted without a CLA when they do not include substantial code or copyrightable implementation material.

Code, documentation, tests, examples, translations, icons, design files, templates, build scripts, and generated assets require CLA coverage before merge.

Maintainers reject or rewrite a contribution if the licensing status is unclear.

## Third-Party Material

Do not paste code from another project unless its license allows use in both the AGPL community version and future proprietary versions.

Do not submit assets copied from websites, icon packs, screenshots, fonts, generated images, or templates unless their license and source are documented.

When in doubt, describe the material in the pull request before adding it.

## AI-Assisted Contributions

AI-assisted work is acceptable only if the contributor can grant the rights required by the CLA.

Do not submit generated code, text, images, or assets if their terms, training source restrictions, or prompt inputs prevent use in AGPL and proprietary versions.

The contributor remains responsible for the contribution.

## Development

Install dependencies and start the local development server:

```sh
npm install
npm run dev
```

Run validation before opening a pull request when the change affects application behavior:

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

For changes that affect public exports, also run:

```sh
npm run verify:public-export
```

For browser behavior and UI changes, run the Playwright tests when practical:

```sh
npm run test:e2e
```
