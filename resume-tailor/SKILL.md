---
name: resume-tailor
description: Tailors the user's resume to a specific job posting and renders it as a one-page HTML/PDF resume. Use whenever the user provides a job posting (pasted text, a file, or a URL) and asks to tailor, customize, adapt, or generate a resume/CV for that role or company. Reads the user's master content from content/*.md, writes a tailored payload, and runs scripts/render.mjs to produce the PDF.
license: MIT
compatibility: Requires Node.js 20+ and installed npm dependencies (puppeteer)
---

# Resume Tailor

Generate a resume customized for one job posting. You do the tailoring (word choice,
selection, ordering); the render script does the rendering (HTML template, PDF). Never write
resume HTML yourself, and never call the render pipeline anything other than what is below.

## Hard rules

1. **Never fabricate.** No invented employers, titles, dates, credentials, metrics, or
   skills. Everything you write must be supported by `content/*.md`. You may select,
   reorder, condense, and reword — nothing more.
2. **Never edit `content/`.** Those files are the user's source of truth. If content seems
   missing or wrong, tell the user instead of changing it.
3. **Static sections are off-limits.** Contact, education, and certifications are rendered
   directly from `content/` by the script. Your payload cannot and must not restate them.
4. **Copy factual anchors verbatim.** Each experience entry's `company` and `title` must
   exactly match a `## Company — Title` heading in `content/experience.md`. Do not include
   dates in the payload; the script takes them from content.

## Workflow

### 1. Ingest

- Read the job posting the user provided. If they gave a URL, fetch it. Save the posting
  text to `jobs/<job-slug>/posting.md` if it is not already a file (`<job-slug>` =
  lowercase-hyphenated company + role, e.g. `acme-senior-backend`).
- Read all of `content/`: `contact.md`, `about.md`, `experience.md`, `skills.md`,
  `education.md`, `certifications.md`.
- Read `references/tailoring-guidelines.md` in full before writing any tailored text.

### 2. Analyze the posting

Identify: the role's top responsibilities, required and nice-to-have skills, the exact
terminology the posting uses (e.g. "Kubernetes" vs "container orchestration"), and any
cultural signals (mentoring, ownership, customer contact). Rank the user's experience
bullets and skills by relevance to that list.

### 3. Write the payload

Create `jobs/<job-slug>/tailored.json` following `references/payload-format.md` exactly:

- `title` — optional tailored headline, only if the user's own title honestly maps to the
  posting's language (e.g. "Senior Software Engineer" for a "Senior Backend Engineer"
  posting). Never inflate seniority.
- `summary` — 2-3 sentences condensed from `content/about.md`, leading with what matters
  most to this posting.
- `experience` — every role from `content/experience.md` (most recent first), with 3-5
  bullets each (max 6): the most relevant master bullets, reworded per the guidelines to
  mirror the posting's terminology. Recent/relevant roles get more bullets; older or less
  relevant ones fewer.
- `skills` — 3-4 groups selected and reordered from `content/skills.md`, most relevant
  group and skills first. You may rename group labels to match the posting's vocabulary,
  but every skill must come from the inventory.

### 4. Render

```bash
npm run render -- jobs/<job-slug>/tailored.json
```

- If validation fails, the script prints exactly what is wrong — fix the payload and rerun.
  Do not weaken or bypass the script's checks.
- If the script warns the resume overflows one page, trim the least relevant bullets (or
  tighten the summary) and rerun until it fits.
- If the script fails because dependencies are missing, run `npm install` first.

### 5. Report

Tell the user, briefly:

- Which posting keywords the resume now mirrors and where.
- What you emphasized, de-emphasized, or dropped, and why.
- Confirmation that the resume fits one page, plus the output paths
  (`jobs/<job-slug>/resume.pdf` and `.html`).

If the posting asks for something the user's content cannot support (a required
certification they lack, years of experience they don't have), say so plainly instead of
papering over it.

## Iterating

When the user asks for adjustments ("emphasize X", "make it punchier"), edit the same
`tailored.json` and rerun the render — do not start a new job folder for the same posting.
