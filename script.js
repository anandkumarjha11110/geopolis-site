const CONFIG = {
  owner: 'anandkumarjha11110',
  repo: 'geopolis-site',
  branch: 'main',
  contentDir: 'content/articles'
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
      const value = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
      data[key] = value;
    }
  });

  return { data, body: match[2].trim() };
}

function slugFromPath(path) {
  return path.split('/').pop().replace(/\.md$/i, '');
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || 'Undated';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

async function fetchMarkdownByUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url}`);
  return res.text();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function getArticleIndex() {
  const api = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.contentDir}`;
  const response = await fetch(api, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error('Unable to load articles from GitHub API.');
  const payload = await response.json();
  const files = payload.filter((item) => item.type === 'file' && item.name.endsWith('.md'));

  return files.map((file) => ({
    slug: slugFromPath(file.path),
    path: file.path,
    url: file.download_url || `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}/${file.path}`
  }));
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
      if (!inList) {
        inList = true;
        return `<ul><li>${item}</li>`;
      }
      return `<li>${item}</li>`;
    }

    if (inList) {
      inList = false;
      if (!line.trim()) return '</ul>';
      return `</ul>${line.trim() ? `<p>${line}</p>` : ''}`;
    }

    if (!line.trim()) return '';
    if (/^<h\d|^<blockquote/.test(line)) return line;
    return `<p>${line}</p>`;
  }).join('');

  return inList ? `${html}</ul>` : html;
}

function syncFormLinks() {
  document.querySelectorAll('[data-submit-article-link]').forEach((link) => {
    link.setAttribute('href', ARTICLE_FORM_URL);
  });
  document.querySelectorAll('[data-membership-link]').forEach((link) => {
    link.setAttribute('href', MEMBERSHIP_FORM_URL);
  });
}

async function loadJournalPage() {
  const container = document.getElementById('articlesGrid');
  if (!container) return;

  container.innerHTML = '<p>Loading articles…</p>';

  try {
    const list = await getArticleIndex();

    if (!list.length) {
      container.innerHTML = '<div class="empty-state">No articles yet. Use <strong>/admin</strong> to publish the first article.</div>';
      return;
    }

    const articles = await Promise.all(list.map(async (item) => {
      const raw = await fetchMarkdownByUrl(item.url);
      const { data, body } = parseFrontmatter(raw);
      const excerpt = body.slice(0, 190).replace(/[#>*_`-]/g, '').trim();

      return {
        slug: item.slug,
        title: data.title || item.slug,
        author: data.author || 'GEOPOLIS Editorial Board',
        date: data.date || '',
        category: data.category || 'General',
        excerpt: `${excerpt}${excerpt.length >= 180 ? '…' : ''}`
      };
    }));

    articles.sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = articles.map((article) => `
      <article class="article-card">
        <div class="meta"><span class="category">${article.category}</span><span>${formatDate(article.date)}</span></div>
        <h3>${article.title}</h3>
        <p><strong>${article.author}</strong></p>
        <p>${article.excerpt || 'Open the article to read more.'}</p>
        <a class="btn btn--outline" href="article.html?id=${encodeURIComponent(article.slug)}">Read Article</a>
      </article>
    `).join('');
  } catch (error) {
    container.innerHTML = `<div class="empty-state">Unable to load articles right now. ${error.message}</div>`;
  }
}

async function loadArticlePage() {
  const articleHost = document.getElementById('articleContainer');
  if (!articleHost) return;

  const slug = new URLSearchParams(window.location.search).get('id');
  if (!slug) {
    articleHost.innerHTML = '<div class="empty-state">Missing article ID. Return to the journal page and choose an article.</div>';
    return;
  }

  articleHost.innerHTML = '<p>Loading article…</p>';

  try {
    const list = await getArticleIndex();
    const target = list.find((item) => item.slug === slug);

    if (!target) {
      throw new Error('Article not found.');
    }

    const raw = await fetchMarkdownByUrl(target.url);
    const { data, body } = parseFrontmatter(raw);

    articleHost.innerHTML = `
      <header class="article-header">
        <p class="kicker">${data.category || 'Journal Article'}</p>
        <h1>${data.title || slug}</h1>
        <p class="meta">By ${data.author || 'GEOPOLIS Editorial Board'} · ${formatDate(data.date)}</p>
      </header>
      <article class="article-body">${renderMarkdown(body)}</article>
    `;
  } catch (error) {
    articleHost.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  syncFormLinks();
  loadJournalPage();
  loadArticlePage();
});
