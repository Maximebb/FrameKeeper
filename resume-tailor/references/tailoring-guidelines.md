# Tailoring guidelines

Rules for turning the user's master content into a posting-specific resume. Read this in
full before writing any tailored text.

## Truthfulness (overrides everything else)

- Every claim must trace back to `content/*.md`. Selecting, reordering, condensing, and
  rewording are allowed; adding facts, skills, numbers, or seniority is not.
- Keep every number exactly as written in the master content. If a master bullet has no
  metric, do not invent one.
- If the posting requires something the content cannot support, leave it out of the resume
  and flag it to the user — never stretch a claim to cover the gap.

## Keyword mirroring (ATS)

- Use the posting's exact terminology wherever it is truthful. If the posting says
  "Kubernetes" and the content says "EKS", write "Kubernetes (EKS)". If the posting says
  "event-driven architecture" and the user built Kafka pipelines, use that phrase.
- Mirror the posting's title in the headline only if it honestly maps to the user's level
  and role.
- Spell out an acronym once when the posting uses the spelled-out form ("continuous
  integration (CI)") — ATS scanners match literal strings.

## Bullet writing

- Structure: strong action verb, then what was done, then the quantified outcome.
  "Led migration of 12 services to Kubernetes, cutting deploy time from 45 to 8 minutes."
- Past roles in past tense; the current role in present tense. Be consistent within a role.
- No first-person pronouns ("I", "my", "we") and no filler openers ("Responsible for",
  "Helped with", "Worked on").
- One idea per bullet. If a master bullet packs two accomplishments, keep the one relevant
  to the posting.
- Do not reuse the same action verb to open two bullets within a role.
- Aim for one line per bullet, two lines max.

## Selection and ordering

- Relevance to the posting decides everything: which bullets make the cut, which skills are
  listed, what the summary leads with.
- Keep all roles (unexplained employment gaps hurt more than an old role does), but budget
  bullets by relevance: 4-5 for the most relevant/recent role, 2-3 for older or less
  relevant ones.
- Skills: 3-4 groups, most relevant group first, most relevant skills first within each
  group. Cut skill groups that are irrelevant to the posting rather than shrinking every
  group.
- Summary: 2-3 sentences. First sentence answers "why is this person right for this role";
  the rest supports it with the strongest relevant evidence.

## One page

- The render script warns when the resume overflows one page. Trim in this order: least
  relevant bullets from the least relevant roles, then extra skills, then summary length.
- Never fix overflow by asking for layout/CSS changes — fix it by cutting content.
