const CONFIG = {
  owner: 'anandkumarjha11110',
  repo: 'geopolis-site',
  branch: 'main',
  articleDir: 'content/articles',
  dissertationDir: 'content/dissertations',
  teamDir: 'content/team',
  eventsDir: 'content/events'
};

const ARTICLE_FORM_URL = 'submit-article.html';
const MEMBERSHIP_FORM_URL = 'membership.html';

function parseFrontmatter(markdown) {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: normalized };
  const data = {};
  match[1].split('\n').forEach((line) => {
    const idx = line.indexOf(':');
    if (idx > -1) {
      const key = line.slice(0, idx).trim();
      data[key] = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
    }
  });
  return { data, body: match[2].trim() };
}

function slugFromPath(path) { return path.split('/').pop().replace(/\.md$/i, ''); }
function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || 'Undated';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}
function readTime(body) {
  const words = body.split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 220))} min read`;
}

function escapeHtml(text = '') {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function renderMarkdown(md) {
  const escaped = escapeHtml(md)
    .replace(/^###\s+(.*)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.*)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.*)$/gm, '<h1>$1</h1>')
    .replace(/^>\s+(.*)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  const lines = escaped.split('\n');
  let inList = false;
  const html = lines.map((line) => {
    if (/^\s*[-*]\s+/.test(line)) {
      const item = line.replace(/^\s*[-*]\s+/, '');
      if (!inList) { inList = true; return `<ul><li>${item}</li>`; }
      return `<li>${item}</li>`;
    }
    if (inList) { inList = false; return `</ul>${line.trim() ? `<p>${line}</p>` : ''}`; }
    if (!line.trim()) return '';
    if (/^<h\d|^<blockquote/.test(line)) return line;
    return `<p>${line}</p>`;
  }).join('');

  return inList ? `${html}</ul>` : html;
}

async function fetchMarkdownByUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url}`);
  return res.text();
}

async function getCollectionIndex(dir) {
  const api = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${dir}`;
  const response = await fetch(api, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) return [];
  const payload = await response.json();
  return payload.filter((item) => item.type === 'file' && item.name.endsWith('.md')).map((file) => ({
    slug: slugFromPath(file.path),
    path: file.path,
    url: file.download_url || `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}/${file.path}`
  }));
}

function syncFormLinks() {
  document.querySelectorAll('[data-submit-article-link]').forEach((link) => link.setAttribute('href', ARTICLE_FORM_URL));
  document.querySelectorAll('[data-membership-link]').forEach((link) => link.setAttribute('href', MEMBERSHIP_FORM_URL));
}

function setupNav() {
  const btn = document.getElementById('navToggle');
  const menu = document.getElementById('mobileMenu');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
}

function citeAPA(article) {
  const year = article.date ? new Date(article.date).getFullYear() : 'n.d.';
  return `${article.author} (${year}). ${article.title}. GEOPOLIS Journal.`;
}
function citeMLA(article) {
  const date = article.date ? formatDate(article.date) : 'n.d.';
  return `${article.author}. "${article.title}." GEOPOLIS Journal, ${date}.`;
}

async function loadArticles() {
  const list = await getCollectionIndex(CONFIG.articleDir);
  const records = await Promise.all(list.map(async (item) => {
    const raw = await fetchMarkdownByUrl(item.url);
    const { data, body } = parseFrontmatter(raw);
    return {
      slug: item.slug,
      title: data.title || item.slug,
      author: data.author || 'GEOPOLIS Editorial Board',
      date: data.date || '',
      category: data.category || 'Research Articles',
      keywords: (data.keywords || '').split(',').map((k) => k.trim()).filter(Boolean),
      tags: (data.tags || '').split(',').map((k) => k.trim()).filter(Boolean),
      abstract: data.abstract || body.slice(0, 220),
      pdf: data.pdf || '',
      status: data.status || 'publish',
      body
    };
  }));

  return records.filter((a) => a.status !== 'draft').sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function loadDissertations() {
  const list = await getCollectionIndex(CONFIG.dissertationDir);
  const records = await Promise.all(list.map(async (item) => {
    const raw = await fetchMarkdownByUrl(item.url);
    const { data, body } = parseFrontmatter(raw);
    return {
      slug: item.slug,
      student: data.student || '',
      title: data.title || item.slug,
      supervisor: data.supervisor || '',
      batch: data.batch || '2024–26',
      topic: data.topic || 'General',
      abstract: data.abstract || body.slice(0, 200),
      pdf: data.pdf || ''
    };
  }));
  return records;
}

function updateAnalytics(key) {
  const all = JSON.parse(localStorage.getItem('geopolisAnalytics') || '{}');
  all[key] = (all[key] || 0) + 1;
  localStorage.setItem('geopolisAnalytics', JSON.stringify(all));
}

function renderFeaturedHome(articles) {
  const host = document.getElementById('featuredArticles');
  if (!host) return;
  const latest = articles.slice(0, 6);
  host.innerHTML = latest.map((a) => `
    <article class="article-card">
      <div class="meta"><span class="category-pill">${a.category}</span><span>${formatDate(a.date)}</span></div>
      <h3><a class="title-link" href="article.html?id=${encodeURIComponent(a.slug)}">${a.title}</a></h3>
      <p><strong>${a.author}</strong></p>
      <p>${escapeHtml(a.abstract).slice(0, 135)}...</p>
      <a class="btn btn--outline" href="article.html?id=${encodeURIComponent(a.slug)}">Read</a>
    </article>
  `).join('');
}

function renderJournal(articles, dissertations) {
  const host = document.getElementById('articlesGrid');
  if (!host) return;
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const cat = document.getElementById('categoryFilter')?.value || 'All';
  const batch = document.getElementById('batchFilter')?.value || 'All';

  const filteredArticles = articles.filter((a) => {
    const text = `${a.title} ${a.author} ${a.abstract} ${a.keywords.join(' ')}`.toLowerCase();
    const byQ = !q || text.includes(q);
    const byCat = cat === 'All' || a.category === cat;
    return byQ && byCat;
  });

  const filteredDissertations = dissertations.filter((d) => {
    const text = `${d.student} ${d.title} ${d.abstract} ${d.topic}`.toLowerCase();
    const byQ = !q || text.includes(q);
    const byBatch = batch === 'All' || d.batch === batch;
    return byQ && byBatch;
  });

  const articleHtml = filteredArticles.map((a) => `
    <article class="article-card">
      <div class="meta"><span class="category-pill">${a.category}</span><span>${formatDate(a.date)}</span></div>
      <h3><a class="title-link" href="article.html?id=${encodeURIComponent(a.slug)}">${a.title}</a></h3>
      <p>${a.author} · ${readTime(a.body)}</p>
      <p>${escapeHtml(a.abstract).slice(0, 160)}...</p>
      <a class="btn btn--outline" href="article.html?id=${encodeURIComponent(a.slug)}">Open Article</a>
    </article>
  `).join('');

  const disserHost = document.getElementById('dissertationGrid');
  if (disserHost) {
    disserHost.innerHTML = filteredDissertations.map((d) => `
      <article class="article-card">
        <div class="meta"><span class="category-pill">Dissertation ${d.batch}</span><span>${d.topic}</span></div>
        <h3>${d.title}</h3>
        <p><strong>${d.student}</strong> · Supervisor: ${d.supervisor}</p>
        <p>${escapeHtml(d.abstract).slice(0, 160)}...</p>
        ${d.pdf ? `<a class="btn btn--ghost" href="${d.pdf}" target="_blank" rel="noopener">Download PDF</a>` : ''}
      </article>
    `).join('') || '<div class="empty-state">No dissertations match your current filters.</div>';
  }

  host.innerHTML = articleHtml || '<div class="empty-state">No journal entries match your current filters.</div>';
}

async function loadJournalPage() {
  const host = document.getElementById('articlesGrid');
  if (!host) return;
  host.innerHTML = '<p>Loading publications...</p>';
  const [articles, dissertations] = await Promise.all([loadArticles(), loadDissertations()]);
  const render = () => renderJournal(articles, dissertations);
  ['searchInput', 'categoryFilter', 'batchFilter'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', render);
    if (el) el.addEventListener('change', render);
  });
  render();
}

async function loadArticlePage() {
  const host = document.getElementById('articleContainer');
  if (!host) return;
  const slug = new URLSearchParams(window.location.search).get('id');
  if (!slug) {
    host.innerHTML = '<div class="empty-state">Missing article ID.</div>';
    return;
  }

  const articles = await loadArticles();
  const article = articles.find((a) => a.slug === slug);
  if (!article) {
    host.innerHTML = '<div class="empty-state">Article not found.</div>';
    return;
  }

  updateAnalytics(`article:${slug}`);
  const related = articles.filter((a) => a.slug !== slug && (a.category === article.category || a.tags.some((t) => article.tags.includes(t)))).slice(0, 3);

  host.innerHTML = `
    <header class="article-header">
      <p class="kicker">${article.category}</p>
      <h1>${article.title}</h1>
      <p class="meta">By ${article.author} · ${formatDate(article.date)} · ${readTime(article.body)}</p>
      <p><strong>Keywords:</strong> ${article.keywords.join(', ') || 'General'}</p>
      <p><strong>Abstract:</strong> ${article.abstract}</p>
      <div class="btn-row">
        ${article.pdf ? `<a class="btn btn--gold" href="${article.pdf}" target="_blank" rel="noopener">Download PDF</a>` : ''}
        <button id="copyApa" class="btn btn--ghost" type="button">Copy APA</button>
        <button id="copyMla" class="btn btn--ghost" type="button">Copy MLA</button>
        <button id="readingMode" class="btn btn--outline" type="button">Reading Mode</button>
        <a class="btn btn--ghost" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}" target="_blank" rel="noopener">Share</a>
      </div>
      <small id="citeMsg"></small>
    </header>
    <article class="article-body">${renderMarkdown(article.body)}</article>
    <section class="section" style="padding-bottom:0.5rem;">
      <h3>Related Articles</h3>
      <div class="grid grid-3">${related.map((r) => `<a class="card" href="article.html?id=${encodeURIComponent(r.slug)}"><strong>${r.title}</strong><p>${r.author}</p></a>`).join('') || '<p>No related entries yet.</p>'}</div>
    </section>
  `;

  const msg = document.getElementById('citeMsg');
  const copy = async (text) => {
    await navigator.clipboard.writeText(text);
    msg.textContent = 'Citation copied.';
  };

  document.getElementById('copyApa')?.addEventListener('click', () => copy(citeAPA(article)));
  document.getElementById('copyMla')?.addEventListener('click', () => copy(citeMLA(article)));
  document.getElementById('readingMode')?.addEventListener('click', () => document.body.classList.toggle('article-reading'));
}

async function loadTeamPage() {
  const host = document.getElementById('teamGrid');
  if (!host) return;
  const list = await getCollectionIndex(CONFIG.teamDir);
  if (!list.length) {
    host.innerHTML = '<div class="empty-state">No team members added yet.</div>';
    return;
  }
  const members = await Promise.all(list.map(async (item) => {
    const raw = await fetchMarkdownByUrl(item.url);
    const { data, body } = parseFrontmatter(raw);
    return { ...data, body };
  }));
  members.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  host.innerHTML = members.map((m) => `
    <article class="card">
      ${(m.image || m.photo) ? `<img loading="lazy" src="${m.image || m.photo}" alt="${m.name}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;">` : `<div style="width:72px;height:72px;border-radius:50%;background:#dce4f5;display:grid;place-items:center;font-weight:700;">${(m.name || 'G').slice(0,1)}</div>`}
      <h3>${m.name}</h3>
      <p><strong>${m.role}</strong></p>
      <p>${m.course_year || ''}</p>
      <p>${m.research_interests || ''}</p>
      <p>${m.bio || m.body || ''}</p>
    </article>
  `).join('');
}

async function loadEventsPage() {
  const upcoming = document.getElementById('upcomingEvents');
  const past = document.getElementById('pastEvents');
  const slider = document.getElementById('eventSlider');
  if (!upcoming && !past && !slider) return;

  const list = await getCollectionIndex(CONFIG.eventsDir);
  if (!list.length) return;
  const records = await Promise.all(list.map(async (item) => {
    const raw = await fetchMarkdownByUrl(item.url);
    const { data, body } = parseFrontmatter(raw);
    return { ...data, body, when: new Date(data.date) };
  }));

  records.sort((a, b) => a.when - b.when);
  const now = new Date();
  const up = records.filter((e) => e.when >= now);
  const pa = records.filter((e) => e.when < now).reverse();
  const card = (e) => `
    <article class="card">
      ${e.poster ? `<img loading="lazy" class="event-poster" src="${e.poster}" alt="Poster for ${e.title}">` : ''}
      <h3>${e.title}</h3>
      <p><strong>${formatDate(e.date)}</strong> · ${e.speaker || 'GEOPOLIS'}</p>
      <p>${e.description || e.body || ''}</p>
    </article>`;

  if (upcoming) upcoming.innerHTML = up.map(card).join('') || '<div class="empty-state">No upcoming events.</div>';
  if (past) past.innerHTML = pa.map(card).join('') || '<div class="empty-state">No past events yet.</div>';
  if (slider) slider.innerHTML = up.slice(0, 5).map(card).join('') || '<div class="empty-state">Event updates coming soon.</div>';
}

function loadAnalytics() {
  const host = document.getElementById('analyticsDashboard');
  if (!host) return;
  const all = JSON.parse(localStorage.getItem('geopolisAnalytics') || '{}');
  const entries = Object.entries(all).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  host.innerHTML = `
    <div class="metric"><small>Total article reads</small><strong>${total}</strong></div>
    ${entries.slice(0, 5).map(([k, v]) => `<div class="metric"><small>${k.replace('article:', '')}</small><strong>${v}</strong></div>`).join('')}
  `;
}

async function initHome() {
  const featured = document.getElementById('featuredArticles');
  if (!featured) return;
  const articles = await loadArticles();
  renderFeaturedHome(articles);
  loadEventsPage();
}

document.addEventListener('DOMContentLoaded', async () => {
  syncFormLinks();
  setupNav();
  await Promise.allSettled([initHome(), loadJournalPage(), loadArticlePage(), loadTeamPage(), loadEventsPage()]);
  loadAnalytics();
});
