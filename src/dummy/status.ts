export const status = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Status</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: var(--s2-font-family, 'Adobe Clean', -apple-system, system-ui, sans-serif);
        background: transparent;
        color: var(--s2-content-default, #e8e8e8);
        font-size: 14px;
      }
      .card {
        display: grid;
        gap: 12px;
        padding: 4px 2px;
      }
      .row { display: flex; align-items: center; gap: 10px; }
      .dot {
        flex: none;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--dot);
      }
      .name { flex: 1; font-weight: 600; }
      .meta { font-size: 12px; color: var(--s2-content-subdued, #9a9a9a); }
      .steps { list-style: none; display: grid; gap: 6px; }
      .steps label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
      .actions { display: flex; justify-content: flex-end; gap: 8px; }
      button {
        font: inherit;
        padding: 6px 12px;
        border-radius: 999px;
        border: 1px solid var(--s2-gray-400, rgba(128, 128, 128, 0.5));
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      button.primary {
        background: var(--s2-accent, #3b63fb);
        border-color: transparent;
        color: #fff;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="row" style="--dot: #2d9d78">
        <span class="dot"></span>
        <span class="name">PR #58 · Add retries for upstream timeouts</span>
        <span class="meta">4 of 4 checks</span>
      </div>
      <div class="row" style="--dot: #e68619">
        <span class="dot"></span>
        <span class="name">Visual regression suite</span>
        <span class="meta">2 snapshots changed</span>
      </div>
      <div class="row" style="--dot: #2d9d78">
        <span class="dot"></span>
        <span class="name">Staging</span>
        <span class="meta">/health answered in 2 ms</span>
      </div>
      <ul class="steps">
        <li><label><input type="checkbox" checked /> TTL fix merged</label></li>
        <li><label><input type="checkbox" /> Merge the retry pull request</label></li>
        <li><label><input type="checkbox" /> Update the forecast docs to Celsius</label></li>
        <li><label><input type="checkbox" /> Tag 1.9.0</label></li>
      </ul>
      <div class="actions">
        <button type="button" data-action="review">Review snapshots</button>
        <button type="button" class="primary" data-action="continue">Continue</button>
      </div>
    </div>
    <script>
      document.querySelector('.actions').addEventListener('click', function (event) {
        var action = event.target.getAttribute('data-action');
        if (!action || !window.slicc) return;
        var done = document.querySelectorAll('.steps input:checked').length;
        slicc.lick({ action: action, data: { done: done } });
      });
    </script>
  </body>
</html>
`;
