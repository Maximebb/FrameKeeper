#!/usr/bin/env node
/**
 * Renders a tailored resume payload to HTML and PDF.
 *
 * Usage: node scripts/render.mjs <path/to/tailored.json>
 *
 * Static sections (contact, education, certifications) are read directly from
 * content/*.md — the payload cannot alter them. Experience entries in the
 * payload are cross-checked against content/experience.md: company + title
 * must match an existing role, and dates/location always come from content.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(SCRIPTS_DIR);
const CONTENT_DIR = path.join(ROOT, "content");

// US Letter content area at CSS 96dpi: (11in - 2 * 0.6in margins) = 9.8in.
const ONE_PAGE_CONTENT_HEIGHT_PX = 9.8 * 96;

function fail(messages) {
  const list = Array.isArray(messages) ? messages : [messages];
  console.error("\nRender failed. Fix the following and rerun:\n");
  for (const m of list) console.error(`  ✗ ${m}`);
  console.error("");
  process.exit(1);
}

function warn(message) {
  console.warn(`  ⚠ ${message}`);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Normalizes line endings (files may be authored on Windows) and drops HTML comments. */
function cleanMarkdown(markdown) {
  return markdown.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
}

async function readContent(name) {
  const filePath = path.join(CONTENT_DIR, name);
  try {
    return cleanMarkdown(await readFile(filePath, "utf8"));
  } catch {
    fail(`Missing content file: content/${name}`);
  }
}

/* ---------- content/*.md parsers ---------- */

/** "Key: value" lines -> { key: value } (keys lowercased). */
function parseKeyValues(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z ]*):\s*(.+)$/);
    if (match) out[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return out;
}

/** Splits markdown into { heading, body } blocks at "## " headings. */
function parseHeadingBlocks(text) {
  const blocks = [];
  let current = null;
  for (const line of text.split("\n")) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      current = { heading: heading[1].trim(), lines: [] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return blocks.map((b) => ({ heading: b.heading, body: b.lines.join("\n") }));
}

function parseBullets(text) {
  return text
    .split("\n")
    .map((line) => line.match(/^-\s+(.+)$/))
    .filter(Boolean)
    .map((m) => m[1].trim());
}

/** content/experience.md -> [{ company, title, dates, location, bullets }] */
function parseExperience(text) {
  const roles = [];
  for (const block of parseHeadingBlocks(text)) {
    // Heading format: "Company — Title" (em dash, en dash, or " - ").
    const parts = block.heading.split(/\s+[—–]\s+|\s+-\s+/);
    if (parts.length < 2) {
      fail(
        `content/experience.md heading "${block.heading}" must be "Company — Title" (separated by an em dash)`
      );
    }
    const fields = parseKeyValues(block.body);
    if (!fields.dates) {
      fail(`content/experience.md role "${block.heading}" is missing a "Dates:" line`);
    }
    roles.push({
      company: parts[0].trim(),
      title: parts.slice(1).join(" — ").trim(),
      dates: fields.dates,
      location: fields.location ?? "",
      bullets: parseBullets(block.body),
    });
  }
  return roles;
}

/** Lowercases and drops parenthetical qualifiers, e.g. "AWS (ECS, S3)" -> "aws". */
function normalizeSkill(skill) {
  return String(skill).toLowerCase().replace(/\s*\([^)]*\)/g, "").trim();
}

/** content/skills.md -> flat normalized inventory of every listed skill. */
function parseSkillInventory(text) {
  const inventory = [];
  for (const block of parseHeadingBlocks(text)) {
    inventory.push(...parseBullets(block.body).map(normalizeSkill));
  }
  return inventory;
}

/* ---------- payload validation ---------- */

function validatePayload(payload, masterRoles, skillInventory) {
  const errors = [];

  if (typeof payload.summary !== "string" || payload.summary.trim().length === 0) {
    errors.push('"summary" must be a non-empty string');
  }

  if (!Array.isArray(payload.experience) || payload.experience.length === 0) {
    errors.push('"experience" must be a non-empty array');
  } else {
    payload.experience.forEach((entry, i) => {
      const label = `experience[${i}]`;
      if (!entry || typeof entry !== "object") {
        errors.push(`${label} must be an object`);
        return;
      }
      if (!entry.company || !entry.title) {
        errors.push(`${label} must have "company" and "title"`);
        return;
      }
      // Factual anchor check: the role must exist in content/experience.md
      // with this exact company + title. Dates/location are never taken from
      // the payload, so they cannot be altered.
      const master = masterRoles.find(
        (r) =>
          r.company.toLowerCase() === String(entry.company).toLowerCase() &&
          r.title.toLowerCase() === String(entry.title).toLowerCase()
      );
      if (!master) {
        const known = masterRoles.map((r) => `"${r.company} — ${r.title}"`).join(", ");
        errors.push(
          `${label} "${entry.company} — ${entry.title}" does not match any role in content/experience.md. ` +
            `Known roles: ${known}. Company and title must be copied verbatim — never invented.`
        );
        return;
      }
      if (entry.dates && entry.dates !== master.dates) {
        errors.push(
          `${label} "dates" ("${entry.dates}") differs from content/experience.md ("${master.dates}"). ` +
            `Omit "dates" from the payload; they are always taken from content.`
        );
      }
      if (!Array.isArray(entry.bullets) || entry.bullets.length === 0) {
        errors.push(`${label} must have a non-empty "bullets" array of strings`);
      } else {
        if (entry.bullets.some((b) => typeof b !== "string" || b.trim().length === 0)) {
          errors.push(`${label} bullets must all be non-empty strings`);
        }
        if (entry.bullets.length > 6) {
          errors.push(
            `${label} has ${entry.bullets.length} bullets; keep it to at most 6 (3-5 is ideal) to fit one page`
          );
        }
      }
    });
  }

  if (!Array.isArray(payload.skills) || payload.skills.length === 0) {
    errors.push('"skills" must be a non-empty array of { "label", "skills" } groups');
  } else {
    payload.skills.forEach((group, i) => {
      const label = `skills[${i}]`;
      if (!group || typeof group !== "object" || !group.label) {
        errors.push(`${label} must be an object with a "label"`);
        return;
      }
      if (!Array.isArray(group.skills) || group.skills.length === 0) {
        errors.push(`${label} ("${group.label}") must have a non-empty "skills" array`);
        return;
      }
      for (const skill of group.skills) {
        const needle = normalizeSkill(skill);
        const known = skillInventory.some(
          (inv) => inv.includes(needle) || needle.includes(inv)
        );
        if (!known) {
          warn(
            `skill "${skill}" does not appear in content/skills.md — ` +
              `make sure it is honest, or add it to the inventory`
          );
        }
      }
    });
  }

  if (payload.title !== undefined && typeof payload.title !== "string") {
    errors.push('"title", when present, must be a string (tailored headline)');
  }

  if (errors.length > 0) fail(errors);
}

/* ---------- HTML assembly ---------- */

function renderContactLine(contact) {
  const pieces = [];
  const push = (html) => pieces.push(html);

  if (contact.email) {
    push(`<a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a>`);
  }
  if (contact.phone) push(escapeHtml(contact.phone));
  if (contact.location) push(escapeHtml(contact.location));
  for (const key of Object.keys(contact)) {
    if (["name", "title", "email", "phone", "location"].includes(key)) continue;
    const value = contact[key];
    const href = value.startsWith("http") ? value : `https://${value}`;
    push(`<a href="${escapeHtml(href)}">${escapeHtml(value)}</a>`);
  }
  return pieces.join('<span class="sep">•</span>');
}

function renderExperience(entries, masterRoles) {
  return entries
    .map((entry) => {
      const master = masterRoles.find(
        (r) =>
          r.company.toLowerCase() === entry.company.toLowerCase() &&
          r.title.toLowerCase() === entry.title.toLowerCase()
      );
      const meta = [master.dates, master.location].filter(Boolean).join(" · ");
      const bullets = entry.bullets
        .map((b) => `        <li>${escapeHtml(b)}</li>`)
        .join("\n");
      return `    <article class="entry">
      <div class="entry-head">
        <p><span class="entry-role">${escapeHtml(master.title)}</span> <span class="entry-company">· ${escapeHtml(master.company)}</span></p>
        <p class="entry-meta">${escapeHtml(meta)}</p>
      </div>
      <ul>
${bullets}
      </ul>
    </article>`;
    })
    .join("\n");
}

function renderSkills(groups) {
  return groups
    .map(
      (group) => `    <div class="skills-group">
      <p class="skills-label">${escapeHtml(group.label)}</p>
      <p class="skills-list">${group.skills.map(escapeHtml).join(" · ")}</p>
    </div>`
    )
    .join("\n");
}

function renderEducation(blocks) {
  return blocks
    .map((block) => {
      const fields = parseKeyValues(block.body);
      const meta = fields.dates ? escapeHtml(fields.dates) : "";
      const notes = fields.notes
        ? `\n      <p class="edu-notes">${escapeHtml(fields.notes)}</p>`
        : "";
      return `    <article class="entry">
      <div class="entry-head">
        <p><span class="edu-degree">${escapeHtml(fields.degree ?? "")}</span> <span class="entry-company">· ${escapeHtml(block.heading)}</span></p>
        <p class="entry-meta">${meta}</p>
      </div>${notes}
    </article>`;
    })
    .join("\n");
}

function renderCertifications(bullets) {
  if (bullets.length === 0) return "";
  const items = bullets.map((b) => `      <li>${escapeHtml(b)}</li>`).join("\n");
  return `  <section class="section">
    <h2 class="section-title">Certifications</h2>
    <ul class="cert-list">
${items}
    </ul>
  </section>`;
}

function fillTemplate(template, replacements) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, token) => {
    if (!(token in replacements)) fail(`Template token {{${token}}} has no replacement`);
    return replacements[token];
  });
}

/* ---------- PDF ---------- */

async function printPdf(htmlPath, pdfPath) {
  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0" });
    await page.emulateMediaType("print");

    const contentHeight = await page.evaluate(
      () => document.querySelector(".resume").getBoundingClientRect().height
    );
    const pages = contentHeight / ONE_PAGE_CONTENT_HEIGHT_PX;
    if (pages > 1) {
      warn(
        `Resume overflows one page (${(pages * 100).toFixed(0)}% of a page). ` +
          `Trim bullets or shorten the summary, then rerun.`
      );
    }

    await page.pdf({
      path: pdfPath,
      format: "letter",
      margin: { top: "0.6in", right: "0.6in", bottom: "0.6in", left: "0.6in" },
      printBackground: true,
    });
    return pages;
  } finally {
    await browser.close();
  }
}

/* ---------- main ---------- */

async function main() {
  const payloadArg = process.argv[2];
  if (!payloadArg) {
    fail("Usage: node scripts/render.mjs <path/to/tailored.json>");
  }
  const payloadPath = path.resolve(payloadArg);

  let payload;
  try {
    payload = JSON.parse(await readFile(payloadPath, "utf8"));
  } catch (err) {
    fail(`Could not read payload ${payloadArg}: ${err.message}`);
  }

  const [contactMd, experienceMd, skillsMd, educationMd, certificationsMd] =
    await Promise.all(
      ["contact.md", "experience.md", "skills.md", "education.md", "certifications.md"].map(
        readContent
      )
    );

  const contact = parseKeyValues(contactMd);
  if (!contact.name || !contact.email) {
    fail("content/contact.md must have at least Name: and Email: lines");
  }
  const masterRoles = parseExperience(experienceMd);
  if (masterRoles.length === 0) {
    fail("content/experience.md has no roles (expected '## Company — Title' headings)");
  }
  const skillInventory = parseSkillInventory(skillsMd);

  validatePayload(payload, masterRoles, skillInventory);

  const [template, css] = await Promise.all([
    readFile(path.join(SCRIPTS_DIR, "template.html"), "utf8"),
    readFile(path.join(SCRIPTS_DIR, "resume.css"), "utf8"),
  ]);

  const html = fillTemplate(template, {
    css,
    name: escapeHtml(contact.name),
    title: escapeHtml(payload.title?.trim() || contact.title || ""),
    contact: renderContactLine(contact),
    summary: escapeHtml(payload.summary.trim()),
    experience: renderExperience(payload.experience, masterRoles),
    skills: renderSkills(payload.skills),
    education: renderEducation(parseHeadingBlocks(educationMd)),
    certifications: renderCertifications(parseBullets(certificationsMd)),
  });

  const outDir = path.dirname(payloadPath);
  const htmlPath = path.join(outDir, "resume.html");
  const pdfPath = path.join(outDir, "resume.pdf");
  await writeFile(htmlPath, html, "utf8");

  const pages = await printPdf(htmlPath, pdfPath);

  console.log(`\n  ✓ ${path.relative(ROOT, htmlPath)}`);
  console.log(`  ✓ ${path.relative(ROOT, pdfPath)}`);
  console.log(
    pages <= 1
      ? `  ✓ Fits on one page (${(pages * 100).toFixed(0)}% full)\n`
      : ""
  );
}

main();
