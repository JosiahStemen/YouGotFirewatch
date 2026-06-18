# YouGotFireWatch — Browser Edition

**No Node.js. No npm. No downloads.** Just open a URL in your browser.

This is a fully self-contained web app. All code, styles, and logic are plain HTML/CSS/JavaScript files — no external CDNs, no build step, no dependencies to install.

## For Users (NIPR / Any Computer)

1. Your unit hosts YouGotFireWatch on a web server (see hosting options below)
2. You open the URL in Edge or Chrome — e.g. `https://your-server.mil/yougotfirewatch/`
3. That's it. No installs, no plugins, no admin rights needed

All data is stored in your browser's localStorage on that machine. Use **Export JSON** in Settings to back up.

## For Admins — Hosting Options

### Option A: Unit Web Server (Best for NIPR)

Copy the entire `web/` folder to your unit's intranet web server (IIS, Apache, nginx, SharePoint):

```
web/
├── index.html
├── css/style.css
└── js/
    ├── app.js
    ├── rosterGenerator.js
    ├── dateUtils.js
    ├── holidays.js
    ├── storage.js
    ├── sampleData.js
    └── export.js
```

Users visit: `https://your-unit-server.mil/yougotfirewatch/`

**Zero external network calls.** Everything loads from your server.

### Option B: GitHub Pages (If accessible from NIPR)

1. Create a GitHub repo
2. Upload only the `web/` folder contents to the repo root (or set GitHub Pages source to `/web`)
3. Enable GitHub Pages in repo Settings
4. Users visit: `https://yourusername.github.io/yougotfirewatch/`

### Option C: DOD SAFE / Approved Cloud

Upload the `web/` folder to any approved static hosting service.

## Local Testing (No Server Needed)

If your browser allows ES modules from `file://`, you can double-click `index.html`. If that doesn't work (most browsers block it), use Python:

```bash
cd web
python -m http.server 8080
```

Then open `http://localhost:8080`

## What's Included

- Personnel management (CRUD, CSV import, JSON backup)
- Interactive calendar editor with bulk date-range tools
- Two-phase roster generation algorithm
- Supernumerary assignment with validation
- Roster history
- Settings (cooldown, baselines, half-split, unit name)
- **Personnel Backup CSV** — import before generating, auto-export after finalize
- CSV export + Print/PDF (via browser print dialog)
- Sample data on first load
- "How YouGotFireWatch Works" help modal

## Data & Security

- All data stays in the browser (localStorage)
- No data sent to any server
- No external CDN or API calls
- Suitable for unclassified duty scheduling on NIPR when hosted on an approved server

## Relationship to `/src` Version

The `web/` folder is a standalone port of the React app in `/src`. Same algorithm, same features. The React version requires Node.js to build; this version does not.