# Online Family Games

## Development checkpoint · 12 November 2026

**Yatzy is playable locally from a private lobby through a full multiplayer match and rematch.**

- [x] Create a room for 2–6 players and join by six-digit code or invite link.
- [x] Start as host, roll up to three times per turn, hold dice, preview scores and confirm a zero.
- [x] Keep turns and scorecards in sync. The server rolls the dice, validates moves and scores all 15 Scandinavian Yatzy categories, including the upper-section bonus.
- [x] Show final scores, recognize tied winners and start a fresh match in the same room.
- [x] Recover a seat after refreshing the same tab during a match. Rooms live in server memory and expire after all players disconnect for 15 minutes during a match. Restarting the backend clears them.
- [x] Apply connection and room-attempt limits and supply a security review agent and pull-request workflow.

**Last verification.** The production build and 12 automated tests passed. A two-player match was also played through all 15 rounds and a rematch in local browser tabs.

**Next milestone · public multiplayer playtest**

- [ ] Deploy the HTTPS endpoint and configure upstream DDoS protection.
- [ ] Verify an invite, a full match and same-tab reconnection from two devices on separate networks.
- [ ] Confirm GitHub requires a passing security check before merging into main.

Run the local game with `npm run dev:server` and `npm run dev` in separate terminals from the project root. See the [deployment instructions](deploy/README.md) for public hosting.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
npm run test:unit
```

### Run End-to-End Tests with [Cypress](https://www.cypress.io/)

```sh
npm run test:e2e:dev
```

This runs the end-to-end tests against the Vite development server.
It is much faster than the production build.

But it's still recommended to test the production build with `test:e2e` before deploying (e.g. in CI environments):

```sh
npm run build
npm run test:e2e
```
