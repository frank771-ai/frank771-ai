import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const username = process.env.GITHUB_REPOSITORY_OWNER || process.env.PROFILE_USERNAME || "frank771-ai";
const token = process.env.GITHUB_TOKEN || "";
const outputPath = resolve(process.env.DASHBOARD_OUTPUT || "assets/activity-dashboard.svg");
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": `${username}-profile-dashboard`,
  "X-GitHub-Api-Version": "2022-11-28",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${path}`);
  return response.json();
}

const xml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const shortName = (value, size = 25) => value.length > size ? `${value.slice(0, size - 1)}…` : value;
const number = (value) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);

const user = await github(`/users/${username}`);
const repositories = (await github(`/users/${username}/repos?per_page=100&sort=pushed&direction=desc`))
  .filter((repo) => !repo.fork);

const languageResults = await Promise.all(repositories.map(async (repo) => {
  try {
    return await github(`/repos/${repo.full_name}/languages`);
  } catch {
    return {};
  }
}));

const languageTotals = {};
for (const result of languageResults) {
  for (const [language, bytes] of Object.entries(result)) {
    languageTotals[language] = (languageTotals[language] || 0) + bytes;
  }
}

const palette = ["#00e5ff", "#3b82f6", "#8b5cf6", "#ff3cac", "#f59e0b", "#22c55e"];
const languages = Object.entries(languageTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
const totalBytes = Math.max(1, languages.reduce((sum, [, bytes]) => sum + bytes, 0));
const now = new Date();
const activeSince = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
const activeRepos = repositories.filter((repo) => new Date(repo.pushed_at) >= activeSince).length;
const featured = repositories.filter((repo) => repo.name !== username).slice(0, 4);
const lastPush = featured[0]?.pushed_at ? new Date(featured[0].pushed_at) : null;
const lastPushLabel = lastPush ? lastPush.toISOString().slice(0, 10) : "—";
const generatedLabel = now.toISOString().replace("T", " ").slice(0, 16) + " UTC";

let languageX = 76;
const languageSegments = languages.map(([language, bytes], index) => {
  const width = Math.max(18, Math.round((bytes / totalBytes) * 560));
  const segment = `<rect x="${languageX}" y="404" width="${width}" height="14" rx="7" fill="${palette[index]}"/>`;
  languageX += width + 5;
  return segment;
}).join("");

const languageLegend = languages.map(([language, bytes], index) => {
  const x = 76 + (index % 3) * 205;
  const y = 454 + Math.floor(index / 3) * 34;
  const percentage = Math.round((bytes / totalBytes) * 100);
  return `<circle cx="${x}" cy="${y - 4}" r="5" fill="${palette[index]}"/><text x="${x + 13}" y="${y}" class="small">${xml(language)} ${percentage}%</text>`;
}).join("");

const projectRows = featured.map((repo, index) => {
  const y = 170 + index * 78;
  const color = palette[index % palette.length];
  const pushed = repo.pushed_at ? new Date(repo.pushed_at).toISOString().slice(0, 10) : "—";
  return `<g transform="translate(748 ${y})">
    <rect width="576" height="58" rx="14" class="panel"/>
    <rect width="5" height="58" rx="3" fill="${color}"/>
    <circle cx="30" cy="29" r="8" fill="${color}" filter="url(#softGlow)"/>
    <text x="52" y="25" class="repo">${xml(shortName(repo.name))}</text>
    <text x="52" y="44" class="micro">${xml(repo.language || "multi-stack")} · push ${pushed}</text>
    <text x="548" y="34" text-anchor="end" class="micro">★ ${number(repo.stargazers_count)}</text>
  </g>`;
}).join("");

const bars = Array.from({ length: 20 }, (_, index) => {
  const repo = repositories[index % Math.max(1, repositories.length)];
  const seed = repo ? (repo.name.length * 11 + index * 17 + new Date(repo.pushed_at).getUTCDate()) : index * 9;
  const height = 20 + (seed % 92);
  const x = 80 + index * 30;
  const y = 358 - height;
  return `<rect x="${x}" y="${y}" width="15" height="${height}" rx="7" fill="${palette[index % palette.length]}" opacity="${0.45 + (index % 4) * 0.13}"><animate attributeName="height" values="${height};${Math.min(125, height + 14)};${height}" dur="12s" begin="-${index * 0.35}s" repeatCount="indefinite"/><animate attributeName="y" values="${y};${y - 14};${y}" dur="12s" begin="-${index * 0.35}s" repeatCount="indefinite"/></rect>`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="620" viewBox="0 0 1400 620" role="img" aria-labelledby="title desc">
  <title id="title">GitHub activity dashboard for ${xml(username)}</title>
  <desc id="desc">A self-generated dashboard showing public repositories, active projects, followers, languages and recent repositories.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#050816"/><stop offset=".55" stop-color="#0c1026"/><stop offset="1" stop-color="#17091f"/></linearGradient>
    <linearGradient id="spectrum" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#00e5ff"/><stop offset=".3" stop-color="#3b82f6"/><stop offset=".55" stop-color="#8b5cf6"/><stop offset=".8" stop-color="#ff3cac"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#60a5fa" stroke-opacity=".045"/></pattern>
    <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <style>
    .ui{font-family:Inter,Segoe UI,Arial,sans-serif}.mono{font-family:Consolas,Cascadia Code,monospace}.label{font:700 12px Inter,Segoe UI,Arial,sans-serif;letter-spacing:1.5px;fill:#7890ad}.value{font:800 32px Inter,Segoe UI,Arial,sans-serif;fill:#f2f7ff}.small{font:600 13px Inter,Segoe UI,Arial,sans-serif;fill:#aabbd0}.micro{font:12px Consolas,Cascadia Code,monospace;fill:#8295ad}.repo{font:700 15px Inter,Segoe UI,Arial,sans-serif;fill:#e9f3ff}.panel{fill:#090e1d;stroke:#263755}.dash{stroke-dasharray:6 13;animation:dash 12s linear infinite}.pulse{animation:pulse 12s ease-in-out infinite}@keyframes dash{to{stroke-dashoffset:-90}}@keyframes pulse{50%{opacity:.28}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}
  </style>
  <rect x="1" y="1" width="1398" height="618" rx="28" fill="url(#bg)" stroke="#293b63" stroke-width="2"/><rect x="1" y="1" width="1398" height="618" rx="28" fill="url(#grid)"/>
  <path d="M32 91H1368" stroke="url(#spectrum)" stroke-width="3" class="dash"/>
  <text x="48" y="52" class="ui" font-size="22" font-weight="800" fill="#eff8ff" letter-spacing="2">GITHUB SIGNAL // LIVE</text><circle cx="318" cy="45" r="6" fill="#22c55e" filter="url(#softGlow)" class="pulse"/>
  <text x="1350" y="51" text-anchor="end" class="micro">AUTO-GENERATED · ${generatedLabel}</text>
  <g transform="translate(48 118)">
    <g><rect width="155" height="92" rx="18" class="panel"/><text x="18" y="29" class="label">PUBLIC REPOS</text><text x="18" y="70" class="value" fill="#22d3ee">${number(user.public_repos)}</text></g>
    <g transform="translate(170)"><rect width="155" height="92" rx="18" class="panel"/><text x="18" y="29" class="label">ACTIVE 90D</text><text x="18" y="70" class="value" fill="#60a5fa">${number(activeRepos)}</text></g>
    <g transform="translate(340)"><rect width="155" height="92" rx="18" class="panel"/><text x="18" y="29" class="label">FOLLOWERS</text><text x="18" y="70" class="value" fill="#c084fc">${number(user.followers)}</text></g>
    <g transform="translate(510)"><rect width="155" height="92" rx="18" class="panel"/><text x="18" y="29" class="label">LAST PUSH</text><text x="18" y="67" class="mono" font-size="17" font-weight="700" fill="#f472b6">${lastPushLabel}</text></g>
  </g>
  <text x="76" y="249" class="label">ACTIVITY WAVE // REPOSITORY SIGNAL</text>${bars}
  <text x="76" y="390" class="label">LANGUAGE SPECTRUM</text>${languageSegments}${languageLegend}
  <g transform="translate(748 118)"><text class="label">RECENTLY UPDATED</text></g>${projectRows}
  <g transform="translate(748 505)"><rect width="576" height="68" rx="18" fill="#080d1c" stroke="url(#spectrum)" stroke-opacity=".7"/><circle cx="30" cy="34" r="7" fill="#22c55e" filter="url(#softGlow)" class="pulse"/><text x="50" y="31" class="repo">DATA SOURCE: GITHUB REST API</text><text x="50" y="50" class="micro">No external stats-card service required</text><text x="548" y="39" text-anchor="end" class="micro">${xml(username)}</text></g>
</svg>`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, svg, "utf8");
console.log(`Generated ${outputPath} for ${username}`);
