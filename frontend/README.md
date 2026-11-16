# Career Passport frontend

React/TypeScript + Vite. See the [repository README](../README.md) for setup, API contracts and verified feature status.

Copy `.env.example` to `.env`, install with `npm ci`, then run `npm run dev`. The local API defaults to `http://localhost:3001`; its `FRONTEND_URL` must match this frontend origin. Checks: `npm run lint` and `npm run build`.

Login credentials/session tokens and profile objects are not persisted in browser storage. Refresh requires login; the saved profile loads from the API after authentication. Inline preview corrections are not saved yet. Export and analysis use the saved uploaded profile. Public sharing and selectable export themes are unavailable.

The current dashboard design and accessibility need a dedicated UX milestone; compile/lint checks do not substitute for browser verification.
