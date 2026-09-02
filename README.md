# aslam-notify — Reminder Lambung Sehat

A small installable PWA (Progressive Web App) that reminds you to eat small
frequent meals, drink water, take stomach medication, and avoid lying down
right after eating — aimed at people managing gastritis/acid reflux (maag).
UI is in Indonesian.

## How it's built

- **Frontend** (`public/`): a single static page (`index.html`) +
  `manifest.json` + `sw.js` (service worker). No build step, no framework —
  plain HTML/CSS/JS. Schedule and daily checklist progress are stored in
  `localStorage`.
- **Backend** (`worker/`): a Cloudflare Worker that sends real **push
  notifications** on a schedule, so reminders arrive even when the app is
  fully closed. It runs on a cron trigger every minute, compares the current
  time (WIB) against your saved schedule, and sends a Web Push notification
  for anything due right now.

Without the worker, notifications would only fire while the tab/app is open
in the foreground — that's a real limitation of browser JS, not something
config can fix. The worker is what makes it work in the background.

## Running the frontend

It's fully static, so any static host works. It's deployed on **Cloudflare
Pages** (project `aslam-notify`), served straight from `public/`:

```bash
npx wrangler pages deploy public --project-name=aslam-notify
```

Run that after any change under `public/` to push a new version live. (This
is a manual/direct-upload deploy, not auto-deploy-on-push — connecting the
Pages project to Git for that requires a one-time GitHub authorization click
in the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to
Git**.)

For local testing: `python3 -m http.server 8123` from `public/`, then open
`http://localhost:8123`.

## Deploying/updating the push backend

The worker is already deployed at `https://aslam-notify-push.erwinwahyura.workers.dev`
and wired into `public/index.html` (`WORKER_URL`, `APP_TOKEN`,
`VAPID_PUBLIC_KEY` constants near the top of the `<script>`). Pushing to
`main` auto-redeploys it via `.github/workflows/deploy-worker.yml` (needs a
`CLOUDFLARE_API_TOKEN` repo secret). You only need the manual steps below if
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
update `VAPID_PUBLIC_KEY` in `public/index.html` to match the new public key,
and `VAPID_SERVER_PUBLIC_KEY` in `wrangler.toml` — client and server must use
the same keypair or push subscriptions will fail.

`APP_TOKEN` is a shared secret so only this app's frontend can write to your
KV store (subscription + schedule) — it must match between the Worker secret
and the `APP_TOKEN` constant in `public/index.html`.

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
