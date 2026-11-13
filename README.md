# firwarn

A Yanosik-style **live traffic report app** for the BeamNG.drive **East Coast, USA** map (Firwood, Maine).

Drop your crosshair on the map, say what you spotted, and it goes **live for everyone** — other
visitors see the marker pop up and can hit **Accept ✓** or **Not ✗** to confirm it.

## Features

- **Live shared reports** — backed by [MantleDB](https://mantledb.sh) (no auth, no server of our own).
  Reports sync to every open tab within seconds; votes are shared too.
- **Crosshair positioning** — the pointer only moves when you click the map, never follows the cursor.
  Click → *Confirm position* → report sheet.
- **Three report tabs**
  - **Warnings** — car crash, stopped car
  - **Police** — police control
  - **Unmarked** — ETK / Gavril / Bruckell / Other (gray brand badges, dark car icon for Other)
- **Username gate** — first visit asks for a username; later visits offer your previous names
  in the top-bar menu (and in the gate) for one-tap switching.
- **Accept / Not voting** — every report shows live ✓/✗ counts, from the feed list or the marker popup.
- **Map** — drag to pan, wheel / pinch / `+ −` / double-click to zoom (deep zoom), place search.
- **Feed panel** — the live list of everything currently reported.

## Files

| File | Purpose |
|---|---|
| `index.html` | page structure, inline SVG symbols |
| `style.css` | styling |
| `app.js` | map engine, crosshair, username gate, live sync + voting |
| `map.png` | East Coast, USA map |
| `icons/*.png` | tab + option icons (`warningtab`, `unmarkedtab`, `crash`, `stopped`, `police`) |

## Run locally

```bash
npx serve .        # or any static server
# open http://localhost:3000
```

## Deploy on GitHub Pages

1. Push this folder to a GitHub repository.
2. Repo → **Settings → Pages → Build and deployment → Branch: `main` / `/ (root)` → Save**.
3. Site appears at `https://<you>.github.io/<repo>/`.

The live feed is already hosted — no backend or environment variables needed.

## Notes

- Fan project. Not affiliated with BeamNG or Yanosik.
- Free-tier limits of the feed: 100 entries, 64 KB per entry, 10k requests/day, reports expire
  after 24 h, namespaces idle for 30 days are purged (any report re-activates it).
