# Every day is Jueves

A front-end-only, static site that turns today's top headlines into satirical **caricature** images.

Pipeline (all in the browser): **Google News (RSS)** → **rss2json** (JSON with CORS) → **Pollinations.ai** (text + image).  
No backend. Host it on **GitHub Pages**.

## Live UX
- Pick an **edition** (country/locale), or keep the default (España).
- Click **Obtener Top 5**.
- The app fetches the top 5 headlines, **summarizes** each with Pollinations (text), and **generates** an exaggerated caricature image per story using Pollinations (image).

## Tech

- **Vanilla HTML/CSS/JS** (no bundlers, no secrets).
- **Google News RSS** (per-country editions via `hl`, `gl`, `ceid`).
- **rss2json** — public endpoint with CORS to turn RSS → JSON.
- **Pollinations.ai** — keyless text + image endpoints.

> ⚠️ This is a demo/prototype and depends on third‑party free services. Expect rate limits and occasional slowness.

## Local development

Just open `index.html` in a modern browser. (If you run a static server, any will do.)

## Deploy to GitHub Pages

1. Create a **new GitHub repo** (e.g., `every-day-is-jueves`).
2. Upload the four files at the repo root:
   - `index.html`
   - `styles.css`
   - `main.js`
   - `assets/jueves-logo.svg`
3. Commit & push.
4. In GitHub:
   - Go to **Settings → Pages**.
   - **Build and deployment**: Source = **Deploy from a branch**.
   - Branch = `main`, Folder = `/ (root)`. Save.
5. Your site will be published under `https://<your-username>.github.io/every-day-is-jueves/` in a minute or two.

### Deploy from VS Code (optional)
- Use the **GitHub Desktop** or `git` CLI:
  ```bash
  git init
  git add .
  git commit -m "Every day is Jueves: initial commit"
  git branch -M main
  git remote add origin https://github.com/<you>/every-day-is-jueves.git
  git push -u origin main
  ```

## Customize

- **Default edition**: change the last line in `main.js` (call to `loadTopNews`).
- **Countries**: edit the `EDITIONS` array in `main.js` to add/remove locales.
- **Art style**: tweak `buildCaricaturePrompt` to steer the image look.
- **Branding/logo**: replace `assets/jueves-logo.svg` and CSS colors to your taste.

## Notes & limits

- **CORS/keyless**: All endpoints used are public and CORS-friendly at time of writing. If any provider changes policy, you might need a tiny proxy (e.g., Cloudflare Worker).
- **Attribution**: This is a satirical art project. Always cite original articles; the UI links to sources per card.
- **Safety**: Prompts avoid names/logos and request “no text” to reduce risks in caricatures.

— Enjoy!
