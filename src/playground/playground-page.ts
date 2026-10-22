// String.raw keeps the backslashes in the inline script's regexes and '\n'
// literals. The script must not contain backticks or a dollar-brace sequence.
export function playgroundPage(): string {
  return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EduSearch API playground</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; color: #1c1917; background: #f6f3ee; }
    header { background: #1c1917; color: #fafaf9; padding: 20px; }
    header h1 { margin: 0 0 6px; font-size: 1.5rem; }
    header p { margin: 0; color: #d6d3d1; }
    nav { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
    nav a { color: #fde68a; text-decoration: none; border: 1px solid #57534e; border-radius: 999px; padding: 3px 10px; font-size: 0.85rem; }
    main { max-width: 1100px; margin: 0 auto; padding: 20px 20px 64px; }
    section { background: #fff; border: 1px solid #e7e5e4; border-radius: 10px; padding: 18px; margin: 18px 0; }
    h2 { margin: 0 0 4px; font-size: 1.2rem; }
    h3 { margin: 16px 0 8px; font-size: 1rem; }
    .hint { color: #57534e; font-size: 0.88rem; margin: 0 0 12px; }
    code { background: #f5f5f4; padding: 1px 5px; border-radius: 4px; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: #44403c; }
    input, select, textarea { font: inherit; padding: 7px 9px; border: 1px solid #d6d3d1; border-radius: 6px; background: #fff; }
    textarea { min-height: 70px; resize: vertical; }
    .row { display: flex; flex-wrap: wrap; gap: 12px; margin: 10px 0; align-items: flex-end; }
    .row > label { flex: 1 1 160px; }
    button { font: inherit; background: #1c1917; color: #fff; border: 0; border-radius: 6px; padding: 8px 14px; cursor: pointer; }
    button.secondary { background: #e7e5e4; color: #1c1917; }
    button:disabled { opacity: 0.5; cursor: wait; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
    .ok { background: #dcfce7; color: #166534; }
    .err { background: #fee2e2; color: #991b1b; }
    .warn { background: #fef3c7; color: #92400e; }
    .info { background: #e0e7ff; color: #3730a3; }
    .output { margin-top: 12px; }
    .output .line { display: flex; gap: 10px; align-items: center; font-size: 0.85rem; margin-bottom: 6px; }
    .panes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; background: #1c1917; color: #e7e5e4; padding: 10px; border-radius: 6px; font-size: 0.8rem; max-height: 360px; overflow: auto; }
    .card { border: 1px solid #e7e5e4; border-radius: 8px; padding: 10px 12px; margin: 8px 0; }
    .card .meta { font-size: 0.8rem; color: #57534e; margin-bottom: 4px; }
    .qtext { white-space: pre-wrap; }
    .answer { white-space: pre-wrap; background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 8px; padding: 12px; min-height: 48px; }
    .draft { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(200px, 0.7fr); gap: 12px; }
    .draft img { max-width: 100%; border: 1px solid #d6d3d1; }
    details summary { cursor: pointer; font-size: 0.85rem; color: #44403c; margin-top: 10px; }
    @media (max-width: 800px) { .panes, .draft { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>EduSearch API playground</h1>
    <p>Every panel calls this server and shows the exact request, status, time and raw response. Field rules are in docs/FRONTEND_API.md.</p>
    <nav>
      <a href="#health">Health</a>
      <a href="#search">Search &amp; answer</a>
      <a href="#chat">Chat stream</a>
      <a href="#create">Create question</a>
      <a href="#papers">PDF import</a>
    </nav>
  </header>
  <main>
    <section id="health">
      <h2>Health</h2>
      <p class="hint"><code>GET /health</code></p>
      <button id="health-btn" type="button">Check health</button>
      <div class="output" id="health-out"></div>
    </section>

    <section id="search">
      <h2>Search &amp; answer</h2>
      <p class="hint"><code>POST /questions/search</code>, <code>/questions/search/hybrid</code>, <code>/questions/search/rewritten</code> (experiment), <code>/questions/answer</code>. Search, hybrid, rewritten and answer use the same body. Subject must match the stored subject exactly, including case. Rewritten search does not change production search or answer.</p>
      <form id="search-form">
        <label>Query <textarea name="query" maxlength="1000" required placeholder="e.g. Newton's second law"></textarea></label>
        <div class="row">
          <label>Subject <input name="subject" placeholder="Physics"></label>
          <label>Exam year <input name="examYear" type="number" min="1950" max="2100"></label>
          <label>Difficulty
            <select name="difficulty"><option value="">Any</option><option>EASY</option><option>MEDIUM</option><option>HARD</option></select>
          </label>
          <label>Limit <input name="limit" type="number" min="1" max="20" value="5"></label>
        </div>
        <div class="row">
          <button type="submit" data-path="/questions/search">Search</button>
          <button type="submit" data-path="/questions/search/hybrid">Hybrid search</button>
          <button type="submit" data-path="/questions/search/rewritten">Rewritten search</button>
          <button type="submit" data-path="/questions/answer">Answer</button>
        </div>
      </form>
      <div id="search-view"></div>
      <div class="output" id="search-out"></div>
    </section>

    <section id="chat">
      <h2>Chat stream</h2>
      <p class="hint"><code>POST /api/chat</code>. The response streams as Server-Sent Events in the Vercel AI SDK format. The text below is the raw Markdown the frontend should render (with KaTeX for <code>$^{8}$</code>).</p>
      <form id="chat-form">
        <label>Message <textarea name="text" maxlength="1000" required placeholder="What speed of light does the paper state?"></textarea></label>
        <div class="row">
          <label>filters.subject <input name="subject" placeholder="Physics"></label>
          <label>filters.year <input name="year" type="number" min="1950" max="2100"></label>
          <label>filters.difficulty
            <select name="difficulty"><option value="">Any</option><option>Easy</option><option>Medium</option><option>Hard</option></select>
          </label>
        </div>
        <div class="row">
          <button type="submit">Send</button>
          <button type="button" class="secondary" id="chat-stop" disabled>Stop</button>
        </div>
      </form>
      <div class="output">
        <div class="line" id="chat-line"></div>
        <div class="answer" id="chat-answer"></div>
        <div id="chat-sources"></div>
        <details open><summary>Stream events</summary><pre id="chat-events"></pre></details>
        <details><summary>Request body</summary><pre id="chat-request"></pre></details>
      </div>
    </section>

    <section id="create">
      <h2>Create question</h2>
      <p class="hint"><code>POST /questions</code>. Embeds the text with OpenAI and saves it to the database.</p>
      <form id="create-form">
        <label>Question text <textarea name="questionText" maxlength="4000" required></textarea></label>
        <div class="row">
          <label>Subject * <input name="subject" required maxlength="200"></label>
          <label>Topic * <input name="topic" required maxlength="200"></label>
          <label>Subtopic <input name="subtopic" maxlength="200"></label>
        </div>
        <div class="row">
          <label>Exam year <input name="examYear" type="number" min="1950" max="2100"></label>
          <label>Exam type <input name="examType" maxlength="100" placeholder="board"></label>
          <label>Difficulty *
            <select name="difficulty"><option>EASY</option><option selected>MEDIUM</option><option>HARD</option></select>
          </label>
          <label>Question type *
            <select name="questionType"><option>MCQ</option><option selected>SHORT</option><option>LONG</option></select>
          </label>
        </div>
        <div class="row">
          <label>Source document <input name="sourceDocument" maxlength="500"></label>
          <label>Page reference <input name="pageReference" maxlength="50"></label>
        </div>
        <button type="submit">Create</button>
      </form>
      <div class="output" id="create-out"></div>
    </section>

    <section id="papers">
      <h2>PDF import</h2>
      <p class="hint">Step 1 <code>POST /papers/extract</code> reads the PDF and saves nothing. Step 2 <code>POST /papers/approve</code> sends the same PDF plus the drafts you keep, then embeds and saves them.</p>
      <h3>1. Extract</h3>
      <form id="extract-form" class="row">
        <label>PDF (max 10 MB, 30 pages) <input id="pdf-file" type="file" accept="application/pdf,.pdf" required></label>
        <button type="submit">Extract drafts</button>
      </form>
      <div class="output" id="extract-out"></div>
      <div id="drafts"></div>

      <div id="approve-block" hidden>
        <h3>2. Approve</h3>
        <form id="approve-form">
          <div class="row">
            <label>Subject * <input name="subject" required maxlength="200"></label>
            <label>Topic * <input name="topic" required maxlength="200"></label>
            <label>Subtopic (default) <input name="subtopic" maxlength="200"></label>
          </div>
          <div class="row">
            <label>Exam year <input name="examYear" type="number" min="1950" max="2100"></label>
            <label>Exam type <input name="examType" maxlength="100"></label>
            <label>Difficulty *
              <select name="difficulty"><option>EASY</option><option selected>MEDIUM</option><option>HARD</option></select>
            </label>
            <label>Question type *
              <select name="questionType"><option>MCQ</option><option selected>SHORT</option><option>LONG</option></select>
            </label>
          </div>
          <button type="submit">Approve selected drafts</button>
        </form>
        <div class="output" id="approve-out"></div>
      </div>
    </section>
  </main>

  <script>
    const $ = (selector) => document.querySelector(selector);

    function escapeHtml(text) {
      return String(text == null ? '' : text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function richText(text) {
      return escapeHtml(text)
        .replace(/\^\{([^}]{1,8})\}/g, '<sup>$1</sup>')
        .replace(/_\{([^}]{1,8})\}/g, '<sub>$1</sub>');
    }

    function textOrNull(value) {
      const trimmed = String(value == null ? '' : value).trim();
      return trimmed === '' ? null : trimmed;
    }

    function intOrNull(value) {
      const trimmed = String(value == null ? '' : value).trim();
      return trimmed === '' ? null : Number(trimmed);
    }

    function compact(object) {
      const result = {};
      for (const key of Object.keys(object)) {
        if (object[key] !== null && object[key] !== undefined) result[key] = object[key];
      }
      return result;
    }

    async function call(method, path, body, isForm) {
      const init = { method: method };
      if (body !== undefined) {
        if (isForm) {
          init.body = body;
        } else {
          init.headers = { 'Content-Type': 'application/json' };
          init.body = JSON.stringify(body);
        }
      }
      const started = performance.now();
      try {
        const response = await fetch(path, init);
        const text = await response.text();
        let parsed = text;
        try { parsed = JSON.parse(text); } catch (ignored) {}
        return { status: response.status, ms: Math.round(performance.now() - started), body: parsed };
      } catch (error) {
        return { status: 0, ms: Math.round(performance.now() - started), body: 'Network error: ' + error.message };
      }
    }

    function show(target, method, path, requestBody, result) {
      const ok = result.status >= 200 && result.status < 300;
      target.innerHTML =
        '<div class="line"><span class="badge ' + (ok ? 'ok' : 'err') + '">' + (result.status || 'ERR') + '</span>' +
        '<code>' + method + ' ' + escapeHtml(path) + '</code><span>' + result.ms + ' ms</span></div>' +
        '<div class="panes">' +
        '<div><div class="line">Request</div><pre>' + escapeHtml(requestBody === undefined ? '(no body)' : JSON.stringify(requestBody, null, 2)) + '</pre></div>' +
        '<div><div class="line">Response</div><pre>' + escapeHtml(typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2)) + '</pre></div>' +
        '</div>';
    }

    async function busy(button, task) {
      button.disabled = true;
      try { await task(); } finally { button.disabled = false; }
    }

    // Health
    $('#health-btn').addEventListener('click', (event) => busy(event.target, async () => {
      const result = await call('GET', '/health');
      show($('#health-out'), 'GET', '/health', undefined, result);
    }));

    // Search, hybrid search, answer
    $('#search-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const path = event.submitter.dataset.path;
      const data = new FormData(event.target);
      const body = compact({
        query: textOrNull(data.get('query')),
        subject: textOrNull(data.get('subject')),
        examYear: intOrNull(data.get('examYear')),
        difficulty: textOrNull(data.get('difficulty')),
        limit: intOrNull(data.get('limit')),
      });
      busy(event.submitter, async () => {
        $('#search-view').innerHTML = '<p class="hint">Waiting for ' + path + '…</p>';
        const result = await call('POST', path, body);
        show($('#search-out'), 'POST', path, body, result);
        renderSearch(path, result);
      });
    });

    function renderSearch(path, result) {
      const view = $('#search-view');
      if (result.status < 200 || result.status >= 300) {
        view.innerHTML = '<p><span class="badge err">Error</span> ' + escapeHtml(result.body && result.body.message || result.body) + '</p>';
        return;
      }
      const body = result.body;
      if (path === '/questions/search') {
        view.innerHTML = body.results.length === 0 ? '<p class="hint">No results.</p>' : body.results.map((hit) =>
          '<div class="card"><div class="meta">score ' + hit.score.toFixed(3) + ' · ' + escapeHtml(hit.subject) + ' · ' + escapeHtml(hit.topic) +
          (hit.examYear ? ' · ' + hit.examYear : '') + ' · ' + hit.difficulty + ' · ' + hit.questionType +
          (hit.pageReference ? ' · page ' + escapeHtml(hit.pageReference) : '') + '</div>' +
          '<div class="qtext">' + richText(hit.questionText) + '</div></div>').join('');
        return;
      }
      if (path === '/questions/search/hybrid') {
        view.innerHTML = '<h3>Hybrid (fused)</h3>' + (body.hybrid.length === 0 ? '<p class="hint">No results.</p>' : body.hybrid.map((hit) =>
          '<div class="card"><div class="meta">#' + hit.rank + ' · vector rank ' + (hit.vectorRank == null ? '–' : hit.vectorRank) +
          ' · keyword rank ' + (hit.lexicalRank == null ? '–' : hit.lexicalRank) +
          (hit.pageReference ? ' · page ' + escapeHtml(hit.pageReference) : '') + '</div>' +
          '<div class="qtext">' + richText(hit.questionText) + '</div></div>').join(''));
        return;
      }
      if (path === '/questions/search/rewritten') {
        function hitCards(title, hits) {
          return '<h3>' + title + '</h3>' + (hits.length === 0 ? '<p class="hint">No results.</p>' : hits.map((hit, index) =>
            '<div class="card"><div class="meta">#' + (index + 1) + ' · score ' + hit.score.toFixed(3) +
            (hit.pageReference ? ' · page ' + escapeHtml(hit.pageReference) : '') + '</div>' +
            '<div class="qtext">' + richText(hit.questionText) + '</div></div>').join(''));
        }
        view.innerHTML =
          '<p><span class="badge ' + (body.rewritten ? 'ok' : 'warn') + '">' +
          (body.rewritten ? 'rewritten' : 'fallback to original') + '</span></p>' +
          '<p class="hint">Original: ' + escapeHtml(body.originalQuery) + '</p>' +
          '<p class="hint">Rewritten: ' + escapeHtml(body.rewrittenQuery) + '</p>' +
          hitCards('Original ranking', body.original) +
          hitCards('Rewritten ranking', body.rewrittenResults);
        return;
      }
      const tone = body.status === 'answered' ? 'ok' : body.status === 'insufficient' ? 'warn' : 'info';
      view.innerHTML = '<p><span class="badge ' + tone + '">' + body.status + '</span></p>' +
        '<div class="answer">' + richText(body.answer) + '</div>' +
        (body.sources.length ? '<h3>' + (body.status === 'answered' ? 'Sources' : 'Related questions') + '</h3>' : '') +
        body.sources.map((source) =>
          '<div class="card"><div class="meta">score ' + source.score.toFixed(3) + (source.pageReference ? ' · page ' + escapeHtml(source.pageReference) : '') + '</div>' +
          '<div class="qtext">' + richText(source.questionText) + '</div></div>').join('');
    }

    // Chat stream
    let chatAbort = null;

    $('#chat-stop').addEventListener('click', () => { if (chatAbort) chatAbort.abort(); });

    $('#chat-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      const filters = compact({
        subject: textOrNull(data.get('subject')),
        year: intOrNull(data.get('year')),
        difficulty: textOrNull(data.get('difficulty')),
      });
      const body = {
        id: 'playground',
        trigger: 'submit-message',
        messages: [{ id: 'u-' + Date.now(), role: 'user', parts: [{ type: 'text', text: String(data.get('text')) }] }],
      };
      if (Object.keys(filters).length > 0) body.filters = filters;

      const line = $('#chat-line');
      const answer = $('#chat-answer');
      const sources = $('#chat-sources');
      const events = $('#chat-events');
      answer.textContent = '';
      sources.innerHTML = '';
      events.textContent = '';
      $('#chat-request').textContent = JSON.stringify(body, null, 2);
      line.innerHTML = '<span class="badge info">sending</span>';

      const sendButton = event.submitter;
      sendButton.disabled = true;
      $('#chat-stop').disabled = false;
      chatAbort = new AbortController();
      const started = performance.now();
      const elapsed = () => Math.round(performance.now() - started) + ' ms';

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: chatAbort.signal,
        });
        const headerInfo = 'content-type: ' + response.headers.get('content-type') +
          ' · x-vercel-ai-ui-message-stream: ' + response.headers.get('x-vercel-ai-ui-message-stream');
        if (!response.ok) {
          const text = await response.text();
          line.innerHTML = '<span class="badge err">' + response.status + '</span><span>' + elapsed() + '</span>';
          answer.textContent = 'Rejected before streaming:\n' + text;
          return;
        }
        line.innerHTML = '<span class="badge info">' + response.status + ' streaming</span><span>' + escapeHtml(headerInfo) + '</span>';

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalStatus = null;
        let streamError = null;
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop();
          for (const block of blocks) {
            if (!block.startsWith('data: ')) continue;
            const payload = block.slice(6);
            events.textContent += payload + '\n';
            events.scrollTop = events.scrollHeight;
            if (payload === '[DONE]') continue;
            const part = JSON.parse(payload);
            if (part.type === 'text-delta') answer.textContent += part.delta;
            if (part.type === 'source-document') {
              const figures = Array.isArray(part.providerMetadata && part.providerMetadata.edusearch && part.providerMetadata.edusearch.figureUrls)
                ? part.providerMetadata.edusearch.figureUrls.filter(function (u) { return typeof u === 'string' && u.trim(); })
                : [];
              const figureHtml = figures.length
                ? '<div class="meta">Diagram from paper</div>' + figures.map(function (url) {
                    return '<img src="' + escapeHtml(url) + '" alt="Figure from uploaded exam paper" style="max-height:12rem;max-width:100%;margin:0.35rem 0.35rem 0 0;border:1px solid #e2e8f0;border-radius:0.5rem;background:#fff;object-fit:contain;" />';
                  }).join('')
                : '';
              sources.innerHTML += '<div class="card"><div class="meta">source-document · ' + escapeHtml(part.sourceId) + '</div>' +
                escapeHtml(part.title) + (part.filename ? ' · ' + escapeHtml(part.filename) : '') + figureHtml + '</div>';
            }
            if (part.type === 'finish') finalStatus = part.messageMetadata && part.messageMetadata.status;
            if (part.type === 'error') streamError = part.errorText;
          }
        }

        if (streamError) {
          line.innerHTML = '<span class="badge err">stream error</span><span>' + elapsed() + '</span><span>' + escapeHtml(streamError) + '</span>';
        } else {
          const tone = finalStatus === 'answered' ? 'ok' : finalStatus === 'insufficient' ? 'warn' : 'info';
          line.innerHTML = '<span class="badge ok">200 done</span><span class="badge ' + tone + '">' + escapeHtml(finalStatus) + '</span><span>' + elapsed() + '</span>';
        }
      } catch (error) {
        const stopped = error.name === 'AbortError';
        line.innerHTML = '<span class="badge ' + (stopped ? 'warn' : 'err') + '">' + (stopped ? 'stopped' : 'network error') + '</span><span>' + elapsed() + '</span>';
      } finally {
        sendButton.disabled = false;
        $('#chat-stop').disabled = true;
        chatAbort = null;
      }
    });

    // Create question
    $('#create-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      const body = compact({
        questionText: textOrNull(data.get('questionText')),
        subject: textOrNull(data.get('subject')),
        topic: textOrNull(data.get('topic')),
        subtopic: textOrNull(data.get('subtopic')),
        examYear: intOrNull(data.get('examYear')),
        examType: textOrNull(data.get('examType')),
        difficulty: data.get('difficulty'),
        questionType: data.get('questionType'),
        sourceDocument: textOrNull(data.get('sourceDocument')),
        pageReference: textOrNull(data.get('pageReference')),
      });
      busy(event.submitter, async () => {
        const result = await call('POST', '/questions', body);
        show($('#create-out'), 'POST', '/questions', body, result);
      });
    });

    // PDF import
    let pdfFile = null;
    let extracted = null;

    $('#extract-form').addEventListener('submit', (event) => {
      event.preventDefault();
      pdfFile = $('#pdf-file').files[0];
      if (!pdfFile) return;
      const form = new FormData();
      form.append('file', pdfFile);
      busy(event.submitter, async () => {
        $('#drafts').innerHTML = '<p class="hint">Extracting…</p>';
        $('#approve-block').hidden = true;
        $('#approve-out').innerHTML = '';
        const result = await call('POST', '/papers/extract', form, true);
        show($('#extract-out'), 'POST', '/papers/extract', { file: pdfFile.name + ' (' + pdfFile.size + ' bytes)' }, result);
        if (result.status !== 200) {
          $('#drafts').innerHTML = '';
          return;
        }
        extracted = result.body;
        renderDrafts(extracted);
        $('#approve-block').hidden = false;
      });
    });

    function figureHtml(figure) {
      return '<figure>' + (figure.association === 'uncertain' ? '<span class="badge warn">needs manual review</span>' : '') +
        '<img src="' + escapeHtml(figure.url) + '" alt="Page ' + figure.page + ' image ' + figure.index + '">' +
        '<figcaption class="hint">page ' + figure.page + ', image ' + figure.index + ' · ' + figure.width + '×' + figure.height + '</figcaption></figure>';
    }

    function renderDrafts(paper) {
      const drafts = $('#drafts');
      drafts.innerHTML = '<p class="hint">' + escapeHtml(paper.sourceDocument) + ' · ' + paper.pageCount + ' pages · ' +
        paper.questions.length + ' drafts · nothing saved yet. Edit the text, untick drafts you do not want, then approve.</p>';
      paper.questions.forEach((question, index) => {
        const card = document.createElement('div');
        card.className = 'card draft';
        card.dataset.index = String(index);
        card.innerHTML =
          '<div>' +
          '<label style="flex-direction:row;align-items:center"><input type="checkbox" class="keep" checked> Draft ' + (index + 1) + '</label>' +
          '<label>Question text <textarea class="text" rows="5">' + escapeHtml(question.questionText) + '</textarea></label>' +
          '<div class="row"><label>Page reference <input class="page" value="' + escapeHtml(question.pageReference) + '"></label>' +
          '<label>Subtopic override <input class="subtopic"></label></div>' +
          '</div>' +
          '<div>' + (question.figures.length ? question.figures.map(figureHtml).join('') : '<p class="hint">No figure.</p>') + '</div>';
        drafts.appendChild(card);
      });
      if (paper.unassignedFigures.length) {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = '<div class="meta">Figures not attached to any draft</div>' + paper.unassignedFigures.map(figureHtml).join('');
        drafts.appendChild(card);
      }
    }

    $('#approve-form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (!pdfFile || !extracted) return;
      const data = new FormData(event.target);
      const questions = Array.from(document.querySelectorAll('#drafts .draft'))
        .filter((card) => card.querySelector('.keep').checked)
        .map((card) => compact({
          questionText: card.querySelector('.text').value,
          pageReference: card.querySelector('.page').value,
          subtopic: textOrNull(card.querySelector('.subtopic').value),
        }));
      const draft = compact({
        subject: textOrNull(data.get('subject')),
        topic: textOrNull(data.get('topic')),
        subtopic: textOrNull(data.get('subtopic')),
        examYear: intOrNull(data.get('examYear')),
        examType: textOrNull(data.get('examType')),
        difficulty: data.get('difficulty'),
        questionType: data.get('questionType'),
        questions: questions,
      });
      const form = new FormData();
      form.append('file', pdfFile);
      form.append('draft', JSON.stringify(draft));
      busy(event.submitter, async () => {
        const result = await call('POST', '/papers/approve', form, true);
        show($('#approve-out'), 'POST', '/papers/approve', { file: pdfFile.name, draft: draft }, result);
      });
    });
  </script>
</body>
</html>`;
}
