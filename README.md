# aslam-notify — Reminder Lambung Sehat

A small installable PWA (Progressive Web App) that reminds you to eat small
frequent meals, drink water, take stomach medication, and avoid lying down
right after eating — aimed at people managing gastritis/acid reflux (maag).
UI is in Indonesian.

## How it's built

- **Frontend**: a single static page (`index.html`) + `manifest.json` +
  `sw.js` (service worker). No build step, no framework — plain HTML/CSS/JS.
  Schedule and daily checklist progress are stored in `localStorage`.
- **Backend** (`worker/`): a Cloudflare Worker that sends real **push
  notifications** on a schedule, so reminders arrive even when the app is
  fully closed. It runs on a cron trigger every minute, compares the current
  time (WIB) against your saved schedule, and sends a Web Push notification
  for anything due right now.

Without the worker, notifications would only fire while the tab/app is open
in the foreground — that's a real limitation of browser JS, not something
config can fix. The worker is what makes it work in the background.

## Running the frontend

It's fully static, so any static host works. Simplest option — GitHub Pages:

1. Repo Settings → Pages → Source: **Deploy from a branch** → `main` / `/ (root)`.
2. Visit the published URL, then "Add to Home Screen" on your phone to
   install it as an app.

For local testing: `python3 -m http.server 8123` from the repo root, then
open `http://localhost:8123`.

## Deploying/updating the push backend

The worker is already deployed at `https://aslam-notify-push.erwinwahyura.workers.dev`
and wired into `index.html` (`WORKER_URL`, `APP_TOKEN`, `VAPID_PUBLIC_KEY`
constants near the top of the `<script>`). You only need the steps below if
you're redeploying from scratch or rotating keys.

```bash
cd worker
npm install
npx wrangler login                      # one-time Cloudflare auth
npx wrangler kv namespace create STORE  # copy the returned id into wrangler.toml
npx wrangler secret put VAPID_SERVER_PRIVATE_KEY
npx wrangler secret put APP_TOKEN
npx wrangler deploy
```

`VAPID_SERVER_PUBLIC_KEY` and `VAPID_SUBJECT` are plain (non-secret) vars
already committed in `wrangler.toml`. If you regenerate the VAPID keypair,
update `VAPID_PUBLIC_KEY` in `index.html` to match the new public key, and
`VAPID_SERVER_PUBLIC_KEY` in `wrangler.toml` — client and server must use the
same keypair or push subscriptions will fail.

`APP_TOKEN` is a shared secret so only this app's frontend can write to your
KV store (subscription + schedule) — it must match between the Worker secret
and the `APP_TOKEN` constant in `index.html`.

### How the worker decides what to send

`worker/src/index.js` rebuilds the same schedule the frontend shows (meal
times, water every N hours, meds times, "don't lie down" 2h after meals) from
the settings you last saved, and pushes a notification for anything matching
the current minute in WIB (fixed UTC+7 — Indonesia has no DST). Storage is a
single KV entry each for `settings` and `subscription`, since this is built
for one person on one device.

## Disclaimer

This app is a reminder tool only, not medical advice. Medication timing
should follow your doctor's/pharmacist's instructions.
