# Changelog

## [1.1.0] - 2025-08-31

### Refactor
- Reorganized project to enable future GitHub/GitLab support.
- Introduced core (`src/content/core.js`), platforms (`src/content/platforms/`), and orchestrator (`src/content/main.js`).
- Moved options into `src/options/` (`options.html`, `options.js`).
- Unified global namespace to `globalThis.CodeReviewTags` (with `platforms` registry).
- Renamed CSS/data-attribute prefixes `cch` -> `crt`.
- Manifest load order now `content/core.js`, `content/platforms/bitbucket.js`, `content/main.js`.
- Build scripts copy `src/` recursively and produce clean, reproducible archives.

### Notes
- No functional changes intended; Bitbucket behavior remains the same.
- Ready for incremental addition of `platforms/github.js` and `platforms/gitlab.js`.

## [1.0.0] - 2025-08-24

### Added
- Initial release for Bitbucket Pull Requests.
- Panel UI with labels and decorations, toolbar toggle, and bold prefix insertion.
