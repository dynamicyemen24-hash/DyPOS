# DyPOS POS — frontend

The cashier PWA for **DyPOS**: Vue 3 + Vite + Pinia, Tailwind, Dexie (IndexedDB)
and the first-party **DyPOS UI kit** that lives in this repo at
`packages/dypos-ui` (aliased as `dypos-ui`, never installed from a registry).

## Docs

- Product: https://dypos.smartportssoft.com/
- Offline architecture: [`docs/OFFLINE_ARCHITECTURE.md`](../docs/OFFLINE_ARCHITECTURE.md)
- Startup sequence: [`docs/STARTUP_SEQUENCE.md`](../docs/STARTUP_SEQUENCE.md)

## Usage

The app is the product root — clone the repository and install:

```
cd POS
npm ci
npm run dev
```

The UI kit ships with the repo, so there is nothing to fetch separately.

In a development environment, you need to put the below key-value pair in your `site_config.json` file:

```
"ignore_csrf": 1
```

This will prevent `CSRFToken` errors while using the vite dev server. In production environment, the `csrf_token` is attached to the `window` object in `index.html` for you.

The Vite dev server will start on the port `8080`. This can be changed from `vite.config.js`.
The development server is configured to proxy your dyposapp (usually running on port `8000`). If you have a site named `todo.test`, open `http://todo.test:8080` in your browser. If you see a button named "Click to send 'ping' request", congratulations!

If you notice the browser URL is `/frontend`, this is the base URL where your frontend app will run in production.
To change this, open `src/router.js` and change the base URL passed to `createWebHistory`.

## Source maps in production builds

Production builds omit JavaScript source maps by default to keep bundle sizes small. If you need source maps for debugging a specific deployment, set the environment variable `DyPOS_ENABLE_SOURCEMAP=true` before running the build command. Any value other than the string `"true"` will keep source maps disabled.

## Resources

- [Vue 3](https://v3.vuejs.org/guide/introduction.html)
- [Vue Router](https://next.router.vuejs.org/guide/)
- [dyposUI](https://github.com/dypos/dypos-ui)
- [TailwindCSS](https://tailwindcss.com/docs/utility-first)
- [Vite](https://vitejs.dev/guide/)
