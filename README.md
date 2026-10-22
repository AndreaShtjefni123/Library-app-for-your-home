# Home Library

A personal home-library desktop app for Windows. Find books online (Open Library and Google Books), save them with every detail and their cover to your own PC, and keep track of your reading. Once a book is saved, browsing works fully offline.

**Highlights**
- Type-ahead book search with instant suggestions, and a Pinterest-style "Save to shelf"
- Shelves: Read, Currently reading, Partly read, To-read pile, Want to buy, Did not finish
- Your page for each book: your stars, reading progress by page, dates, your thoughts, favourite quotes, a reading log
- "Book info" with the full description, edition details and the website rating
- 3D book hover in the shelf grid, and a burning-paper delete effect drawn with a WebGL shader (with Undo)

**Built with** Electron, React, TypeScript, Tailwind CSS and PostgreSQL.

## Running it

You need Node.js 20.19+ and PostgreSQL 17 running locally.

```bash
npm install
npm run dev      # development
npm start        # build and run
npm test         # unit tests
```

On first launch the app asks once for your PostgreSQL admin password. It uses it to create its own login (`library_app`) for your library database, and the password is never stored. The app's own login is kept encrypted on your PC (Windows data protection) in `%APPDATA%\HomeLibrary`, outside this project.

`PLAN.md` and `ROADMAP.md` describe the design and the step-by-step build plan.
