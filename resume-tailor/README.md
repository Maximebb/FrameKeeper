# Resume Tailor

An [Agent Skill](https://agentskills.io/specification) that builds a resume customized for a
specific job posting. You author your resume content once as Markdown files; an AI agent
(Cursor, Claude Code, or any skill-aware agent) tailors the wording to the posting and runs a
deterministic render script that produces an eye-pleasing, one-page HTML + PDF resume.

The division of labor is the core design:

- **The agent (via [SKILL.md](SKILL.md)) does all tailoring.** It reads your content and the
  posting, then writes a `tailored.json` payload with a rewritten summary, re-prioritized
  experience bullets, and a skills selection that mirrors the posting's terminology.
- **The render script does all rendering.** `scripts/render.mjs` validates the payload,
  fills the HTML template, and prints a PDF with Puppeteer. It never calls an LLM, and the
  agent never hand-writes HTML.

Static sections — contact, education, certifications — are read by the render script
**directly from your `content/` files**, so the agent cannot alter them. For experience, the
script cross-checks factual anchors (company, title, dates) against `content/experience.md`
and refuses to render if the payload invents an employer or changes dates.

## Setup

Requires Node.js 20+.

```bash
npm install   # installs puppeteer (downloads a headless Chromium)
```

Smoke test the render pipeline end to end:

```bash
npm run render:example
```

This renders `jobs/example-job/` to `jobs/example-job/resume.html` and
`jobs/example-job/resume.pdf`.

## Authoring your content

Replace the placeholder files in `content/` with your real information. These files are the
single source of truth — the agent selects, reorders, and rewords from them but must never
invent facts that are not there. Formats are simple and parsed by the render script, so keep
the conventions:

| File | Format |
| --- | --- |
| `content/contact.md` | `Key: value` lines (Name, Title, Email, Phone, Location, and any links such as LinkedIn, GitHub, Website) |
| `content/about.md` | Free-form prose: your full "master" about-me text. The agent condenses this into the tailored summary. |
| `content/experience.md` | One `## Company — Title` heading per role, a `Dates:` line, an optional `Location:` line, then master bullets (`-`). Write more bullets than fit on a page; the agent picks the relevant ones. |
| `content/skills.md` | `## Group` headings with `-` bullet lists (full inventory; the agent selects and reorders) |
| `content/education.md` | One `## Institution` heading per entry with `Degree:` and `Dates:` lines (rendered verbatim) |
| `content/certifications.md` | `-` bullet list, one certification per line (rendered verbatim) |

## Tailoring a resume to a posting

1. Open this repo in a skill-aware agent (Cursor, Claude Code, ...).
2. Give it a job posting — paste the text, or save it to `jobs/<job-slug>/posting.md` and
   point the agent at it.
3. Ask it to tailor your resume, e.g. *"Tailor my resume to this job posting."* The
   `resume-tailor` skill takes over: it writes `jobs/<job-slug>/tailored.json` and runs the
   render script.
4. Review `jobs/<job-slug>/resume.pdf`. Ask for adjustments ("emphasize the platform work
   more") and the agent regenerates.

You can also render manually from an existing payload:

```bash
npm run render -- jobs/<job-slug>/tailored.json
```

## Repository layout

```
SKILL.md                      # skill entry point: workflow the agent follows
content/                      # YOUR resume content, the source of truth (Markdown)
references/
  tailoring-guidelines.md     # resume-writing and tailoring rules the agent applies
  payload-format.md           # tailored.json format, documented with an example
scripts/
  render.mjs                  # tailored.json + content/*.md -> resume.html -> resume.pdf
  template.html               # single-page HTML template with {{tokens}}
  resume.css                  # screen + print stylesheet
jobs/                         # one folder per posting: posting.md, tailored.json, outputs
  example-job/                # checked-in worked example (fictional)
```

Generated `resume.html` / `resume.pdf` files are gitignored; they are cheap to regenerate
from the payload.
