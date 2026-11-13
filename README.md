# Yanobeam — Firwood road reports

A Yanosik-style traffic report app for the **BeamNG.drive East Coast, USA** map (Firwood, Maine).
Drop a pin on the map, confirm the position, pick what you spotted — it becomes a marker everyone can see.

## Features

- **Zoom & pan** — mouse wheel, pinch, drag, `+` / `−` buttons, double-click to zoom
- **Pin → confirm → report** — tap the red button, tap the map, press *Confirm position*, choose a report type
- **Warnings tab** — car crash, stopped car
- **Police tab** — police control, undercover (with ETK / BRKL / GVRL / Others picker)
- **Report markers** — click a marker to confirm "Still there" or remove your own
- **Search** — jump to Firwood places (dock, sawmill, main street…)
- **Live touches** — online counter, nearby-report count, trust points, localStorage persistence

## Files

| File | Purpose |
|---|---|
| `index.html` | page structure + inline SVG icons |
| `style.css` | styling |
| `app.js` | map engine (pan/zoom/pin/report logic) |
| `map.png` | **you provide this** — top-down East Coast, USA map (falls back to a placeholder if missing) |

## Run locally

```bash
python -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly from disk also works.)

## Deploy on GitHub Pages

1. Push this folder to a GitHub repository.
2. Repo → **Settings → Pages → Build and deployment → Branch: `main` / `/ (root)` → Save**.
3. The site appears at `https://<your-username>.github.io/<repo>/`.

## Notes

- Fan project. Not affiliated with BeamNG or Yanosik.
- Reports are stored per-visitor in `localStorage` (no backend). Sharing reports between visitors needs a small API.
