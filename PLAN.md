# Plan: "Home Library" — Personal Library Desktop App (offline, Windows)

## The short version
- **What it is:** an app on your PC called **Home Library**. Double-click it and it opens with a big animated **"Home Library"** title, then goes to your library.
- **How you add books:** type a book's name, author or ISBN. The app searches Open Library and Google Books (this step needs internet), shows you everything about the book, and you click **Add**.
- **What gets saved:** *everything* about the book is copied onto your PC. That includes:
  - title and authors
  - description and genres
  - publisher, year, pages and ISBN
  - the cover picture
  - your own notes, rating, review and quotes
- **After that, no internet is needed** to see, browse, search or edit your books.
- **Your shelves:** Own, Read, Currently reading (with a **Partly read** section under it), To-read pile, Want to buy.
- **No barcode scanner:** removed. You add books by searching.
- **Database:** **PostgreSQL 17**, which is already installed on your PC and runs in the background. You can see and edit all your books in **pgAdmin 4**. Setup and reconnect steps are in §1.

## Context
You want a personal library app you can double-click to open on your Windows 10 PC. It must work with no internet, cover everything a real library system does for registering and maintaining a collection, and look beautiful. Three research agents did deep dives on (1) features and data, (2) visual design and UX, and (3) technical architecture. This plan brings their findings together. The project folder `C:\Users\user\Desktop\Personal Project` is currently empty.

### Your decisions so far
- **Scope:** your own books at home: your collection, reading tracking, and lending to friends and family.
- **Online search, offline app.** You search big catalogues (**Open Library + Google Books**) to find books and pull in every detail. All of it (metadata, cover, your notes) is **saved on your PC**, so browsing, notes and lists work with no internet. Only searching for *new* books needs a connection. If you're offline, adding a book falls back to a manual form.
- **Layout first, looks later.** v1 is built on a clean, neutral theme made entirely of design tokens (CSS variables). Once the screens feel right, you choose a style (Reading Room, Gallery or Dark Academia; see §5) and it is applied by changing the tokens, with no rewrite.
- **Personal shelves:** Own · Read · Currently reading › **Partly read** · To-read pile · Want to buy (plus DNF). A book can be in several, e.g. owned *and* in the to-read pile.
- **Partly read** sits under Currently reading. It holds books you've read half or most of but haven't finished. Each one shows how far you got (page X of Y and %, with a progress bar), the date you last read it, and an optional note such as "stopped at chapter 12". Books are sorted by most-read first, so the nearly-finished ones are at the top. There are one-click buttons to resume (back to Currently reading) or mark as read.
  - **How a book gets there:** you move it yourself, or the app suggests it when a "Currently reading" book hasn't had progress logged for 30 days (you can change the 30).
  - **How it differs from DNF:** DNF means you gave up on purpose. Partly read means you intend to come back.
- **No barcode scanning.** Removed from the plan for now. Search-to-add is the only way to add books, plus manual entry when offline.
- **Name:** **Home Library**, with an animated title screen on launch (see §5).
- **Database:** PostgreSQL 17 (local, `localhost:5432`), managed with pgAdmin 4 (see §1).

---

> **Update 2026-10-22: Lending has been removed** at your request. Everything below about borrowers, loans, overdue reminders and the Lending page no longer applies. Books are added mainly by searching online, and adding by hand is a small fallback.

## 1. Tech stack (recommended)
**Electron + Vite + React + TypeScript + PostgreSQL 17 (via `pg` / node-postgres)**
- Your PC already has everything needed: Node 20.19, npm 11, and git. Tauri would need Rust plus several GB of Visual Studio C++ tools first.
- The whole app uses one language (TypeScript), which is the easiest setup for a hobby project to maintain.
- It has the best offline printing (direct to a printer, plus PDF export), which you need for labels.
- Every library is bundled locally with no CDN. A strict content security policy (CSP) stops the interface from going online. The only internet access is the Discover search, which runs in the app's main process and can only reach Open Library and Google Books.
- Trade-off: about 100 MB installed, which doesn't matter for a personal app.

**Main libraries**

| Area | Libraries |
|---|---|
| Styling and components | Tailwind v4, shadcn/ui |
| Icons and fonts | Phosphor icons; @fontsource-variable (Fraunces, Inter, Literata) |
| Data and state | TanStack Query/Table/Virtual, Zustand, react-hook-form + zod |
| Charts | Recharts |
| Drag and drop | react-dropzone, @dnd-kit |
| Images and covers | `sharp` (cover thumbnails as WebP), `fast-average-color` (spine colours) |
| Labels (v2) | `bwip-js` (barcode/QR images printed on labels) |
| Utilities | `yazl`/`yauzl` (zip), `date-fns` |

### Database: PostgreSQL 17 + pgAdmin 4 (your choice)
**What's already on your PC** (checked):
- Service `postgresql-x64-17`: **Running**, starts automatically with Windows, port **5432**.
- Installed at `C:\Program Files\PostgreSQL\17\`, with pgAdmin 4 in the same folder.
- Because the service starts with Windows, the app can always connect to it with no internet needed.

**How the app connects:**
- Library: `pg` (node-postgres). It's pure JavaScript, so it needs nothing extra to compile.
- It connects to `localhost:5432` as a dedicated user `library_app`, using **your existing database `Home Library`** (already created in pgAdmin).
- The password is stored encrypted on your PC (Electron `safeStorage`, which uses Windows' own protection), not in plain text.
- **First-run setup screen:**
  1. Asks once for the `postgres` superuser password (the one you chose when you installed PostgreSQL).
  2. Creates the `library_app` user and gives it access to your existing `Home Library` database. Your database isn't recreated or wiped; the app only adds its own tables.
  3. Runs the table setup, tests the connection, and then never asks again.
- **If PostgreSQL isn't running** (rare), the app shows a friendly screen with a **"Start database"** button and a **"Retry"** button, instead of crashing.

**Forgot the `postgres` password?** It can be reset:
1. Edit `C:\Program Files\PostgreSQL\17\data\pg_hba.conf` and temporarily change `scram-sha-256` to `trust` on the `127.0.0.1` lines.
2. Restart the service.
3. Run `ALTER USER postgres PASSWORD '...'` in psql.
4. Change `trust` back to `scram-sha-256` and restart the service again.

I can walk you through this or do it with you.

**Reconnect pgAdmin 4** (to view your books):
1. Start menu → **pgAdmin 4**. Enter its master password, or reset it if you've forgotten it; this only clears the passwords pgAdmin has saved.
2. Left panel → **Servers**. If "PostgreSQL 17" is missing: right-click → *Register → Server*.
   - Name: `Local`
   - Host: `localhost`
   - Port: `5432`
   - User: `postgres`
   - Password: your postgres password
3. Expand **Databases → Home Library → Schemas → public → Tables**. Right-click a table (e.g. `edition`) → *View/Edit Data → All Rows*.

**Search inside your library:** PostgreSQL full-text search. Each book has a `search_vector` column (`tsvector`, weighted title > author > series > description/notes/tags), kept up to date by triggers and indexed with GIN. Typo-tolerant matching uses the `pg_trgm` extension (trigram similarity on title/author), which also drives duplicate detection. `unaccent` makes "Garcia Marquez" match "García Márquez".

**Database setup changes (migrations):** numbered `.sql` files, tracked in a `schema_migrations` table, each run inside a transaction. Data types: `uuid` primary keys, `timestamptz` for dates, `jsonb` for raw catalogue data and smart-shelf filters, `numeric(10,2)` for money.

**Where your other files live:** `%APPDATA%\HomeLibrary\`
- `covers\{id}\orig.webp` and `thumb.webp`: covers stay as files. The database stores the path, which keeps it small and fast.
- `backups\`: database dumps and cover archives.
- `config.json`: connection settings, with the password encrypted.

**Backups:**
- **Automatic:** on close and once a day, the app runs PostgreSQL's own `pg_dump.exe` (`C:\Program Files\PostgreSQL\17\bin\`) to create `home-library-YYYYMMDD-HHmm.dump`. It keeps the 10 most recent plus 8 weekly copies.
- **Restore:** done with `pg_restore` from Settings, which first makes a safety backup of the current data.
- **Full export:** a single `.zip` file containing the dump and the covers folder, so you can move everything to another PC.
- **Safety net:** a JSON export that doesn't depend on PostgreSQL at all.

## 2. Project structure
```
Personal Project/
  package.json, electron.vite.config.ts, electron-builder.yml
  build/icon.ico
  resources/            isbn-prefixes.json (offline seed)
  src/main/             Electron process: index.ts (window, CSP, single-instance, backup-on-quit)
    db/                 pool.ts (pg Pool), setup.ts (first-run create role/db), migrate.ts, migrations/*.sql, repos/*.ts
    services/           covers.ts, backup.ts, isbn.ts, print.ts, importers/*.ts
    ipc.ts              typed, zod-validated handlers
  src/preload/          contextBridge → window.api
  src/renderer/src/     app/, pages/, components/, hooks/, lib/ (isbn.ts, theme tokens)
  src/shared/           types + zod schemas
  tests/unit, tests/e2e
```

## 3. Data model (PostgreSQL, database `Home Library`)
This follows the real-library split: *edition* (what the book is) vs. *copy* (the physical item on your shelf).
- **Catalogue:** `edition` (title, subtitle, sort_title, isbn13 UNIQUE NULL, isbn10, publisher, pub date, edition statement, format, pages, language, description, cover paths, spine colour, call number, record_status owned/wishlist/stub), `person` + `edition_contributor` (with roles: author, translator, illustrator, editor…), `publisher`, `series` + `edition_series` (number REAL), `genre` (nested), `tag`, `subject`, plus junction tables.
- **Copies:** `copy` (accession no. like `HL-000123`, location, status available/on_loan/lost/sold/given_away, acquired date/source/price, value, condition, dust jacket, signed/first edition/limited no., notes, last verified), `location` (tree: room › bookcase › shelf), `condition_log`, `repair_log`, `disposal`.
- **Reading:** `reading_status` (want / reading / **partly_read** / read / dnf; plus `paused_at` and `paused_note`), `reading_session` (multiple reads, rating, review, DNF), `progress_entry`, `quote`, `reading_goal`.
- **Lending:** `borrower`, `loan` (direction out/in, due date, returned date, renewals, condition out/in).
- **Wishlist:** `wish_item` (priority, target price, store, gift-idea flag).
- **Organisation:** `collection` (manual list or smart shelf via filter_json), `collection_item`, `custom_field`/`custom_value`.
- **System:** `audit_log`, `import_job`, `audit_session`/`audit_check` (shelf stocktake), `setting`, `metadata_cache` (jsonb), and `schema_migrations`.
- **Search:** a `search_vector tsvector` column on `edition` with a GIN index, plus `pg_trgm` GIN indexes on title and author names.

Every table has `created_at`, `updated_at`, and `deleted_at` (which powers the Trash). Money is stored as `numeric(10,2)`.

## 4. Features by release

### v1 (MVP): search, add, and make it yours
1. **Discover (search online catalogues):** one search box for title, author or ISBN. It queries Open Library and Google Books in parallel (from the main process, 5 s timeout) and merges and de-duplicates the results by ISBN or work.
   - **Results:** cover, title, author, year, editions count, and an "already in your library" badge.
   - **Full book preview page** (before adding), showing everything known:
     - **Book:** title/subtitle, all authors and roles, description, subjects/genres, series.
     - **Edition:** publisher, publish date, pages, language, ISBN-10/13, format, an editions list so you can pick *your* edition, and large cover.
     - **Extras:** author bio and photo, Google average rating/count, first published year, links.
   - **Add actions:** "Add to Own", "To-read pile" or "Want to buy". This saves *all* metadata locally, downloads the cover (and author photo), and opens a "Make it yours" panel.
   - **What is registered on add (all stored offline):**
     - **The book:** title, subtitle, every author (with role: author, translator, illustrator…), publisher, publish date, first-published year, edition, pages, language, ISBN-10 and ISBN-13, format, description, genres/subjects, series and number.
     - **Pictures:** the cover image file and the author photo file.
     - **About the author:** bio and birth/death dates.
     - **Online ratings:** average rating and rating count.
     - **Raw data:** the full raw catalogue data, kept as a safety net.
   - **Caching:** results are cached in `metadata_cache`. Raw API JSON is stored per book, so new fields can be extracted later without going back online.
   - **Offline behaviour:** an online/offline indicator is shown. When offline, Discover shows "You're offline — add manually" with a form prefilled from what you typed.
2. **Make it yours (personal details):**
   - **Your copy:** location, format of your copy, purchase date/place/price, condition, signed/first edition, gift from…
   - **Your reading:** shelves/status, rating (½ stars), review/thoughts, favourite quotes, private notes, start/finish dates, tags.
3. **Manual add/edit** for books not found online (only the title is required), and **duplicate detection** by ISBN or fuzzy title+author ("add another copy" / "different edition" / cancel).
   - API client modules: `src/main/services/catalog/openLibrary.ts`, `googleBooks.ts`, and `merge.ts` (field priority: Open Library for editions/subjects, Google for description/rating, longest description wins).
4. **Covers:** drag/drop, paste, or file picker. Books without a cover get a **generated cover** (SVG built from title/author, in 3 layouts).
5. **Library views:** **Grid**, **List/table**, and **3D Shelf**. Search-as-you-type using PostgreSQL full-text search + trigram, filter chips, sorting, and grouping.
6. **Book detail page:** a backdrop tinted with the cover colour, tabs for About / Notes / Reading log / Loans, and previous/next arrows.
7. **Locations:** a room › bookcase › shelf tree; each copy can sit in one.
8. **Reading:** status, dates, ratings (half stars), and review/notes. Log progress (page or %) from the book page or dashboard.
   - **Partly read** section under Currently reading: progress bar, last-read date, a "where I stopped" note, sorted by % read, with **Resume** and **Mark as read** buttons.
9. **Lending:** borrowers, lend/return, due dates, overdue badge, and history.
10. **Wishlist:** with a "Got it!" button that moves the book into your library.
11. **Dashboard:** currently reading, then a **Partly read** row below it ("Pick up where you left off"), recently added, stat tiles, and overdue alerts.
12. **Basic stats:** counts by format/genre/location, books read per year, total spent.
13. **Data safety:** Trash with restore, and undo toasts. Automatic rotating `pg_dump` backups on close and daily (keeps 10 recent + 8 weekly). Manual backup and restore, plus a zip export.
14. **Import/export:** CSV and JSON export; CSV import with column mapping, plus a Goodreads preset.
15. **Settings:** neutral theme with light/dark modes, Ctrl+K command palette, keyboard shortcuts.
16. **Pick your style (end of v1):** a Settings preview that switches between the 3 aesthetic presets live, so you can decide once the layout is done.

17. **Opening animation:** a splash screen with **"Home Library"** in large serif letters.
    - The letters fade and rise in one by one (about 1.5 s), then a thin gold line draws underneath, then it fades into the app.
    - Click or any key skips it, and it's shortened if reduced motion is on.
    - It is shown while the database loads, so it doesn't add any waiting time.

### v2: library-grade upkeep
- **Refresh details:** a "refresh details from online" button per book, plus a batch refresh.
- **Richer reading tracking:** multiple reads, a progress log, quotes, reading goals, a streak heatmap, and a year-in-review page.
- **Smart shelves and collections:** saved filters, manual lists, and series pages that show which numbers you're missing.
- **Shelf audit / stocktake mode:** reports missing and misplaced books.
- **Upkeep:** condition and repair log, weeding/donation workflow, duplicate finder + merge, a data-quality dashboard, bulk edit, and merge/rename for authors, tags and series.
- **Labels and printing:** spine, barcode/QR, and bookplate labels on Avery-style templates with preview and a start offset. Catalogue PDF and an insurance report.
- **Classification:** call numbers (Dewey or custom rules like `FIC PRA`).
- **More imports and lending:** Libib, Calibre, LibraryThing and StoryGraph imports. Track books you've borrowed from others. Windows toast reminders for overdue loans.
- **More themes:** Gallery and Dark Academia.

### Nice to have
Work-level grouping across editions, author aliases, custom fields, attachments (receipts, photos of signatures), holds queue, multiple owners, price-tracking history, StoryGraph-style mood/pace tags, links to ebook files, encrypted backups.

## 5. Look and feel (you'll choose after the layout is built)
Three options were researched: **Reading Room** (warm paper, forest green, serif titles; detailed below), **Gallery** (clean modern minimal: `#FAFAF9` bg, ink-blue `#2B4C7E`, Inter + Instrument Serif), and **Dark Academia** (leather `#14110F`, brass `#C8A15A`, Cormorant/EB Garamond). Until you pick, the screens use a neutral token theme.

### Reading Room details (the researchers' recommendation)
- **Palette (light):**

  | Role | Colour |
  |---|---|
  | Paper | `#F6F1E7` |
  | Surface | `#FBF8F2` |
  | Sidebar | `#EFE7D8` |
  | Ink | `#2B2420` |
  | Muted text | `#6B5E52` |
  | Forest green accent | `#2F5D50` |
  | Oxblood | `#8C3B2E` |
  | Gilt (ornament only) | `#B08D57` |
  | Walnut shelves | `#8B5E3C` → `#6E4529` |

- **Palette (dark):** paper `#1A1714`, surface `#221E1A`, ink `#EDE6DA`, accent `#7FB5A2`, oxblood `#D98B7A`.
- **Fonts:** Fraunces for headings and book titles, Inter for the interface, Literata for notes and descriptions. All bundled offline.
- **Small touches:** 3% paper-grain texture, gilt rules, a ❦ fleuron divider, small-caps labels, and an ex-libris bookplate for empty states and the About screen.
- **3D shelf:**
  - Spine width comes from page count, and height varies by a seeded random amount.
  - Spine colour comes from the cover's dominant colour; books without a cover use a 10-colour bookcloth palette.
  - Spine styles are cloth, leather, or paperback, with title text running vertically.
  - Hovering lifts and tilts a book; clicking swings it out into the detail page.
  - Includes a rainbow "colour shelf" mode.
- **App shell:** custom title bar, a collapsible sidebar (Home, Library, Shelves, Wishlist, Lending with a badge, Stats, Settings), and undo toasts in the bottom-right.
- **Motion:** 120 to 400 ms with smooth easing, page-curl tab changes, and a "Read ✓" ink stamp. All of it honours reduced-motion settings.
- **Accessibility:** WCAG AA contrast, visible focus rings, full keyboard navigation (roving tabindex on grid and shelf), 90–125% text scaling, and a forced-colours (High Contrast) stylesheet.

## 6. Build milestones
| # | Milestone | Done when |
|---|---|---|
| 0 | Scaffold (electron-vite React-TS), app name "Home Library", animated splash screen, **first-run PostgreSQL setup** (create `library_app` role, connect to existing `Home Library` database, run migrations, encrypted config), "database not running" screen, Tailwind/shadcn, neutral token theme, CSP (only main-process network access, allow-listed to openlibrary.org, covers.openlibrary.org, googleapis.com), IPC skeleton, Vitest + Playwright, installer builds | Double-clicking the desktop icon opens the app shell with sidebar layout |
| 1 | Schema + migrations, repos, manual add/edit/delete, grid + list views (virtualised), book detail page, personal shelves | Handles 1,000 seeded books smoothly |
| 2 | **Discover:** Open Library + Google Books clients, merged results, full preview page, editions picker, add-to-shelf, cover/author-photo download, cache, offline fallback | Search "Piranesi" → preview → add → shows offline after Wi-Fi off |
| 3 | "Make it yours" panel (copy details, reading, review, quotes), covers (sharp, `cover:` protocol), generated covers | Personal details persist |
| 4 | Full-text and typo-tolerant search of your library, filters, sort, group, locations, lending, wishlist/want-to-buy | Searching 10k books takes under 50 ms |
| 5 | Dashboard, basic stats, 3D shelf view | Shelf renders smoothly with reduced-motion fallback |
| 6 | Backups/restore, CSV/JSON export, CSV + Goodreads import, Trash/undo | Backup → restore round-trip test passes |
| 7 | Polish: command palette, shortcuts, empty states, **style picker → apply chosen aesthetic**, final NSIS installer + portable exe | **v1.0** |
| 8+ | v2 features in the order listed above | — |

Packaging uses electron-builder to produce an NSIS installer (per-user, no admin rights, desktop and Start-menu shortcuts) plus a portable `.exe`. It also enforces a single instance, and auto-update is off.

## 7. Verification
- **Unit tests (Vitest):** the tests use a separate `home_library_test` database on your local PostgreSQL, which is dropped and recreated each run, with all migrations applied. They test repo CRUD, full-text and trigram search (prefix matches, accents), ISBN checksum and conversion, duplicate detection, stats queries, backup rotation, zip round-trip, the Goodreads CSV parser, and the ISBN service with fetch mocked offline.
- **Component tests:** React Testing Library covering forms, the Partly read shelf logic, and the views.
- **Catalogue clients:** tested against saved JSON fixtures from Open Library and Google Books (the merge rules, a missing field, timeout, a 404, offline), plus one manual live search.
- **End-to-end tests (Playwright `_electron`):** use a temporary data folder and cover these flows: search-and-add a book (mocked catalogue), add personal notes, search, drop a cover, lend and return, back up on quit and restore, and an offline check confirming no outgoing network requests.
- **Database checks:** open pgAdmin 4 → `Home Library` → `edition` and confirm a newly added book shows every field. Run a `pg_dump` backup, then restore it into a scratch database and compare row counts.
- **Manual checks:** install from the setup exe, launch from the desktop shortcut with Wi-Fi off, add books, and restart to confirm the data persists.
