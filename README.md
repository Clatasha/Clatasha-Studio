# Clatasha Studio

**A browser-based image editor for creating YouTube thumbnails, Shorts graphics, social posts, and other visual content.**

Clatasha Studio is a Chrome extension with a layered canvas editor, offline image tools, reusable templates, local project saving, and an expandable plugin system. Its core editor works without accounts, external processing APIs, or image uploads.

## Current version

| Item | Status |
|---|---|
| Latest build | v1.0.63 |
| Development stage | Active development |
| Source code | Public |
| Main platform | Google Chrome and Chromium browsers |
| External processing APIs | Not required for core editing |

## Main features

- Layer-based editing with grouping, ordering, opacity, blend modes, locking, and multi-selection
- Text tools with imported fonts, curved text, vertical text, wrapping, outlines, shadows, and style presets
- Image crop, masks, perspective correction, slicing, healing, cutout, painting, fill, and eyedropper tools
- Shapes, lines, arrows, polygons, guides, rulers, snapping, alignment, and spacing controls
- Visual image-adjustment presets and custom adjustment controls
- Reusable local templates with generated canvas previews
- Separate YouTube, Shorts, and custom-size template sections
- PNG, JPG, and WebP export with quality and transparency controls
- Offline Image Cipher for concealing encrypted messages inside PNG images
- Offline Image to SVG conversion with artwork presets and high-accuracy tracing
- Local plugin installation and management
- Default and Bowetech workspace themes

## Install from source

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Select **Load unpacked**.
5. Choose the repository folder containing `manifest.json`.

Clatasha Studio opens from its extension icon. Changes pulled from GitHub can be applied with the extension page's **Reload** button.

## Project structure

```text
assets/      Branding, cursors, stickers, themes, and visual assets
editor/      Main canvas editor, interface, project storage, and plugin host
fonts/       Bundled editor fonts
icons/       Chrome extension icons
lib/         Bundled Fabric.js canvas library
plugins/     Built-in plugins and the local plugin API
popup/       Chrome extension popup
manifest.json
```

## Local data and privacy

Projects, custom templates, imported fonts, plugin settings, and editor preferences are stored locally in the browser. The extension does not require a Clatasha account and its manifest requests no website-access permissions.

Installed third-party plugins may have their own behavior. Review a plugin before installing it.

## Development

The extension uses plain HTML, CSS, JavaScript modules, Fabric.js, IndexedDB, and bundled WebAssembly. No Node.js build step is required for normal development.

JavaScript syntax can be checked with Node.js:

```bash
find editor popup plugins -type f -name '*.js' -print0 | xargs -0 -n1 node --check
```

GitHub Actions validates the source and creates an unpacked Chrome package artifact for each update to `main`.

## Feedback

- Use GitHub Issues for reproducible bugs and feature ideas.
- Include the Clatasha Studio version, Chrome version, operating system, and clear reproduction steps.
- Do not attach passwords, encryption keys, private projects, personal images, or confidential plugin data to public issues.

See [CONTRIBUTING.md](CONTRIBUTING.md), [ROADMAP.md](ROADMAP.md), and [CHANGELOG.md](CHANGELOG.md) for more information.

## Copyright and third-party software

Copyright © 2011–2026 Clatasha. All rights reserved.

No open-source license has been granted for Clatasha Studio's original source unless a file explicitly says otherwise. Bundled third-party components keep their respective licenses. See [COPYRIGHT.md](COPYRIGHT.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
