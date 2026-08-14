# IB Core

The IB Diploma Programme core dashboard for ISG — CAS, Extended Essay, TOK, Internal
Assessments, predicted grades, and everything the IB Coordinator needs to get a cohort
through an assessment session.

Design documents live in the Claude project (`claude/IB-*.md`). This repository is the code.

---

## Why you can build this today, with no cloud account

Only three things in the whole system genuinely need the cloud:

| Needs the cloud | Doesn't |
|---|---|
| Deployment (Cloud Run) | Every screen and component |
| Real Google Sign-In | The permission system |
| File storage for uploads | The data model, the paste parser, the anonymity checks, the word counts, the export/pack builder, PDF generation, all the logic |

So this project is set up to run entirely on a laptop:

- **Data** comes from `lib/data/fixtures.ts` — a small, realistic ISG cohort held in memory.
- **Sign-in** is a switcher in the header. Pick a person, see exactly what they see.
- **Permissions are already real.** Every gated button on every page goes through
  `session.can(...)`, resolved from the capability model. That is not a mock.

When IT decides the database, one file changes. See *The swap point* below.

---

## What you need to install

You already have **VS Code** and **GitHub Desktop**. One thing is missing:

### Node.js

Download the **LTS** version from <https://nodejs.org> and install it with the defaults.

Check it worked — open VS Code, then **Terminal → New Terminal**, and type:

```bash
node -v
npm -v
```

You should see two version numbers (something like `v22.x.x` and `10.x.x`). If you see
"command not found", close VS Code completely and reopen it — the terminal needs a restart
to notice a new install.

That's the only program you need. Nothing else.

### VS Code extensions (optional but pleasant)

- **ESLint** — underlines mistakes as you type
- **Prettier** — formats on save so you never argue about spacing

---

## Running it

In the VS Code terminal, from this folder:

```bash
npm install     # first time only — downloads the libraries
npm run dev     # starts the app
```

Then open <http://localhost:3000> in your browser.

Leave `npm run dev` running while you work. Save a file and the browser updates by itself.
Press `Ctrl+C` in the terminal to stop it.

Two other commands worth knowing:

```bash
npm run build   # checks the whole project compiles — run before you push
npm start       # runs the built version
```

---

## Using it

The header has a **dev sign-in** dropdown. Switch between:

- **Michael** — District IB Coordinator, belongs to both schools (so he gets the school switcher)
- **S. Haddad** — School coordinator at Jubail, on the *standard* preset
- **H. Adeyemi** — Core teacher holding four distinct roles, plus two individually granted capabilities
- **R. Farouk** — subject teacher, sees only his sections
- **Layla Ahmed** — student

Watch the home page change. Note what *disappears*: the student has no "Post announcement"
button and no staff-only documents; the Jubail coordinator sees nothing belonging to Dhahran.
That isolation is the point.

---

## How the project is laid out

```
app/
  layout.tsx           the HTML shell
  page.tsx             the home page — modules, key dates, announcements, documents
  globals.css          design tokens lifted straight from the approved mockups
  api/dev/             the dev sign-in switcher (delete when Google auth lands)
components/
  Shell.tsx            header, school chip, dev switcher
lib/
  types.ts             the domain model — the single source of truth
  capabilities.ts      the capability list, the presets, and can()
  session.ts           who is signed in (development version)
  data/
    repository.ts      THE INTERFACE every screen reads through
    fixtures.ts        the fake data behind it
    index.ts           one line: which implementation is live
```

### The swap point

Every screen reads through `Repository` (in `lib/data/repository.ts`) and never touches a
database directly. When the platform decision lands:

1. Write one new file — `lib/data/postgres.ts` or `lib/data/firestore.ts` — implementing
   the same interface.
2. Change one line in `lib/data/index.ts`.

No screen changes. That is the whole reason the interface exists, and it is why waiting on
IT costs us nothing.

### The permission rule

**Never check a role name.** Not anywhere, not once. Always:

```ts
if (session.can('pack.ib')) { ... }
```

Roles are a convenience for humans; capabilities are what the code asks about. This is what
makes granting a permission later a tick in a box instead of a developer ticket.

When a real database arrives, the *same* rule must also be enforced in its security rules.
A permission system that only hides buttons is a suggestion, not a permission system.

---

## Pushing to GitHub

With GitHub Desktop:

1. **File → Add local repository**, choose this folder.
2. It will offer to create a repository — say yes.
3. Write a summary in the bottom-left box, click **Commit to main**.
4. Click **Publish repository**. Make it **private** — this will hold student data.

Do that early and commit often. A commit is a save point you can return to.

---

## What's next

- Wire up the remaining home-page links — they point at routes that don't exist yet.
- Build Setup & people (Foundations step 1): cohorts, the paste importer, courses, sections, enrolment.
- Then CAS, following the approved mockup.

The four schema decisions in the design docs are already reflected here: `school_id` on
everything, membership as a list, sections between course and enrolment, and candidate
identifiers split into personal code and session number.
