# Nova — website

A fast, hand-built static site for **Nova** — a solo web design & AI short-form video studio in Rolleston, Selwyn, New Zealand.

Pure **HTML + CSS + vanilla JS**. No framework, no build step, no npm. It deploys as-is to Cloudflare Pages or Netlify from a GitHub repo.

---

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Homepage — hero + "The Split" load sequence, the dual-accent fork, why-Nova, selected work, CTA |
| `websites.html` | Websites service — process, pricing, portfolio, FAQ |
| `videos.html` | Short-form video service — phone-frame showcase, formats, packs/retainers, FAQ |
| `about.html` | About Nova / the founder |
| `contact.html` | Contact — form + email + phone + Calendly |
| `404.html` | On-brand "signal lost" page |

## File structure

```
Nova/
├── index.html
├── websites.html
├── videos.html
├── about.html
├── contact.html
├── 404.html
├── css/
│   └── style.css        ← all styles; edit the BRAND TOKENS block at the top
├── js/
│   └── main.js          ← nav, hero sequence, scroll reveals, footer year
├── assets/
│   ├── favicon.svg      ← the Nova mark (already made)
│   ├── og-image.jpg     ← ADD THIS (1200×630 social share image)
│   ├── images/          ← ADD portfolio screenshots here
│   └── videos/          ← ADD 9:16 .mp4 files here
└── README.md
```

---

## Run locally

It's static, so any local server works. Easiest options:

```bash
# Python 3 (built in on macOS/Linux, installable on Windows)
python -m http.server 8000
# then open http://localhost:8000

# or Node
npx serve .

# or VS Code: right-click index.html → "Open with Live Server"
```

You can also just double-click `index.html`, but a local server is recommended so relative paths and the contact form behave exactly like production.

---

## Deploy

### Cloudflare Pages
1. Push this folder to a new GitHub repo.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build settings: **Framework preset = None**, **Build command = (leave empty)**, **Build output directory = `/`**.
4. Deploy. `404.html` is served automatically for unknown routes.

### Netlify
1. Push to GitHub, then **Add new site → Import from Git** (or drag-and-drop the folder into the Netlify dashboard).
2. Build command: none. Publish directory: `/` (the repo root).
3. `404.html` is used automatically. If you use Netlify Forms, see the form note below.

---

## Editing the brand

Open `css/style.css` — everything you'd want to tweak lives in the **`:root` "BRAND TOKENS"** block at the very top, in plain English:

- **Colours** — `--void`, `--nebula`, `--ion` (websites accent), `--flare` (videos accent), `--bridge`, text colours.
- **Fonts** — `--font-display`, `--font-body`, `--font-mono` (loaded via `<link>` tags in each page `<head>`).
- **Spacing / shape** — container width, section spacing, corner radius.

Change a value there and it updates across all six pages.

---

## Swapping in your real content

### Portfolio images (websites & homepage)
Each portfolio card uses a styled placeholder. To use a real screenshot, add an inline background image to the card's `.work-card__thumb`:

```html
<div class="work-card__thumb" style="background-image:url('assets/images/smoke-rolleston.jpg')">
```

Put the image files in `assets/images/`. Recommended size ~1200×750 (16:10).

### Portfolio videos (videos page)
Each phone frame contains a ready `<video>` element. Add a `<source>` inside it:

```html
<video class="phone__video" autoplay muted loop playsinline>
  <source src="assets/videos/fuller.mp4" type="video/mp4">
</video>
```

Put `.mp4` files in `assets/videos/`. Use **vertical 9:16**, muted, short loops, and keep them compressed (a few MB each) for fast loading.

### Making cards link to live sites
Portfolio cards currently link to `contact.html` (web) / stay on page (video). To point one at a live project, change the `href` on its `.work-card__link`:

```html
<a class="work-card__link" href="https://smokerolleston.co.nz" target="_blank" rel="noopener">
```

---

## Contact form setup

The form on `contact.html` is backend-free. Pick one (instructions are also in an HTML comment right above the form):

- **Formspree (default):** create a form at [formspree.io](https://formspree.io) and replace `your-form-id` in the form's `action` URL.
- **Netlify Forms:** add `netlify` to the `<form>` tag, add `<input type="hidden" name="form-name" value="contact">`, and remove the Formspree action.
- **No backend:** replace the form with a `mailto:` button.

---

## ✅ Placeholders to replace

Search the project for each and swap in your real details.

**Contact details** (appear in the footer of every page + `contact.html`):
- [x] Email — real (`Kaushikstunz2309@gmail.com`)
- [x] Phone — set to 029 020 56974 (`tel:+642902056974`) — **verify the number before deploy** (also flagged in HTML comments)
- [ ] `https://calendly.com/nova` → your real booking link (or remove that method)

**Form:**
- [ ] `your-form-id` in `contact.html` → your Formspree ID (or switch to Netlify — see above)

**Pricing:**
- [ ] `websites.html` — build price **NZ$1,500** and care plan **NZ$80/month** (confirmed real, edit if they change)
- [ ] `videos.html` — pack/retainer prices (**NZ$490 / NZ$1,200 / NZ$900/mo**) are **indicative placeholders** — set your real numbers

**Media:**
- [ ] `assets/og-image.jpg` → add a 1200×630 social share image (referenced by every page's Open Graph tags)
- [ ] `assets/images/…` → portfolio screenshots (Smoke Rolleston, Fuller Food Co., ManukaRx, Sweet Fuel)
- [ ] `assets/videos/…` → 9:16 video files for the three phone frames on `videos.html`
- [ ] `about.html` — the portrait placeholder block (`.visual-block`) → add a photo of yourself

**Copy to review (written as a strong starting point — make it yours):**
- [ ] Portfolio descriptions and tags on `websites.html` / `videos.html` / `index.html`
- [ ] About story on `about.html`
- [ ] FAQ answers on `websites.html` and `videos.html`

**Domain / SEO (optional polish):**
- [ ] Add a canonical `<link rel="canonical">` per page once your domain is live
- [ ] Update `og:image` paths if you rename the share image

---

## Notes

- **Signature moment:** the homepage hero is "the orrery" — Nova as the central star with both services orbiting it on glowing rings (hover or focus a body to pause its orbit; each links to its page). It runs a one-time "ignite → wordmark → rings → orbits → fork" load sequence, and hovering a fork panel still shifts the page's ambient glow toward that service's accent.
- **Motto:** "Your business, at full brightness." (hero + every footer).
- **Accessibility & motion:** all non-essential animation is disabled under `prefers-reduced-motion`, there's a skip-to-content link, visible keyboard focus, and semantic headings throughout.
- **Fonts:** Clash Display + Satoshi + Zodiak (via Fontshare) and JetBrains Mono (via Google Fonts), all loaded with `font-display: swap` and preconnect. Zodiak supplies the serif-italic emphasis words inside headlines — wrap a word in `<em>` inside any heading to get the effect.
- **Space backdrop (home hero):** real Hubble eXtreme Deep Field astrophotography in `assets/space/` (`xdf.webp` ~152KB + `xdf.jpg` fallback). Public domain — NASA/ESA/HUDF09 team, NASA ID `GSFC_20171208_Archive_e001651`. Two sparse procedural star layers drift above it at subliminal speed; all motion stops under `prefers-reduced-motion`.
- **Neon accents:** the three brand accents are the neon system — ion `#45E1FF` (primary), flare `#FF63AE` (secondary), bridge `#7C4DFF` (tertiary/CTAs) — with glow shadow tokens (`--glow-ion` etc.) in the same `:root` block. Adjust hue/intensity there; everything re-points.
