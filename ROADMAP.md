# Home Library — Build Roadmap

We build **one step at a time**. Each step ends with something you can see and try. You review it, ask for changes, and then we move on.
Tick a box (`[x]`) when you've approved that step. The full details behind each step are in `PLAN.md`.

---

## Milestone 0 — The app opens (shell, splash, database, installer)
- [ ] **0.1 Empty app window.** A desktop window titled "Home Library" opens with a hello page. Opening it a second time brings back the same window.
- [ ] **0.2 Sidebar layout + neutral theme.** A collapsible sidebar (Home, Discover, Library, Shelves, Stats, Settings) with placeholder pages and a light/dark toggle.
- [ ] **0.3 Title bar + security lockdown.** A themed title bar with minimise/maximise/close. Settings shows the app version and where your data folder is. The interface itself can't reach the internet.
- [ ] **0.4 Animated splash.** *(You may design your own letter animation or logo later. It can replace this one at any time; see the note at the bottom.)* Big "Home Library" letters rise in one by one, a gold line draws underneath, then it fades into the app. Click or press a key to skip.
- [ ] **0.5 "Database not running" screen.** If PostgreSQL is stopped you get a friendly screen with **Start database** / **Retry** instead of a crash.
- [ ] **0.6 First-run setup.** Asks once for your `postgres` password, then creates the `library_app` user in your `Home Library` database. It never asks again.
- [ ] **0.7 Table setup (migrations).** Settings shows "Connected to Home Library · schema version 1". The first tables appear in pgAdmin.
- [ ] **0.8 Installer + desktop icon.** An installer puts an icon on your desktop. Double-click it and the splash plays, then the app shell opens.

## Milestone 1 — Books in the database (manual add, views, detail, shelves)
> **Built 2026-10-22, waiting for your review.** Decisions made (easy to change):
> - **Shelf rules:** "Own" and "Want to buy" are one choice (own it / want to buy / neither). The reading shelves are a second choice (To-read pile, Currently reading, Partly read, Read, Did not finish). So a book can be **Own + To-read pile** at the same time.
> - **Copy numbers** look like `AL-000123` (AL = Home Library).
> - **Duplicates:** a book counts as a duplicate if it has the same ISBN, or a very similar title (60% alike) **and** a matching author.
> - **Lending removed** (your request, 2026-10-22): no Lending page, loans or borrowers.
> - **Adding books:** the main button everywhere is **"Find a book"**, which opens Discover (online search). Typing a book in yourself is a small **"or add one by hand"** link on Discover and on empty shelves. From search results you'll add a book straight onto a shelf (Own, To-read pile, Want to buy…).
> - The 30-day "haven't read this in a while?" suggestion stays in step 3.9.

- [ ] **1.1 Catalogue tables + 1,000 test books.** The Library lists books read from PostgreSQL, and you can see them in pgAdmin.
- [ ] **1.2 Manual "Add book" form.** Only the title is required. Authors have roles, ISBNs are checked live, and the new book appears in the Library.
- [ ] **1.3 Grid view.** Book tiles with placeholder covers that scroll smoothly through 1,000 books.
- [ ] **1.4 List/table view.** Click a column header to sort by it, with smooth scrolling.
- [ ] **1.5 Book detail page.** All the book's info, tabs, and previous/next arrows (← / → keys work too).
- [ ] **1.6 Edit, delete (with Undo), duplicate warning.** Adding a book you already have asks "another copy / different edition / cancel".
- [ ] **1.7 Personal shelves.** Own · Read · Currently reading › **Partly read** · To-read pile · Want to buy · DNF, each with a count. A book can be on several shelves.

## Milestone 2 — Discover (search online, add with every detail)
> **Built 2026-10-22, waiting for your review.**
> - **No "Own" shelf** (your request): every book in the library is yours, except ones on **Want to buy**. Save to: To-read pile · Currently reading · Read · Want to buy. On a Want-to-buy book, **"I bought it"** moves it into your library.
> - **Search:** suggestions appear as you type, and the last half-typed word counts. **Save** works like Pinterest: a panel of your shelves. Saving is instant; the cover downloads in the background.
> - **Same book added twice:** if the ISBN is already in your library, nothing new is added and you're taken to the existing book.
> - **Search results** are remembered for 7 days, and book details and editions for 30 days. So repeat searches are instant, and recent ones also work offline.
> - **Google Books** needs a free key (Settings → Online search). Without one, Open Library is used on its own and a note explains why.

- [ ] **2.1 Online/offline pill + Discover page.** An indicator that changes when you turn Wi-Fi off or on.
- [ ] **2.2 Open Library search.** Search "Piranesi" to get result cards with covers.
- [ ] **2.3 Google Books + merged results.** Results from both sources with no duplicates, plus an "In your library" badge.
- [ ] **2.4 Full book preview.** Everything about the book (authors, description, subjects, edition details, author bio/photo, ratings) shown before you add it.
- [ ] **2.5 Editions picker.** Choose *your* edition (publisher, year, language, cover).
- [ ] **2.6 Add to shelf.** Saves every detail plus the cover and author photo to your PC. Check it in pgAdmin.
- [ ] **2.7 Cache + offline fallback.** Searches you've done before are instant. When offline you get a manual form prefilled with what you typed, and with Wi-Fi off, books you've added still show in full.

## Milestone 3 — Make it yours (covers, personal details, progress)
> **Built 2026-10-22, then reshaped at your request:** clicking a book now opens **your page** (your stars, reading shelf and progress, started/finished, bought-on date, Hardcover/Paperback, *My thoughts*, quotes, reading log). The **Book info** button shows everything about the book with the **website's rating**. Removed: tags, location, condition, where from, price, currency, gift, signed, first edition, limited number, copy notes, private notes. Earlier choices: progress is logged by page (or % without a page count); marking Read moves the book automatically. Also added: Pinterest-style Save, instant search, the 3D book hover, and the burning delete (graphics-card shader; CSS flames as a fallback).

- [ ] **3.1 Fast local covers.** Covers load instantly with no internet, and each book's colour is extracted from its cover.
- [ ] **3.2 Change a cover.** Drag and drop an image, paste one, or pick a file. Undo and remove are available.
- [ ] **3.3 Generated covers.** Books without a cover get a nice made-up one, in 3 layouts.
- [ ] **3.4 Make it yours: Your copy.** Format, condition, purchase date/place/price, gift from, signed / first edition, location. Saves automatically.
- [ ] **3.5 Make it yours: Your reading.** Shelves, ½-star rating, start/finish dates, tags.
- [ ] **3.6 Review, private notes, quotes.** A Notes tab with your thoughts and reorderable quotes.
- [ ] **3.7 Log reading progress.** Enter a page or a %, see a progress bar, and view the reading log.
- [ ] **3.8 Partly read shelf, finished.** Progress, last-read date, a "where I stopped" note, sorted by most read, with **Resume** and **Mark as read** buttons.
- [ ] **3.9 "Haven't read this in a while?"** After 30 days with no progress, the app suggests moving the book to Partly read. You can change the 30 days.

## Milestone 4 — Find and organise
- [ ] **4.1 Fast search engine.** Finds "garcia marq" → García Márquez and "piranessi" → Piranesi in under 50 ms.
- [ ] **4.2 Search-as-you-type in the Library.** Matches are highlighted, and "Nothing found — search online?" when there are no results.
- [ ] **4.3 Filter chips + sorting.** Filter by shelf, format, genre, language, rating, tag, and more. Your filters are remembered.
- [ ] **4.4 Group by.** Author, genre, series, shelf, format, decade, or location, with collapsible headers.
- [ ] **4.5 Locations.** A room › bookcase › shelf tree, a location picker on each copy, and location as a filter.
- [ ] **4.8 Wishlist / Want to buy.** Priority, target price, and store. **Got it!** moves the book into your library.

## Milestone 5 — Dashboard, stats, 3D shelf
- [ ] **5.1 Home: Currently reading.** Big covers with progress, and a quick "+ Log" button.
- [ ] **5.2 "Pick up where you left off."** A Partly read row and a Recently added row.
- [ ] **5.3 Stat tiles.** Owned, read this year, pages this year, and wishlist cost.
- [ ] **5.4 Stats page (numbers).** Counts by format, genre, and location; books and pages read per year; average rating; total spent.
- [ ] **5.5 Stats charts.** Bars and lines with a "Show as table" toggle.
- [ ] **5.6 3D shelf: spines.** Every book you add appears as a spine **standing upright** on a shelf. Spine width comes from the page count, and spine colour comes from the cover. *(Your request, 2026-10-22.)*
- [ ] **5.7 3D shelf: interaction.** Hovering slides a book **a little forward** off the shelf. Clicking plays an animation where the book **comes forward out of the shelf and turns to show its cover**, then opens the book page. Arrow keys move between books. *(Your request.)*
- [ ] **5.8 Reduced motion + rainbow shelf.** A calm mode that turns off the motion effects, plus an option to sort the shelf by colour.

## Milestone 6 — Keep your data safe
- [ ] **6.1 "Back up now".** Runs `pg_dump` into your backups folder.
- [ ] **6.2 Backup list + rotation.** Keeps the 10 most recent backups plus 8 weekly ones.
- [ ] **6.3 Automatic backups.** On close and once a day.
- [ ] **6.4 Restore.** Before restoring, the app makes a safety backup first. You must type RESTORE to confirm.
- [ ] **6.5 Automatic backup/restore test.** Proves restore works without touching your real data.
- [ ] **6.6 Export everything (.zip).** The database plus your covers, to move to another PC.
- [ ] **6.7 Import from .zip.** Previews the contents before restoring.
- [ ] **6.8 JSON safety-net export.** Readable without PostgreSQL.
- [ ] **6.9 CSV export.** Exports the books currently showing, ready for Excel.
- [ ] **6.10 CSV import, part 1.** Choose a file and map its columns.
- [ ] **6.11 CSV import, part 2.** A dry run that flags duplicates, then the real import, which can be undone.
- [ ] **6.12 Goodreads import preset.**
- [ ] **6.13 Trash page.** Restore deleted items or delete them forever.
- [ ] **6.14 Undo toasts everywhere.** Ctrl+Z works too.

## Milestone 7 — Polish, choose your style, v1.0
- [ ] **7.1 Ctrl+K command palette: go anywhere / run actions.**
- [ ] **7.2 Ctrl+K: find your books.**
- [ ] **7.3 Keyboard shortcuts + cheat sheet (`?`).**
- [ ] **7.4 Friendly empty states.**
- [ ] **7.5 Accessibility.** Text size 90–125%, reduced motion, focus rings, and Windows High Contrast support.
- [ ] **7.6 Design-token cleanup.** Makes switching styles a simple swap.
- [ ] **7.7 Bundle all candidate fonts offline.**
- [ ] **7.8 Build the 3 styles.** Reading Room, Gallery, and Dark Academia.
- [ ] **7.9 Style picker.** Try each style live: Keep or Go back.
- [ ] **7.10 Your style remembered.** Starts with no flash, including on the splash screen.
- [ ] **7.11 Finishing touches for your chosen style.**
- [ ] **7.12 App icon + About page, v1.0.0.** If you design your own logo, it goes in here. Send it as **SVG** (best) or a **PNG of at least 1024×1024**. *(Your request.)*
- [ ] **7.13 Final installer + portable exe.**
- [ ] **7.14 Install and test with Wi-Fi off.** 🎉 **v1.0**

---

## Later (v2), one chunk at a time
1. Refresh a book's details from online (shows a before/after diff)
2. Batch refresh
3. Multiple reads, progress history chart, quotes tab
4. Reading goals, streak heatmap, year-in-review
5. Manual collections
6. Smart shelves (saved filters)
7. Series pages with missing numbers highlighted
8. Shelf audit / stocktake
9. Condition and repair log
10. Weeding/donation workflow
11. Duplicate finder + data-quality dashboard
12. Bulk edit, merge/rename authors, tags, and series
13. Label printing (spine, QR, bookplate)
14. Catalogue PDF + insurance report
15. Call numbers (Dewey / custom)
16. More imports (Libib, Calibre, LibraryThing, StoryGraph)

---

## Decisions you'll make along the way (I'll ask at the right step)
| Step | Question |
|---|---|
| 0.2 | Sidebar order. Is Discover its own menu item or an "+ Add book" button? |
| 0.3 | Fully custom title bar, or Windows' own buttons over a themed bar? |
| 0.4 | Splash timing. Every launch, or only the first launch of the day? |
| 0.5 | Should "Start database" trigger a Windows admin prompt, or just show instructions? |
| 1.7 | Shelf rules. Does "Own" mean you have a physical copy? Can a Want-to-buy book also be on To-read? |
| 1.6 | Copy numbers like `AL-000123`? How strict should duplicate matching be? |
| 2.3 | Use Google Books without an API key, or with your own free key? |
| 3.7 | Log progress mainly in pages or in %? |
| 6.2 | Keep manual backups forever? |
| 6.13 | Empty the Trash automatically after 30 days, or never? |
| 7.9 | **Reading Room, Gallery, or Dark Academia** |
| 7.12 | App icon design |

---

## Your own designs (any time)
- **Logo:** send an SVG (best) or a PNG at least 1024×1024. It becomes the desktop icon, the taskbar icon, the About page image and, if you like, part of the opening screen.
- **Letter animation for the opening screen:**
  - **Best options:** a **Lottie file** (.json, exported from After Effects or LottieFiles), an **animated SVG**, or simply a description or sketch that I build in code.
  - **Also possible:** a short **video** (.webm or .mp4), but it won't look as sharp and is harder to adapt to light and dark mode.
- Fonts: if your design uses a specific font, include the font file or its name. It must be free to use, because it gets packaged with the app.
