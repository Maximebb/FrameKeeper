# tailored.json format

The payload contains **only the tailorable sections**: headline (optional), summary,
experience bullets, and skills. Contact, education, certifications, and all dates are
rendered directly from `content/*.md` and must not appear here.

## Fields

| Field | Type | Rules |
| --- | --- | --- |
| `title` | string, optional | Tailored headline shown under the name. Omit to use `Title:` from `content/contact.md`. Must honestly describe the user; never inflate seniority. |
| `summary` | string, required | 2-3 sentences (roughly 40-70 words) condensed from `content/about.md`, angled at the posting. |
| `experience` | array, required | One entry per role, most recent first. Include every role from `content/experience.md`. |
| `experience[].company` | string, required | Copied **verbatim** from a `## Company — Title` heading in `content/experience.md`. The render script rejects unknown companies. |
| `experience[].title` | string, required | Copied **verbatim** from the same heading. |
| `experience[].bullets` | array of strings, required | 3-5 bullets (hard max 6). Reworded versions of that role's master bullets — same facts and numbers, tailored phrasing and order. |
| `skills` | array, required | 3-4 groups, most relevant first. |
| `skills[].label` | string, required | Group label. May be renamed to match the posting's vocabulary. |
| `skills[].skills` | array of strings, required | 3-8 skills per group, each drawn from `content/skills.md`. The script warns on skills not found in the inventory. |

Do **not** include: `dates`, `location`, contact info, education, or certifications. If
`dates` is present it must match `content/experience.md` exactly or the render fails, so the
simplest correct move is to always omit it.

## Example

```json
{
  "title": "Senior Backend Engineer",
  "summary": "Backend engineer with nine years of experience building high-throughput data pipelines and cloud infrastructure on AWS. Led a 12-service Kubernetes migration and built the observability stack that cut detection time from 25 to 4 minutes. Known for mentoring engineers and driving design alignment through clear technical writing.",
  "experience": [
    {
      "company": "Northwind Cloud",
      "title": "Senior Software Engineer",
      "bullets": [
        "Designed and built a multi-tenant event ingestion pipeline in Go and Kafka processing 40M events/day with p99 latency under 250ms",
        "Led the migration of 12 services from EC2 to Kubernetes (EKS), cutting infrastructure costs 30% and deploy time from 45 to 8 minutes",
        "Built the observability stack (Prometheus, Grafana, PagerDuty), reducing mean time to detection from 25 to 4 minutes",
        "Mentored four junior engineers, two of whom were promoted within 18 months"
      ]
    },
    {
      "company": "Fabrikam Software",
      "title": "Software Engineer",
      "bullets": [
        "Built REST and GraphQL APIs in TypeScript serving 300 enterprise customers",
        "Redesigned the PostgreSQL reporting schema, speeding the slowest dashboard queries by 12x",
        "Moved releases from biweekly to daily by implementing CI/CD with Jenkins and GitHub Actions"
      ]
    }
  ],
  "skills": [
    { "label": "Backend", "skills": ["Go", "TypeScript", "Node.js", "Kafka", "PostgreSQL", "Redis"] },
    { "label": "Cloud & Infrastructure", "skills": ["AWS", "Kubernetes", "Docker", "Terraform"] },
    { "label": "Observability", "skills": ["Prometheus / Grafana", "OpenTelemetry", "Incident response & on-call"] }
  ]
}
```
