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

Copy the entire `web/` folder to your unit's intranet web server (IIS, Apache, nginx, SharePoint).

Users visit: `https://your-unit-server.mil/yougotfirewatch/`

**Zero external network calls.** Everything loads from your server.

### Option B: GitHub Pages

Users visit: `https://josiahstemen.github.io/YouGotFirewatch/`

### Option C: Local testing

```bash
cd web
python -m http.server 8080
```

Then open `http://localhost:8080`

## What's Included

### Main Duty Roster
- Personnel management (CRUD, CSV import/export, JSON backup)
- Interactive calendar editor with bulk date-range tools
- Two-phase roster generation algorithm
- Supernumerary assignment with validation
- Roster history
- Settings (cooldown, baselines, half-split, unit name)
- Personnel Backup CSV — import before generating, auto-export after finalize
- CSV export + Print/PDF (via browser print dialog)

### ADNCO Student Rosters (new)
A **separate tab** for Academic and MAT student ADNCO duty — independent from the main fire watch roster.

**Duty windows (hard rules):**
- **MAT** — Sunday 1630 through Friday 1630
- **Academic** — Friday 1630 through Sunday 1630 (no duty the night before a class day)

**Personnel fields for students:**
- `phoneNumber`, `studentType` (Academic or MAT), `lastName`, `firstName`
- CSV columns: `rank, lastName, firstName, phoneNumber, studentType, points, lastDutyDate, nonAvailability`

**Simple non-availability (for junior Marines):**

Use **only day numbers** for the month — no calendars, no full dates.

| You type | Meaning |
|----------|---------|
| `5, 12, 15` | Cannot stand duty on the 5th, 12th, and 15th |
| `3-7, 12-14` | Cannot stand duty the 3rd–7th and 12th–14th |
| `10-12, 18, 25-27` | Multiple ranges |

**How Marines update availability:**
1. Open the **ADNCO Student Rosters** tab
2. In **Quick Availability Update**, select your name
3. Type day numbers in the big text box (example: `5, 12-14, 20-22`)
4. Click **Update My Availability**

**Generating an ADNCO roster:**
1. Add/import students with `studentType` set to Academic or MAT
2. Open **ADNCO Student Rosters**, pick month/year
3. Click **Generate ADNCO Roster**
4. Review assignments (phone numbers shown prominently)
5. **Finalize** — saved separately from main duty history; opens a printable roster

Import students via **Import Students** (CSV template available) or the shared Personnel tab.

## Data & Security

- All data stays in the browser (localStorage)
- No data sent to any server
- No external CDN or API calls
- Suitable for unclassified duty scheduling on NIPR when hosted on an approved server

## Project Structure

```
web/
├── index.html
├── css/style.css
└── js/
    ├── app.js                 # Main UI
    ├── rosterGenerator.js     # Main duty two-phase algorithm
    ├── adncoRoster.js         # ADNCO slot generation & assignment
    ├── adncoTab.js            # ADNCO UI
    ├── adncoExport.js         # ADNCO print/CSV export
    ├── studentImport.js       # ADNCO student CSV import
    ├── personnelUtils.js      # Name/field helpers
    ├── dayNumberAvailability.js  # Simple day-number NA parser
    ├── personnelBackup.js     # Shared personnel CSV
    ├── nonAvailability.js     # Month-relative NA (main + ADNCO)
    ├── dateUtils.js
    ├── holidays.js
    ├── storage.js
    ├── sampleData.js
    └── export.js
```