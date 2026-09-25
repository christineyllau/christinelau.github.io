// scripts/update-writing.mjs
//
// Fetches the Medium RSS feed for @christinelauca, builds the "writing-cards"
// HTML block used on christinelau.ca, and writes it back into index.html
// between the WRITING-CARDS:START / END markers.
//
// Run with: node scripts/update-writing.mjs
// Requires Node 18+ (built-in fetch).

import { readFileSync, writeFileSync } from "node:fs";

const FEED_URL = "https://medium.com/feed/@christinelauca";
const INDEX_PATH = "index.html";
const MAX_CARDS = 6; // how many recent posts to show

const START_MARKER = "<!-- WRITING-CARDS:START -->";
const END_MARKER = "<!-- WRITING-CARDS:END -->";

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;");
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  return m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function parseItems(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = decodeEntities(extractTag(block, "title"));
    const link = extractTag(block, "link").split("?source=")[0];
    const pubDate = extractTag(block, "pubDate");
    const content = extractTag(block, "content:encoded");
    items.push({ title, link, pubDate, content });
  }
  return items;
}

function firstParagraphSummary(contentHtml, maxLen = 140) {
  const pMatch = contentHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const text = pMatch ? stripTags(pMatch[1]) : stripTags(contentHtml);
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, "") + "\u2026";
}

function formatMonthYear(pubDate) {
  const d = new Date(pubDate);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function buildCardHtml(item) {
  const title = escapeHtml(item.title);
  const desc = escapeHtml(firstParagraphSummary(item.content));
  const dateLabel = formatMonthYear(item.pubDate);
  return `          <a class="writing-card" href="${item.link}" target="_blank" rel="noopener">
            <div class="writing-card-source">Medium &nbsp;&middot;&nbsp; ${dateLabel}</div>
            <div class="writing-card-title">${title}</div>
            <div class="writing-card-desc">${desc}</div>
            <span class="writing-card-read">Read <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
          </a>`;
}

async function main() {
  const res = await fetch(FEED_URL, {
    headers: { "User-Agent": "christinelau.ca-writing-updater/1.0" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch feed: ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();
  const items = parseItems(xml).slice(0, MAX_CARDS);

  if (items.length === 0) {
    console.log("No items found in feed — leaving index.html untouched.");
    return;
  }

  const cardsHtml = items.map(buildCardHtml).join("\n");
  const block = `${START_MARKER}\n${cardsHtml}\n          ${END_MARKER}`;

  const html = readFileSync(INDEX_PATH, "utf8");
  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `Could not find ${START_MARKER} / ${END_MARKER} markers in ${INDEX_PATH}. ` +
      `Add them around the writing-cards content (see README).`
    );
  }

  const before = html.slice(0, startIdx);
  const after = html.slice(endIdx + END_MARKER.length);
  const newHtml = before + block + after;

  if (newHtml === html) {
    console.log("No changes — writing cards already up to date.");
    return;
  }

  writeFileSync(INDEX_PATH, newHtml, "utf8");
  console.log(`Updated ${INDEX_PATH} with ${items.length} article(s) from Medium.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
