// Research Hub - Standalone Server (No PostgreSQL needed)
// Uses built-in data file instead of a database

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// ─── Load Data ───────────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, 'data.json');
let DB = { categories: [], papers: [] };
try {
  DB = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`✅ Loaded ${DB.papers.length} papers, ${DB.categories.length} categories`);
} catch (e) {
  console.error('❌ Could not load data.json:', e.message);
  process.exit(1);
}

// Build category lookup
const catById = {};
DB.categories.forEach(c => { catById[c.id] = c; });

// Add categoryName to every paper
DB.papers.forEach(p => {
  p.categoryName = catById[p.categoryId]?.name || '';
  p.createdAt = new Date().toISOString();
  // Ensure pdfUrl ends with .pdf for arxiv
  if (p.pdfUrl && p.pdfUrl.includes('arxiv.org/pdf/') && !p.pdfUrl.endsWith('.pdf')) {
    p.pdfUrl = p.pdfUrl + '.pdf';
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000');
const PUBLIC = path.join(__dirname, 'dist', 'public');

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.txt': 'text/plain',
  '.pdf': 'application/pdf', '.ico': 'image/x-icon',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};

function sendJSON(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

function sendError(res, msg, status = 500) {
  sendJSON(res, { error: msg }, status);
}

function matchText(text, q) {
  return text && text.toLowerCase().includes(q.toLowerCase());
}

// ─── API Routes ───────────────────────────────────────────────────────────────
function handleAPI(req, res, pathname, query) {
  // GET /api/papers
  if (pathname === '/api/papers' && req.method === 'GET') {
    let papers = [...DB.papers];

    const q = query.q;
    const category = query.category;
    const year = query.year ? Number(query.year) : null;
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(500, Math.max(1, Number(query.limit || 20)));

    if (q) {
      // نقسّم البحث لكلمات منفصلة، والبحث ينجح لو كل كلمة موجودة في أي حقل
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      papers = papers.filter(p => {
        const haystack = [
          p.title || '',
          p.abstract || '',
          (p.authors || []).join(' '),
          (p.keywords || []).join(' '),
          p.journal || '',
        ].join(' ').toLowerCase();
        return terms.every(t => haystack.includes(t));
      });
    }
    if (category) {
      const cat = DB.categories.find(c => c.slug === category);
      if (cat) papers = papers.filter(p => p.categoryId === cat.id);
    }
    if (year) {
      papers = papers.filter(p => p.year === year);
    }

    papers.sort((a, b) => b.citationCount - a.citationCount);
    const total = papers.length;
    const offset = (page - 1) * limit;
    const sliced = papers.slice(offset, offset + limit);

    return sendJSON(res, { papers: sliced, total, page, limit });
  }

  // GET /api/papers/featured
  if (pathname === '/api/papers/featured' && req.method === 'GET') {
    const featured = DB.papers
      .filter(p => p.isFeatured)
      .sort((a, b) => b.citationCount - a.citationCount)
      .slice(0, 8);
    return sendJSON(res, featured);
  }

  // GET /api/papers/stats
  if (pathname === '/api/papers/stats' && req.method === 'GET') {
    const thisYear = new Date().getFullYear();
    const allAuthors = new Set();
    DB.papers.forEach(p => p.authors.forEach(a => allAuthors.add(a)));
    const totalDownloads = DB.papers.reduce((s, p) => s + p.downloadCount, 0);
    const totalViews = DB.papers.reduce((s, p) => s + (p.viewCount || 0), 0);
    const papersThisYear = DB.papers.filter(p => p.year >= thisYear - 1).length;
    return sendJSON(res, {
      totalPapers: DB.papers.length,
      totalDownloads,
      totalViews,
      totalAuthors: allAuthors.size,
      totalCategories: DB.categories.length,
      papersThisYear,
    });
  }

  // GET /api/papers/:id/related
  const relatedMatch = pathname.match(/^\/api\/papers\/(\d+)\/related$/);
  if (relatedMatch && req.method === 'GET') {
    const id = Number(relatedMatch[1]);
    const paper = DB.papers.find(p => p.id === id);
    if (!paper) return sendError(res, 'Not found', 404);
    const related = DB.papers
      .filter(p => p.id !== id && p.categoryId === paper.categoryId)
      .sort((a, b) => b.citationCount - a.citationCount)
      .slice(0, 6);
    return sendJSON(res, related);
  }

  // POST /api/papers/:id/download
  const dlMatch = pathname.match(/^\/api\/papers\/(\d+)\/download$/);
  if (dlMatch && req.method === 'POST') {
    const id = Number(dlMatch[1]);
    const paper = DB.papers.find(p => p.id === id);
    if (paper) {
      paper.downloadCount++;
      paper.viewCount = (paper.viewCount || 0) + 1;
      // Save to disk so numbers persist after restart
      try {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ categories: DB.categories, papers: DB.papers }, null, 2));
      } catch(e) {
        console.error('Could not save data:', e.message);
      }
    }
    return sendJSON(res, { success: true });
  }

  // GET /api/papers/:id
  const paperMatch = pathname.match(/^\/api\/papers\/(\d+)$/);
  if (paperMatch && req.method === 'GET') {
    const id = Number(paperMatch[1]);
    const paper = DB.papers.find(p => p.id === id);
    if (!paper) return sendError(res, 'Not found', 404);
    // Increment view count on every visit
    paper.viewCount = (paper.viewCount || 0) + 1;
    // Save immediately so the number is never lost
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify({ categories: DB.categories, papers: DB.papers }, null, 2));
    } catch(e) {}
    return sendJSON(res, paper);
  }

  // GET /api/categories
  if (pathname === '/api/categories' && req.method === 'GET') {
    return sendJSON(res, DB.categories);
  }

  return sendError(res, 'Not found', 404);
}

// ─── Static Files ─────────────────────────────────────────────────────────────
function serveStatic(res, filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch {
    // SPA fallback
    try {
      const html = fs.readFileSync(path.join(PUBLIC, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }
}

// ─── Main Server ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query = parsed.query;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  // API
  if (pathname.startsWith('/api/')) {
    return handleAPI(req, res, pathname, query);
  }

  // Static files
  let filePath = path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname);
  serveStatic(res, filePath);
});

server.listen(PORT, () => {
  console.log(`\n🚀 Research Hub running at: http://localhost:${PORT}`);
  console.log(`   Press Ctrl+C to stop.\n`);
});
