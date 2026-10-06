// 画面左下のボタンとチェック結果パネル。パネルを開いたときにスキャンし、開いている間は画面の変化を検知して読み直します。
// 通信はしません。画面の内容を外部に送らず、設定の保存先はブラウザ内（chrome.storage.local）だけです。
(function () {
  if (window.__mpcLoaded) return;
  window.__mpcLoaded = true;

  const R = window.MPC_RULES;
  const S = window.MPC_SCANNER;
  const STORE_KEY = 'mpc_enabled_rules';
  const LABEL = { ng: 'NG', ok: 'OK', notfound: '未検出', unknown: '状態不明' };

  const host = document.createElement('div');
  host.id = 'mpc-host';
  // 広告作成画面の右下には「公開する」ボタンがあるため、押し間違いを避けて左下（左メニューの右側）に置く
  host.style.cssText = 'all:initial;position:fixed;left:84px;bottom:92px;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { font-family: system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif; }
      * { box-sizing: border-box; }
      button { font: inherit; cursor: pointer; }
      .fab { background:#1b1f23; color:#fff; border:0; border-radius:999px; padding:10px 16px; font-size:13px; box-shadow:0 2px 8px rgba(0,0,0,.3); }
      .panel { display:none; width:360px; max-height:70vh; overflow:auto; background:#fff; color:#1b1f23; border:1px solid #c9ced3; border-radius:10px; box-shadow:0 6px 24px rgba(0,0,0,.25); padding:12px; font-size:13px; line-height:1.5; margin-bottom:8px; }
      .panel.open { display:block; }
      h2 { font-size:14px; margin:0 0 6px; }
      .note { color:#555; font-size:12px; margin:0 0 8px; }
      .row { border-top:1px solid #e3e6e9; padding:8px 0; }
      .head { display:flex; align-items:center; gap:8px; }
      .badge { min-width:56px; text-align:center; font-weight:700; font-size:12px; border-radius:4px; padding:1px 6px; color:#fff; }
      .ng { background:#c62828; } .ok { background:#2e7d32; } .notfound { background:#757575; } .unknown { background:#b26a00; }
      .detail { color:#444; font-size:12px; margin:2px 0 0 0; }
      .actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
      .actions button { border:1px solid #1b1f23; background:#fff; border-radius:6px; padding:6px 8px; font-size:12px; white-space:nowrap; }
      .verdict { font-weight:700; font-size:13px; border-radius:6px; padding:8px 10px; margin:6px 0; color:#fff; }
      .verdict.ng { background:#c62828; } .verdict.pending { background:#b26a00; } .verdict.ok { background:#2e7d32; }
      .actions button.primary { background:#1b1f23; color:#fff; }
      label { display:flex; align-items:center; gap:6px; }
      .summary { font-weight:700; margin:6px 0; }
    </style>
    <div class="panel" id="panel" role="dialog" aria-label="Meta広告 公開前チェッカー"></div>
    <button class="fab" id="fab" type="button">公開前チェック</button>
  `;
  const panel = shadow.getElementById('panel');
  const fab = shadow.getElementById('fab');

  let enabled = R.RULES.map((r) => r.id);
  let lastText = '';

  function loadEnabled(cb) {
    try {
      chrome.storage.local.get(STORE_KEY, (v) => {
        if (v && Array.isArray(v[STORE_KEY])) enabled = v[STORE_KEY].filter((id) => R.RULES.some((r) => r.id === id));
        cb();
      });
    } catch (e) { cb(); }
  }
  function saveEnabled() {
    try { chrome.storage.local.set({ [STORE_KEY]: enabled }); } catch (e) { /* 保存できなくても動作は続ける */ }
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // Metaの画面は、見えている範囲のスイッチしか描画しないことがあるため、
  // パネルを開いている間にスキャンした結果を store に合算して判定する。
  // 結果は広告ごとに記憶する。広告の識別子は URL の selected_ad_ids（なければ画面のパス）。
  // 記憶はブラウザ内（chrome.storage.local）に保存し、ページを読み直しても残る。
  const store = new Map();
  const MEM_KEY = 'mpc_ads';
  let adKey = '';
  let memLoaded = false;
  let savedAt = 0;
  let unlabeledCount = 0;
  let lastSig = '';
  let summaryInfo = [];

  function currentAdKey() {
    try {
      const u = new URL(location.href);
      // URL由来の文字列を保存のキー名に使うため、長さに上限を設ける（64字まで）
      const ad = u.searchParams.get('selected_ad_ids');
      if (ad) return 'ad:' + ad.slice(0, 64);
      return 'page:' + String(u.searchParams.get('act') || '').slice(0, 64) + u.pathname.slice(0, 64);
    } catch (e) { return 'page:' + String(location.pathname).slice(0, 64); }
  }

  function loadMemory(cb) {
    memLoaded = true;
    try {
      chrome.storage.local.get(MEM_KEY, (v) => {
        const rec = v && v[MEM_KEY] && v[MEM_KEY][adKey];
        if (rec && Array.isArray(rec.items)) {
          rec.items.forEach((it) => { if (!store.has(it.text)) store.set(it.text, Object.assign({}, it, { restored: true })); });
          savedAt = rec.savedAt || 0;
        }
        cb();
      });
    } catch (e) { cb(); }
  }

  let saveTimer = null;
  function saveMemory() {
    clearTimeout(saveTimer);
    const keyAtSchedule = adKey;
    saveTimer = setTimeout(() => {
      // 広告が変わった直後や、記憶の読み込み中は保存しない（新しい広告の保存済みの記憶を、空の内容で上書きしない）
      if (keyAtSchedule !== adKey || !memLoaded || loading) return;
      try {
        chrome.storage.local.get(MEM_KEY, (v) => {
          // 読み出しの間に広告が切り替わっていたら、保存しない
          if (keyAtSchedule !== adKey || !memLoaded || loading) return;
          const all = (v && v[MEM_KEY]) || {};
          // 80件を超えるときは、判定に関係する項目（項目に分類できるもの）を先に残す
          const ordered = Array.from(store.values())
            .map((it, i) => ({ it, i, p: (it.rule || R.classify(it)) ? 0 : 1 }))
            .sort((a, b) => a.p - b.p || a.i - b.i)
            .map((x) => x.it);
          all[keyAtSchedule] = {
            savedAt: Date.now(),
            items: ordered.slice(0, 80).map((it) => ({
              text: String(it.text).slice(0, 120), full: String(it.full || '').slice(0, 200),
              ctx: String(it.ctx || '').slice(0, 300), state: it.state, rule: it.rule, source: it.source,
            })),
          };
          Object.keys(all).sort((a, b) => (all[b].savedAt || 0) - (all[a].savedAt || 0)).slice(30).forEach((k) => { delete all[k]; });
          chrome.storage.local.set({ [MEM_KEY]: all });
        });
      } catch (e) { /* 保存できなくても動作は続ける */ }
    }, 800);
  }

  // 広告が変わったら、その広告の保存済みの記憶を読み込んでから処理する（読み込み前に保存して上書きしない）
  let loading = false;
  let waiters = [];
  function withMemory(cb) {
    if (loading) { waiters.push(cb); return; } // 読み込み中の呼び出しは、読み込み完了後に実行する
    const k = currentAdKey();
    if (k !== adKey) { store.clear(); adKey = k; memLoaded = false; savedAt = 0; }
    if (memLoaded) { cb(); return; }
    loading = true;
    loadMemory(() => {
      loading = false;
      const queued = waiters;
      waiters = [];
      cb();
      queued.forEach((f) => f());
    });
  }

  function scanOnce() {
    const { items, unlabeled } = S.collect(document);
    R.mergeItems(store, items);
    unlabeledCount = unlabeled;
    try {
      const ps = R.parseSummary(document.body.innerText || '');
      R.mergeSummary(store, ps);
      summaryInfo = ps.found;
    } catch (e) { summaryInfo = []; }
    saveMemory();
  }

  function evaluateStore() {
    return R.evaluate(Array.from(store.values()), enabled);
  }

  function signature(ev) {
    return JSON.stringify([
      ev.results.map((r) => [r.id, r.status, r.on, r.total]),
      ev.unclassifiedItems.map((x) => [x.text, x.state]),
      unlabeledCount,
    ]);
  }

  function render() {
    withMemory(() => { scanOnce(); draw(); });
  }

  function adInfoText() {
    const id = adKey.startsWith('ad:') ? '広告ID …' + adKey.slice(-6) : '広告ID不明（画面のパスで区別）';
    const when = savedAt ? '前回の確認：' + new Date(savedAt).toLocaleString('ja-JP') : 'この広告の確認は初回です';
    return `${id}／${when}`;
  }

  function summaryInfoText() {
    if (!summaryInfo.length) return 'まとめ文：この画面では見つかっていません（広告の編集画面の「クリエイティブ」付近に出る、設定のまとめです）';
    return 'まとめ文を検出：' + summaryInfo.map((s) =>
      `${s.label} ON ${s.on}/${s.total}件` + (s.parsedOn !== s.on ? '（名称の読み取りは' + s.parsedOn + '件）' : '')).join('、');
  }

  function draw() {
    const unlabeled = unlabeledCount;
    const ev = evaluateStore();
    lastSig = signature(ev);
    lastText = R.toText(ev);
    const s = ev.summary;
    const rows = ev.results.map((r) => {
      const detail = esc(R.detailOf(r)) + (r.status === 'notfound'
        ? '。その設定が見える位置までスクロールするか、該当の設定画面を開いてください（パネルを開いたままなら、表示された時点で判定します）'
        : r.status === 'unknown' ? '。目視で確認してください' : '');
      return `<div class="row"><div class="head"><span class="badge ${r.status}">${LABEL[r.status]}</span><strong>${esc(r.title)}</strong></div><p class="detail">${detail}</p></div>`;
    }).join('');
    const pending = s.notfound + s.unknown;
    const verdict = !ev.results.length
      ? { cls: 'pending', text: 'チェック対象の項目がありません。下の「チェック対象」で、確認する項目を選んでください' }
      : s.ng
      ? { cls: 'ng', text: `NGが${s.ng}件あります。公開前に該当の設定を確認してください` + (pending ? `（未確認の項目も${pending}件あります）` : '') }
      : pending
        ? { cls: 'pending', text: `確認が完了していません。未検出・状態不明が${pending}件あるため、OKとは言えません` }
        : { cls: 'ok', text: 'すべての項目がOFFです。記憶を含む項目は、画面を読み直して再確認してください' };
    const settings = R.RULES.map((r) =>
      `<label><input type="checkbox" data-rule="${r.id}" ${enabled.includes(r.id) ? 'checked' : ''}>${esc(r.title)}</label>`
    ).join('');
    panel.innerHTML = `
      <h2>Meta広告 公開前チェッカー v0</h2>
      <p class="note">画面に表示されているスイッチを読み取ります。このパネルを開いている間は、スクロールして表示された項目も記憶して判定に含めます。自動調整系の設定がOFFかを確認する補助ツールで、最終確認は目視で行ってください。</p>
      <div class="verdict ${verdict.cls}">${esc(verdict.text)}</div>
      <p class="note">${esc(adInfoText())}<br>${esc(summaryInfoText())}</p>
      <div class="summary">NG ${s.ng}件／OK ${s.ok}件／未検出 ${s.notfound}件${s.unknown ? `／状態不明 ${s.unknown}件` : ''}</div>
      ${rows}
      ${unlabeled ? `<p class="note">ラベルを特定できなかったスイッチが${unlabeled}件あります（判定に含まれていません）。</p>` : ''}
      ${ev.unclassified ? `<div class="row"><div class="note">判定対象外のスイッチ ${ev.unclassified}件（どの項目にも当てはまりません。自動調整系の設定が含まれていないか、目視で確認してください）</div><div class="detail">${esc(ev.unclassifiedItems.slice(0, 12).map((x) => x.text.slice(0, 40) + '：' + ({ on: 'ON', off: 'OFF', unknown: '不明' }[x.state])).join('／'))}${ev.unclassified > 12 ? '／…' : ''}</div></div>` : ''}
      <div class="row"><div class="note">チェック対象（外すとその項目は判定しません）</div>${settings}</div>
      <div class="actions"><button class="primary" id="rescan" type="button">再チェック</button><button id="reset" type="button">記憶をリセット</button><button id="copy" type="button">結果をコピー</button><button id="close" type="button">閉じる</button></div>
      <p class="note" style="margin-top:8px">非公式ツールです。Meta社とは関係がありません。画面の内容は外部に送信しません。</p>
    `;
    panel.querySelectorAll('input[data-rule]').forEach((el) => el.addEventListener('change', () => {
      enabled = Array.from(panel.querySelectorAll('input[data-rule]:checked')).map((x) => x.getAttribute('data-rule'));
      saveEnabled();
      draw();
    }));
    panel.querySelector('#rescan').addEventListener('click', render);
    panel.querySelector('#reset').addEventListener('click', () => { store.clear(); savedAt = 0; render(); });
    panel.querySelector('#close').addEventListener('click', () => panel.classList.remove('open'));
    panel.querySelector('#copy').addEventListener('click', (e) => {
      const b = e.currentTarget;
      const done = (m) => { b.textContent = m; setTimeout(() => { b.textContent = '結果をコピー'; }, 1500); };
      const fallback = () => {
        try {
          const ta = document.createElement('textarea');
          ta.value = lastText;
          ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
          shadow.appendChild(ta);
          ta.select();
          const ok = document.execCommand('copy');
          ta.remove();
          done(ok ? 'コピーしました' : 'コピーできません');
        } catch (err) { done('コピーできません'); }
      };
      try { navigator.clipboard.writeText(lastText).then(() => done('コピーしました'), fallback); }
      catch (err) { fallback(); }
    });
  }

  fab.addEventListener('click', () => {
    if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
    render();
    panel.classList.add('open');
  });

  // パネルを開いている間だけ、画面の変化（スクロールによる描画、スイッチの切り替え）を検知して再スキャンする
  let rescanTimer = null;
  const observer = new MutationObserver(() => {
    if (!panel.classList.contains('open')) return;
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => {
      const top = panel.scrollTop;
      withMemory(() => {
        scanOnce();
        if (signature(evaluateStore()) !== lastSig) { draw(); panel.scrollTop = top; }
      });
    }, 600);
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['aria-checked', 'checked'],
  });

  window.__mpcRender = render; // テスト用
  loadEnabled(() => document.documentElement.appendChild(host));
})();
