# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [2.3.4](https://github.com/bocan/codex/compare/v2.3.3...v2.3.4) (2026-01-26)


### Documentation

* update copilot instructions with deployment and navigation details ([947dced](https://github.com/bocan/codex/commit/947dced750cfc41c6e4f5f6950e570e1ffb5348d))

## [2.3.3](https://github.com/bocan/codex/compare/v2.3.2...v2.3.3) (2026-01-26)

## [2.3.2](https://github.com/bocan/codex/compare/v2.3.1...v2.3.2) (2026-01-26)


### Documentation

* update README with Docker deployment instructions and remove example ([ac5038b](https://github.com/bocan/codex/commit/ac5038b2a4e35f995f7e82a1819c4df0772b8e9f))

## [2.3.1](https://github.com/bocan/codex/compare/v2.3.0...v2.3.1) (2026-01-26)


### Code Refactoring

* **release:** simplify release notes generation process ([0072d27](https://github.com/bocan/codex/commit/0072d27c8071a8ca10aca9747cad8dd1abbd9ccb))

## [2.3.0](https://github.com/bocan/codex/compare/v2.2.0...v2.3.0) (2026-01-26)


### Features

* **release:** add automated release workflow for GitHub Actions ([585dd1c](https://github.com/bocan/codex/commit/585dd1c0b82105bdc2059821f16af11fcf1f734d))

## [2.2.0](https://github.com/bocan/codex/compare/v2.0.1...v2.2.0) (2026-01-26)


### Features

* **docker:** add Dockerfile and docker-compose for containerization ([ae53258](https://github.com/bocan/codex/commit/ae532580af4e25e42ff05897c32b9191d06e83e8))


### Bug Fixes

* **PageList:** correct listRef type and optimize sorting logic ([2d0ecc9](https://github.com/bocan/codex/commit/2d0ecc97aaa893f226b36b7e63edadd12c75894d))

## [2.1.0](https://github.com/bocan/codex/compare/v2.0.1...v2.1.0) (2026-01-26)


### Features

* **docker:** add Dockerfile and docker-compose for containerization ([ae53258](https://github.com/bocan/codex/commit/ae532580af4e25e42ff05897c32b9191d06e83e8))


### Bug Fixes

* **PageList:** correct listRef type and optimize sorting logic ([2d0ecc9](https://github.com/bocan/codex/commit/2d0ecc97aaa893f226b36b7e63edadd12c75894d))

## [2.0.1](https://github.com/bocan/codex/compare/v2.0.0...v2.0.1) (2026-01-24)

## [2.0.0](https://github.com/bocan/codex/compare/v1.2.0...v2.0.0) (2026-01-24)


### Documentation

* update Git commands to use modern alternatives ([fd7f201](https://github.com/bocan/codex/commit/fd7f201af6b76436776379b4988f46fe6c3cc0b6))

## [1.2.0](https://github.com/bocan/codex/compare/v1.1.5...v1.2.0) (2026-01-24)


### Features

* **about:** add link to changelog in version display ([0732990](https://github.com/bocan/codex/commit/0732990eb86b93c17af4aecfa26f567a13f5ed73))


### Documentation

* update README with Git workflow and release instructions ([2b800a0](https://github.com/bocan/codex/commit/2b800a0cc9e828e8e67bcabb87415abe753eccd8))

## [1.1.5](https://github.com/bocan/codex/compare/v1.1.4...v1.1.5) (2026-01-24)


### Code Refactoring

* **search:** move fileSystemService import to index ([7135424](https://github.com/bocan/codex/commit/71354240ee7ec1c773fdc0c14756fe0feb4ab1d2))

## [1.1.4](https://github.com/bocan/codex/compare/v1.1.3...v1.1.4) (2026-01-24)


### Styles

* clean up pre-commit configuration by removing unused hooks ([7e65b83](https://github.com/bocan/codex/commit/7e65b83a7fe5e5dc74b7658497e072449dd30508))

## [1.1.3](https://github.com/bocan/codex/compare/v1.1.2...v1.1.3) (2026-01-24)


### Code Refactoring

* replace standard-version with commit-and-tag-version for releases ([5b74e5e](https://github.com/bocan/codex/commit/5b74e5e0c09414d3c0ae772e927c256a384e1b3a))

### [1.1.2](https://github.com/bocan/codex/compare/v1.1.1...v1.1.2) (2026-01-24)

### [1.1.1](https://github.com/bocan/codex/compare/v1.1.0...v1.1.1) (2026-01-24)


### Code Refactoring

* reveal hidden sections in version configuration ([a92536f](https://github.com/bocan/codex/commit/a92536f7d3b851db65b32dff9d65f05a9a3997ae))

## 1.1.0 (2026-01-24)


### Features

* add search functionality and attachment management ([2fd8a4f](https://github.com/bocan/codex/commit/2fd8a4ffe144caff8f4740c734d327e1fbf036e6))
* add syntax highlighting, dynamic app config, and UI improvements ([15a9585](https://github.com/bocan/codex/commit/15a95859cb371b6bccda7fa74c5c083a6f898e78))
* **auth:** implement password-based authentication with session management ([7e9d0bb](https://github.com/bocan/codex/commit/7e9d0bb754e4d27549c1895c51567599b1a07423))
* initialize Codex project with server and client workspaces ([811f35c](https://github.com/bocan/codex/commit/811f35c00fb3d1f1e53c320cbd8f648c8acdbb00))


### Bug Fixes

* add jest types to tsconfig for improved type checking in tests ([7d175ce](https://github.com/bocan/codex/commit/7d175cee577639a3a5a4c6c6e6dc1302570e9c35))
* correct CI dependency installation order ([e6b7ca6](https://github.com/bocan/codex/commit/e6b7ca63ccad920e3fe3255125d19c02f5335274))
* remove unnecessary blank lines in getBreadcrumbs function ([7a0e5df](https://github.com/bocan/codex/commit/7a0e5dfe05ab681446e02d576d44d1fd455736dc))
* remove unnecessary whitespace in Editor and VersionHistory components ([c661a17](https://github.com/bocan/codex/commit/c661a1714cb12cc8fdeb54e1d69406604d0d3856))
* resolve CI jest and TypeScript issues ([770e083](https://github.com/bocan/codex/commit/770e083aaeefcdb015fe1c0a2d4b842d4be76759))
* streamline CI dependency installation and clean up imports in components ([8957859](https://github.com/bocan/codex/commit/89578596e69c4c4c7d96bb1ec9ca120e2ac057dd))
* upgrade react-dom and @types/react-dom to match react 19.x ([ece1850](https://github.com/bocan/codex/commit/ece185047a1c2ca09b5622f4545dd45e1735efa1))
* use npm run build for type checking in lint job ([c87024c](https://github.com/bocan/codex/commit/c87024ca507d1eb7cdf156d7908e8e833c27fcb0))
* use wildcard pattern for npm cache paths ([4792cc1](https://github.com/bocan/codex/commit/4792cc10c4055b7f81f01440604a7a24cb6edc34))
* use working-directory in CI and remove jest from tsconfig types ([8e41fa3](https://github.com/bocan/codex/commit/8e41fa3d7d021bda1c6e3d05c667f9a78b534aa2))

## 1.0.0 (2026-01-24)

### Features

* 📁 Hierarchical folder organization with collapsible tree view
* 📝 Markdown editor with GitHub Flavored Markdown support
* 👁️ Real-time synchronized preview with scroll sync
* 🎨 Syntax highlighting for code blocks with copy button
* 🔍 Full-text search across all documents (⌘K/Ctrl+K)
* 📎 File attachments with drag-and-drop support
* 📜 Git-powered version history with visual diff
* 🌗 Four theme options: auto, light, dark, and high-contrast
* 📱 Responsive design with auto-collapsing panes
* 🔐 Optional password protection
* 📑 Auto-generated table of contents
* 🎤 Speech-to-text dictation support
* 📤 Export to Word document
* ⚡ Server-side caching for fast loading
