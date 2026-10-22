// String.raw keeps the backslashes in the inline script's regexes and '\n'
// literals. The script must not contain backticks or a dollar-brace sequence.
export function demoPage(): string {
  return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Atar Spark · Find the Right Exam Question with AI</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", system-ui, -apple-system, sans-serif; color: #0f172a; background: #fff; }
    .hero-bg {
      background:
        linear-gradient(rgba(255,255,255,0.55) 1px, transparent 1px) 0 0 / 56px 56px,
        linear-gradient(90deg, rgba(255,255,255,0.55) 1px, transparent 1px) 0 0 / 56px 56px,
        radial-gradient(ellipse at 15% 55%, #e9e3fb 0%, transparent 45%),
        radial-gradient(ellipse at 85% 50%, #cfeefa 0%, transparent 50%),
        linear-gradient(180deg, #ffffff 0%, #f1f5fb 55%, #eaf6fb 100%);
      padding-bottom: 72px;
    }
    header { max-width: 1180px; margin: 0 auto; padding: 22px 28px; display: flex; align-items: center; justify-content: space-between; }
    .logo { display: flex; flex-direction: column; line-height: 0.9; text-decoration: none; }
    .logo b { font-size: 1.55rem; font-weight: 900; letter-spacing: 0.5px; background: linear-gradient(90deg, #1d4ed8, #38bdf8); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .logo small { font-size: 0.55rem; letter-spacing: 2px; color: #1e3a8a; margin-top: 4px; text-align: center; }
    nav { display: flex; align-items: center; gap: 30px; font-size: 0.92rem; }
    nav a { color: #0f172a; text-decoration: none; }
    .pill-outline { border: 1.5px solid #1e3a8a; border-radius: 999px; padding: 9px 18px; }
    .hero { text-align: center; padding: 70px 20px 0; }
    h1 { font-size: clamp(2.2rem, 5vw, 3.6rem); line-height: 1.08; margin: 0 0 22px; font-weight: 700; letter-spacing: -1px; }
    h1 .ai { background: linear-gradient(90deg, #3b82f6, #60a5fa); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .sub { max-width: 640px; margin: 0 auto 44px; color: #334155; line-height: 1.55; font-size: 1rem; }
    .search-card { max-width: 780px; margin: 0 auto; background: #f8fafc; border: 3px solid #1d4ed8; border-radius: 22px; padding: 18px 20px 16px; box-shadow: 0 20px 50px rgba(29, 78, 216, 0.12); text-align: left; }
    .search-row { display: flex; align-items: center; gap: 12px; }
    .icon-btn { width: 40px; height: 40px; border-radius: 10px; border: 0; background: #e2e8f0; color: #0f172a; font-size: 1.4rem; cursor: pointer; display: grid; place-items: center; flex: none; }
    .icon-btn.plain { background: transparent; }
    .icon-btn[disabled] { cursor: not-allowed; opacity: 0.6; }
    .icon-btn.listening { background: #fee2e2; color: #b91c1c; }
    #q { flex: 1; border: 0; background: transparent; font: inherit; font-size: 1rem; padding: 10px 4px; outline: none; color: #0f172a; }
    .search-btn { display: flex; align-items: center; gap: 8px; border: 0; border-radius: 999px; background: #3b82f6; color: #fff; font: inherit; font-weight: 600; padding: 11px 20px; cursor: pointer; box-shadow: 0 6px 16px rgba(59,130,246,0.35); }
    .search-btn:disabled { opacity: 0.7; cursor: wait; }
    .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    .chip { position: relative; }
    .chip select { appearance: none; -webkit-appearance: none; font: inherit; font-size: 0.92rem; font-weight: 500; color: #0f172a; background: #e2e8f0; border: 1.5px solid transparent; border-radius: 10px; padding: 8px 34px 8px 12px; cursor: pointer; }
    .chip select.active { background: #dbeafe; border-color: #3b82f6; color: #1e3a8a; }
    .chip::after { content: ""; position: absolute; right: 13px; top: 50%; width: 7px; height: 7px; border-right: 2px solid #0f172a; border-bottom: 2px solid #0f172a; transform: translateY(-70%) rotate(45deg); pointer-events: none; }
    .clear { background: none; border: 0; color: #1d4ed8; font: inherit; font-size: 0.88rem; cursor: pointer; padding: 8px 4px; }
    main { max-width: 900px; margin: 0 auto; padding: 36px 20px 80px; }
    .status-line { color: #475569; font-size: 0.9rem; margin-bottom: 14px; min-height: 1.2em; }
    .answer { border-radius: 16px; padding: 20px 22px; margin-bottom: 28px; border: 1px solid #e2e8f0; background: #fff; box-shadow: 0 8px 24px rgba(15,23,42,0.05); }
    .answer .tag { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase; border-radius: 999px; padding: 4px 10px; margin-bottom: 12px; }
    .tag.answered { background: #dcfce7; color: #166534; }
    .tag.explained { background: #ede9fe; color: #5b21b6; }
    .tag.insufficient { background: #fef3c7; color: #92400e; }
    .tag.out { background: #f1f5f9; color: #475569; }
    .answer .body { font-size: 1.05rem; line-height: 1.65; white-space: pre-wrap; }
    .answer .note { margin-top: 12px; font-size: 0.82rem; color: #64748b; font-style: italic; }
    h2 { font-size: 1.15rem; margin: 0 0 12px; }
    .q { border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px 18px; margin-bottom: 12px; background: #fff; }
    .q .meta { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .badge { font-size: 0.75rem; font-weight: 600; border-radius: 999px; padding: 3px 9px; background: #f1f5f9; color: #334155; }
    .badge.match { background: #dbeafe; color: #1e40af; }
    .q .text { white-space: pre-wrap; line-height: 1.6; }
    .q .src { margin-top: 10px; font-size: 0.8rem; color: #64748b; }
    .empty { color: #64748b; padding: 18px; border: 1px dashed #cbd5e1; border-radius: 14px; text-align: center; }
    .skeleton { height: 16px; border-radius: 6px; background: linear-gradient(90deg, #f1f5f9, #e2e8f0, #f1f5f9); background-size: 200% 100%; animation: shimmer 1.2s infinite; margin: 10px 0; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
    .error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 12px; padding: 14px 16px; }
    @media (max-width: 720px) { nav a:not(.pill-outline) { display: none; } .search-btn span { display: none; } }
  </style>
</head>
<body>
  <div class="hero-bg">
    <header>
      <a class="logo" href="#"><b>ATAR&#9733;SPARK</b><small>IGNITE POTENTIAL</small></a>
      <nav>
        <a href="#">About Us</a>
        <a href="#">Pricing</a>
        <a href="#">Login</a>
        <a href="#" class="pill-outline">Sign in for free &rarr;</a>
      </nav>
    </header>
    <section class="hero">
      <h1>Find the Right Exam<br>Question with <span class="ai">AI</span></h1>
      <p class="sub">Search a curated, well-indexed archive of examination questions across Mathematics, Physics and Chemistry, by topic, year, difficulty or pattern of repetition.</p>
      <form class="search-card" id="search">
        <div class="search-row">
          <button type="button" class="icon-btn" disabled title="Attachments are coming soon">+</button>
          <input id="q" name="q" autocomplete="off" maxlength="1000" placeholder="Search question, topics, concept...">
          <button type="button" class="icon-btn plain" id="mic" title="Speak your question" aria-label="Speak your question">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg>
          </button>
          <button type="submit" class="search-btn" id="go">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <span>Search</span>
          </button>
        </div>
        <div class="chips">
          <label class="chip"><select id="subject" aria-label="Subject"><option value="">Subject</option></select></label>
          <label class="chip"><select id="period" aria-label="Time period"><option value="">Time period</option></select></label>
          <label class="chip"><select id="difficulty" aria-label="Difficulty level"><option value="">Difficulty level</option></select></label>
          <label class="chip"><select id="year" aria-label="Year"><option value="">Year</option></select></label>
          <button type="button" class="clear" id="clear" hidden>Clear filters</button>
        </div>
      </form>
    </section>
  </div>

  <main id="results" hidden>
    <div class="status-line" id="status"></div>
    <div id="answer"></div>
    <h2 id="list-title" hidden>Matching exam questions</h2>
    <div id="list"></div>
  </main>

  <script>
    var MATCH_SCORE = 0.3;
    var LABELS = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard', MCQ: 'MCQ', SHORT: 'Short answer', LONG: 'Long answer' };
    var $ = function (selector) { return document.querySelector(selector); };
    var selects = ['#subject', '#period', '#difficulty', '#year'].map($);
    var periods = [];

    function escapeHtml(text) {
      return String(text == null ? '' : text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function richText(text) {
      return escapeHtml(text)
        .replace(/\^\{([^}]{1,8})\}/g, '<sup>$1</sup>')
        .replace(/_\{([^}]{1,8})\}/g, '<sub>$1</sub>');
    }

    function addOption(select, value, label, disabled) {
      var option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.disabled = Boolean(disabled);
      select.appendChild(option);
    }

    async function loadFilters() {
      try {
        var response = await fetch('/questions/filters');
        if (!response.ok) return;
        var data = await response.json();
        data.subjects.forEach(function (item) { addOption($('#subject'), item.value, item.value + ' (' + item.count + ')'); });
        periods = data.timePeriods;
        periods.forEach(function (item, index) {
          addOption($('#period'), String(index), item.label + ' (' + item.count + ')', item.count === 0);
        });
        ['EASY', 'MEDIUM', 'HARD'].forEach(function (value) {
          var found = data.difficulties.find(function (item) { return item.value === value; });
          addOption($('#difficulty'), value, LABELS[value] + ' (' + (found ? found.count : 0) + ')', !found);
        });
        data.years.forEach(function (item) { addOption($('#year'), String(item.value), item.value + ' (' + item.count + ')'); });
      } catch (ignored) {}
    }

    function syncChips() {
      var any = false;
      selects.forEach(function (select) {
        select.classList.toggle('active', select.value !== '');
        if (select.value !== '') any = true;
      });
      $('#clear').hidden = !any;
    }

    selects.forEach(function (select) {
      select.addEventListener('change', function () {
        syncChips();
        if ($('#q').value.trim()) runSearch();
      });
    });

    $('#clear').addEventListener('click', function () {
      selects.forEach(function (select) { select.value = ''; });
      syncChips();
      if ($('#q').value.trim()) runSearch();
    });

    function requestBody(limit) {
      var body = { query: $('#q').value.trim(), limit: limit };
      if ($('#subject').value) body.subject = $('#subject').value;
      if ($('#difficulty').value) body.difficulty = $('#difficulty').value;
      if ($('#year').value) body.examYear = Number($('#year').value);
      if ($('#period').value !== '') {
        var period = periods[Number($('#period').value)];
        body.yearFrom = period.yearFrom;
        body.yearTo = period.yearTo;
      }
      return body;
    }

    async function post(path, body) {
      var response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        var message = Array.isArray(data.message) ? data.message.join(' ') : data.message;
        throw new Error(message || 'The service is temporarily unavailable. Please try again.');
      }
      return data;
    }

    function filterSummary(body) {
      var parts = [];
      if (body.subject) parts.push(body.subject);
      if (body.yearFrom) parts.push(body.yearFrom + '–' + body.yearTo);
      if (body.examYear) parts.push(String(body.examYear));
      if (body.difficulty) parts.push(LABELS[body.difficulty]);
      return parts.length ? ' · Filters: ' + parts.join(', ') : '';
    }

    var searchId = 0;

    async function runSearch() {
      var query = $('#q').value.trim();
      if (!query) { $('#q').focus(); return; }
      var id = ++searchId;
      var started = performance.now();
      var answerBody = requestBody(5);
      var listBody = requestBody(10);

      $('#results').hidden = false;
      $('#go').disabled = true;
      $('#status').textContent = 'Searching the papers…';
      $('#answer').innerHTML = '<div class="answer"><div class="skeleton" style="width:30%"></div><div class="skeleton"></div><div class="skeleton" style="width:80%"></div></div>';
      $('#list-title').hidden = true;
      $('#list').innerHTML = '';
      $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });

      var results = await Promise.allSettled([post('/questions/answer', answerBody), post('/questions/search', listBody)]);
      if (id !== searchId) return;
      $('#go').disabled = false;

      var seconds = ((performance.now() - started) / 1000).toFixed(1);
      $('#status').textContent = 'Results for "' + query + '"' + filterSummary(answerBody) + ' · ' + seconds + ' s';

      if (results[0].status === 'fulfilled') {
        renderAnswer(results[0].value);
        $('#list-title').textContent = results[0].value.status === 'out_of_scope' ? 'Closest exam questions' : 'Matching exam questions';
      } else {
        $('#answer').innerHTML = '<div class="error">' + escapeHtml(results[0].reason.message) + '</div>';
      }
      if (results[1].status === 'fulfilled') {
        renderList(results[1].value.results);
      } else if (results[0].status === 'fulfilled') {
        $('#list').innerHTML = '<div class="error">' + escapeHtml(results[1].reason.message) + '</div>';
      }
    }

    function renderAnswer(data) {
      var html;
      if (data.status === 'answered') {
        html = '<span class="tag answered">Answer from the papers</span><div class="body">' + richText(data.answer) + '</div>' +
          '<div class="note">Quoted from ' + data.sources.map(function (source) {
            return source.pageReference ? 'page ' + escapeHtml(source.pageReference) : 'the papers';
          }).join(', ') + '.</div>';
      } else if (data.status === 'insufficient' && data.explanation) {
        html = '<span class="tag explained">AI explanation</span><div class="body">' + richText(data.explanation) + '</div>' +
          '<div class="note">Generated by AI. Not quoted from the uploaded papers. Related exam questions are listed below.</div>';
      } else if (data.status === 'insufficient') {
        html = '<span class="tag insufficient">Related questions found</span><div class="body">' + escapeHtml(data.answer) + '</div>';
      } else {
        html = '<span class="tag out">No information</span><div class="body">' + escapeHtml(data.answer) + '</div>';
      }
      $('#answer').innerHTML = '<div class="answer">' + html + '</div>';
    }

    function renderList(hits) {
      var matches = hits.filter(function (hit) { return hit.score >= MATCH_SCORE; });
      $('#list-title').hidden = false;
      if (matches.length === 0) {
        $('#list').innerHTML = '<div class="empty">No closely matching exam questions. Try different words or fewer filters.</div>';
        return;
      }
      $('#list').innerHTML = matches.map(function (hit) {
        var badges = [
          '<span class="badge match">' + Math.round(hit.score * 100) + '% match</span>',
          '<span class="badge">' + escapeHtml(hit.subject) + '</span>',
          hit.examYear ? '<span class="badge">' + hit.examYear + '</span>' : '',
          '<span class="badge">' + LABELS[hit.difficulty] + '</span>',
          '<span class="badge">' + LABELS[hit.questionType] + '</span>',
          hit.subtopic ? '<span class="badge">' + escapeHtml(hit.subtopic) + '</span>' : '',
        ].join('');
        var source = (hit.sourceDocument || '').split('#')[0];
        return '<article class="q"><div class="meta">' + badges + '</div>' +
          '<div class="text">' + richText(hit.questionText) + '</div>' +
          '<div class="src">' + escapeHtml(hit.topic) + (source ? ' · ' + escapeHtml(source) : '') +
          (hit.pageReference ? ' · page ' + escapeHtml(hit.pageReference) : '') + '</div></article>';
      }).join('');
    }

    $('#search').addEventListener('submit', function (event) {
      event.preventDefault();
      runSearch();
    });

    var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      $('#mic').hidden = true;
    } else {
      $('#mic').addEventListener('click', function () {
        var recognition = new Recognition();
        recognition.lang = 'en-IN';
        recognition.interimResults = false;
        $('#mic').classList.add('listening');
        recognition.onresult = function (event) {
          $('#q').value = event.results[0][0].transcript;
          runSearch();
        };
        recognition.onend = function () { $('#mic').classList.remove('listening'); };
        recognition.start();
      });
    }

    loadFilters();
  </script>
</body>
</html>`;
}
