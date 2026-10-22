export function reviewPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EduSearch review</title>
  <style>
    body { margin: 0; font-family: Georgia, serif; color: #1c1917; background: #f6f3ee; }
    main { max-width: 1100px; margin: 0 auto; padding: 32px 20px 64px; }
    h1 { font-size: 1.8rem; margin-bottom: 0.25rem; }
    p { line-height: 1.45; }
    form { display: flex; gap: 12px; align-items: center; margin: 20px 0 28px; }
    button { font: inherit; background: #1c1917; color: white; border: 0; border-radius: 6px; padding: 8px 14px; cursor: pointer; }
    .note { background: #fff; border: 1px solid #e7e5e4; border-radius: 8px; padding: 12px 14px; }
    article { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(240px, 0.8fr); gap: 18px; background: #fff; border: 1px solid #e7e5e4; border-radius: 10px; padding: 16px; margin: 14px 0; }
    pre { white-space: pre-wrap; font-family: Georgia, serif; margin: 0; }
    figure { margin: 0 0 12px; }
    img { max-width: 100%; height: auto; background: white; border: 1px solid #d6d3d1; }
    .flag { display: inline-block; margin-bottom: 6px; padding: 2px 8px; border-radius: 999px; background: #fef3c7; color: #92400e; font-family: sans-serif; font-size: 0.78rem; }
    .meta { font-family: sans-serif; font-size: 0.85rem; color: #57534e; margin-bottom: 8px; }
    .empty { font-family: sans-serif; color: #78716c; }
    #status { font-family: sans-serif; min-height: 1.2em; }
    @media (max-width: 800px) { article { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>Question review</h1>
    <p class="note">Extracted figures are shown beside the draft they appear to belong to, so you can check the diagram before approval. A yellow flag means the link is not reliable enough to treat as confirmed. Displaying a figure does not interpret it, caption it, or make it searchable.</p>
    <form id="upload">
      <input id="file" type="file" name="file" accept="application/pdf,.pdf" required>
      <button type="submit">Extract draft</button>
    </form>
    <p id="status"></p>
    <section id="drafts"></section>
  </main>
  <script>
    const form = document.querySelector('#upload');
    const status = document.querySelector('#status');
    const drafts = document.querySelector('#drafts');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.textContent = 'Extracting…';
      drafts.textContent = '';
      const body = new FormData(form);
      const response = await fetch('/papers/extract', { method: 'POST', body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        status.textContent = payload.message || 'Extraction failed.';
        return;
      }
      const questions = Array.isArray(payload.questions) ? payload.questions : [];
      status.textContent = payload.sourceDocument + ' · ' + questions.length + ' drafts · nothing saved';
      for (const question of questions) renderQuestion(question);
      renderUnassigned(payload.unassignedFigures);
    });

    function renderQuestion(question) {
      const article = document.createElement('article');
      const copy = document.createElement('div');
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = 'Starts on page ' + question.pageReference;
      const text = document.createElement('pre');
      text.textContent = question.questionText || '';
      copy.append(meta, text);
      const side = document.createElement('div');
      const figures = Array.isArray(question.figures) ? question.figures : [];
      if (figures.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = 'No extracted figure for this draft.';
        side.append(empty);
      }
      for (const figure of figures) side.append(renderFigure(figure));
      article.append(copy, side);
      drafts.append(article);
    }

    function renderFigure(figure) {
      const box = document.createElement('figure');
      if (figure.association === 'uncertain') {
        const flag = document.createElement('div');
        flag.className = 'flag';
        flag.textContent = 'Needs manual review';
        box.append(flag);
      }
      const image = document.createElement('img');
      image.alt = 'Extracted figure from page ' + figure.page + ', image ' + figure.index;
      image.src = figure.url;
      const caption = document.createElement('figcaption');
      caption.className = 'meta';
      caption.textContent = 'Page ' + figure.page + ', image ' + figure.index + ' · ' + figure.width + '×' + figure.height;
      box.append(image, caption);
      return box;
    }

    function renderUnassigned(figures) {
      if (!Array.isArray(figures) || figures.length === 0) return;
      const article = document.createElement('article');
      const copy = document.createElement('div');
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = 'Not attached to a draft';
      const text = document.createElement('pre');
      text.textContent = 'These images were extracted, but no question owns them confidently.';
      copy.append(meta, text);
      const side = document.createElement('div');
      for (const figure of figures) side.append(renderFigure({ ...figure, association: 'uncertain' }));
      article.append(copy, side);
      drafts.append(article);
    }
  </script>
</body>
</html>`;
}
