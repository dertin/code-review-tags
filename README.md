# Code Review Tags (Conventional Comments)

Lightweight code review extension that adds tags and decorations in the style of [Conventional Comments](https://conventionalcomments.org/) directly in the Pull Request comment editor.

- Fast UI with tags (praise, nitpick, suggestion, issue, ...) and decorations (non‑blocking, blocking, if‑minor, ...).
- Inserts a consistent prefix at the start of the comment: `Label [decs]:` in bold, ready to type.
- Fully customizable from settings: tag and decoration lists, default tag, and initial visibility in replies.
- Button in the editor toolbar to show/hide the built‑in panel.
- Works today on Bitbucket.org (Pull Requests). GitHub and GitLab support is planned.

## Install

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-4285F4?logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/code-review-tags/eiddfkfgoicohaanchfoelgoidblbdge)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox%20Add--ons-Install-FF7139?logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/es-ES/firefox/addon/code-review-tags/)
[![Edge Add-ons](https://img.shields.io/badge/Edge%20Add--ons-Install-0C59A4?logo=microsoft-edge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/code-review-tags/gekciboeahhjcepkebohnkodoempidfo)

---

## Compatibility

- Bitbucket Cloud: `https://bitbucket.org/*/pull-requests/*`
- Engines: Manifest V3. Tested on Chrome/Edge and Firefox (>= 109) as a temporary extension.
- GitHub and GitLab: on the roadmap (see TODO).

## Installation (local / temporary)

Load from `src/` (useful during development):

- Chrome/Edge: `chrome://extensions` --> "Load unpacked" --> select `src/`.
- Firefox: `about:debugging#/runtime/this-firefox` --> "Load Temporary Add-on..." --> select `src/manifest.json`.

## Quick Use

1. Open a Pull Request on Bitbucket.org.
2. In the comment editor you'll see the "Code Review Tags" panel with:
   - A tag selector shown as chips; after you pick one, it collapses to reveal the decoration chips.
   - Optional decoration chips (e.g., non‑blocking, security, test).
   - A "🏷️" button in the editor toolbar to show/hide the panel.
3. When you select a tag (and optionally decorations), the extension automatically inserts a prefix at the start of the comment in the format: `Label [decs]: ...` (the `Label [decs]` part is bold for easy scanning).
4. Use the "X" to clear the prefix and close the panel.

## Settings

Open the extension popup and go to "Extension settings" (or from the browser's extensions page --> Options):

- Labels: editable, comma‑separated list (the reserved entry `X` is ignored).
- Decorations: editable, comma‑separated list.
- Default Label on Load: initial default tag.
- Replies: show panel by default: when enabled, the panel appears automatically in reply editors; otherwise you can open it with the toolbar button.

Changes are saved in the browser's `storage.sync`, and the extension reloads to apply them.

## Privacy

- Permissions: only `storage` to save settings (tags, decorations, and visibility preferences).
- The extension does not read or send the contents of your comments to external servers; it only manipulates the page's local DOM.
- Privacy policy: see `docs/privacy.html` in this repository.

## Development

The extension is written in vanilla JavaScript as a WebExtension (Manifest V3). No bundlers required.

- Main structure:
  - `src/manifest.json`: permissions, matches, and pages.
  - `src/content_script.js`: injects the panel and manages the comment prefix in the editor.
  - `src/style.css`: panel styles (light/dark modes).
  - `src/options.html` and `src/options.js`: options page.
  - `src/popup.html`: popup with quick links.

### How it works (key points)

- The content script detects Bitbucket editor containers and adds the panel once per editor.
- The toolbar button (🏷️) is inserted and kept at the end of the editor's toolbar.
- The prefix is applied and kept as `<strong>Label [decs]</strong>:` at the start of the editor's first block, adjusting the caret so typing is uninterrupted.
- When editing existing comments, the extension detects previous prefixes (bold or plain text) and updates them safely.

## Contributing

PRs are welcome! If you want to help:

- Open an Issue to discuss major changes or new platform support.
- Use small, focused PRs; clearly describe the scope and add screenshots if you change the UI.
- Keep the style simple (native JS/DOM with no unnecessary dependencies).
- Test in light/dark mode and in both comment and reply editors.

### Adding support for another platform (hints)

- Add the domain to `content_scripts.matches` in `manifest.json`.
- Implement editor detection selectors and heuristics similar to Bitbucket's in `content_script.js` (look for `EDITOR_CONTAINER_SELECTOR`, `PROSE_SELECTOR`, and toolbar handling).
- Ensure the toggle button visually integrates into the target platform's toolbar (clone classes/structure as needed).
- Verify the prefix in either rich HTML or plain text depending on the target editor.

## TODO

- GitHub support (PRs): matches, editor and toolbar selectors, caret tests.
- GitLab support (MRs): matches, editor and toolbar selectors, caret tests.
- Screenshots/GIFs for the README and store listing.
- UI i18n (ES/EN) and tooltips.
- Support more browsers (Safari via Safari Web Extensions).

## Attributions

- Inspired by the [Conventional Comments](https://conventionalcomments.org/) standard.
- Not affiliated with Atlassian/Bitbucket/GitHub/GitLab.

---

Made with ❤️ to speed up reviews and improve technical communication.
