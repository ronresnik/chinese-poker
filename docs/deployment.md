# Deploying to GitHub Pages

Two ways to get the built SPA live: an automatic GitHub Actions workflow
(recommended — this is what `.github/workflows/deploy.yml` already sets
up) or a manual one-off push with the `gh-pages` package. Either way, the
Firebase **rules** (Firestore + Realtime Database) are deployed separately
via the Firebase CLI — see "Firebase schema & security rules" in the
main README — GitHub Pages only ever hosts the static frontend.

## One-time setup

### 1. Point the app at your Firebase project

If you haven't already (see the main README's "Local development"
section): create a Firebase project, enable **Authentication -> Anonymous
sign-in**, **Firestore Database**, and **Realtime Database**, then grab
the web app config from Project Settings -> General -> Your apps.

### 2. Add the Firebase config as repository secrets

These values aren't secret by design (see `docs/firebase-schema.md`) —
but they still need to come from *your* Firebase project, so the build
reads them from GitHub repository secrets rather than a committed file.

Go to **Settings -> Secrets and variables -> Actions -> New repository
secret** and add each of these, matching the names the config object uses
(`VITE_FIREBASE_API_KEY`, etc.) exactly:

| Secret name                         | Value                                          |
| ------------------------------------ | ----------------------------------------------- |
| `VITE_FIREBASE_API_KEY`              | `apiKey`                                        |
| `VITE_FIREBASE_AUTH_DOMAIN`          | `authDomain`                                    |
| `VITE_FIREBASE_PROJECT_ID`           | `projectId`                                     |
| `VITE_FIREBASE_STORAGE_BUCKET`       | `storageBucket`                                 |
| `VITE_FIREBASE_MESSAGING_SENDER_ID`  | `messagingSenderId`                             |
| `VITE_FIREBASE_APP_ID`               | `appId`                                         |
| `VITE_FIREBASE_DATABASE_URL`         | `databaseURL`                                   |

(Same 7 values as `.env.example` / your local `.env.local` — just entered
as repo secrets instead of a local file, since GitHub Actions has no
access to your machine's `.env.local`.)

### 3. Turn on GitHub Pages, pointed at Actions

**Settings -> Pages -> Build and deployment -> Source: "GitHub Actions"**.
That's it — no branch to pick, the workflow below handles publishing.

### 4. Confirm the base path matches your repo name

`vite.config.js` sets `base: '/chinese-poker/'` so built asset URLs resolve
correctly once served from `https://<you>.github.io/chinese-poker/`. If
you ever rename the repository, update that `base` value (and the
`index.html` favicon link, which references the same path) to match.

## Automatic deploys (recommended)

Once the steps above are done, **every push to `main`** (including a
merged PR) triggers `.github/workflows/deploy.yml`, which:

1. Installs dependencies and runs `npm test` (the `src/game/` suite) —
   a failing test blocks the deploy.
2. Runs `npm run build` with the Firebase secrets injected as env vars.
3. Publishes `dist/` via `actions/deploy-pages` — no personal access
   token needed; the workflow authenticates with a short-lived token
   GitHub issues it for exactly this purpose.

Watch it run under the repo's **Actions** tab. The live URL is:

```
https://<your-github-username>.github.io/chinese-poker/
```

(also shown on the **Settings -> Pages** screen, and as the deployment
URL on each successful workflow run).

You can also trigger it manually — **Actions -> Deploy to GitHub Pages ->
Run workflow** — without needing a new commit, thanks to the
`workflow_dispatch` trigger.

## Manual deploy (alternative)

If you'd rather not use Actions, `package.json` already has a script
using the `gh-pages` package:

```bash
cp .env.example .env.local   # fill in your Firebase config, if not already done
npm run deploy                # builds, then pushes dist/ to the gh-pages branch
```

This pushes a `gh-pages` branch to the repo. If you use this method
instead of the Actions workflow, set **Settings -> Pages -> Source** to
"Deploy from a branch" -> `gh-pages` / `/ (root)` instead of "GitHub
Actions". Don't mix both methods on the same repo at once — pick one
Pages source.

## Troubleshooting

- **Blank page / assets 404 after deploy** — almost always a `base`
  mismatch (see step 4 above), or the Pages source pointing at the wrong
  place (branch vs. Actions — see "Manual deploy" note above).
- **App loads but Firebase calls fail** — a secret name typo, or a secret
  that was added *after* the workflow already ran once (re-run it from
  the Actions tab; secrets are only read at build time).
- **Deep links (e.g. bookmarking `/online/abc123`) 404** — shouldn't
  happen: the app uses `HashRouter` (`#/online/abc123`), and GitHub Pages
  only ever needs to serve the single `index.html` at the root, regardless
  of what follows the `#`. If you see 404s on a route, check that a
  `BrowserRouter` didn't get swapped in by mistake (see `src/main.jsx`).
