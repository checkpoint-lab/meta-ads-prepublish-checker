// 画面上のスイッチ（トグル／チェックボックス）を集め、ラベルと状態を取り出す。
// 読み取り専用です。画面の値を書き換えたり、クリックしたりはしません。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MPC_SCANNER = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SEL = '[role="switch"],[role="checkbox"],input[type="checkbox"]';

  function clean(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  // 状態を表すだけの文字（オン、オフ、○、●など）は、ラベルとして採用しない
  function isStateOnly(t) {
    return /^(オン|オフ|on|off|有効|無効|[\s○●◯◉✓✔×・/／-])*$/i.test(t);
  }

  function stateOf(el) {
    const a = el.getAttribute('aria-checked');
    if (a === 'true') return 'on';
    if (a === 'false') return 'off';
    if (el.tagName === 'INPUT') return el.checked ? 'on' : 'off';
    const inner = el.querySelector && el.querySelector('input[type="checkbox"]');
    if (inner) return inner.checked ? 'on' : 'off';
    return 'unknown';
  }

  function isVisible(el) {
    if (el.closest('[aria-hidden="true"]')) return false;
    if (typeof el.checkVisibility === 'function') return el.checkVisibility({ visibilityProperty: true });
    const cs = el.ownerDocument.defaultView.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  function topLevelToggles(scope) {
    return Array.from(scope.querySelectorAll(SEL)).filter((el) => !(el.parentElement && el.parentElement.closest(SEL)));
  }

  // スイッチ1つだけを含む最小の祖先の文字を、そのスイッチのラベルとみなす。
  // 改行を残した生の文字列を返す（最初の行をタイトルとして使うため）。
  function labelOf(el) {
    // 実機のスイッチには aria-label が「オン/オフ」「オフ」のような状態文言のものがあったため、
    // 状態文言だけのラベルは採用せず、周囲の文字を探す
    const al = String(el.getAttribute('aria-label') || '');
    if (clean(al) && !isStateOnly(clean(al))) return al;
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const t = lb.split(/\s+/).map((id) => {
        const n = el.ownerDocument.getElementById(id);
        return n ? n.textContent : '';
      }).join(' ');
      if (clean(t) && !isStateOnly(clean(t))) return t;
    }
    let node = el.parentElement;
    for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
      if (topLevelToggles(node).length > 1) break;
      const raw = String(node.innerText || node.textContent || '');
      const t = clean(raw);
      if (t.length > 200) break;
      if (t && !isStateOnly(t)) return raw;
    }
    return '';
  }

  // スイッチ1つだけを含む最も広い祖先の文字（説明文が別の要素にある画面向け）。保存だけに使い、項目の分類には使わない。
  function contextOf(el) {
    let best = '';
    let node = el.parentElement;
    for (let i = 0; i < 12 && node; i++, node = node.parentElement) {
      if (topLevelToggles(node).length > 1) break;
      const t = clean(node.innerText || node.textContent);
      if (t.length > 400) break;
      best = t;
    }
    return best;
  }

  // 返り値: { items: [{text, full, ctx, state}], unlabeled: ラベルを特定できなかった件数 }
  // text = 最初の行（タイトル想定）、full = 説明文を含む全文、ctx = 周囲の文字（保存だけに使い、分類には使わない）
  function collect(scope) {
    const root = scope || document;
    const items = [];
    let unlabeled = 0;
    for (const el of topLevelToggles(root)) {
      if (!isVisible(el)) continue;
      const raw = labelOf(el);
      const full = clean(raw);
      if (!full) { unlabeled++; continue; }
      const first = raw.split(/\r?\n/).map(clean).find((x) => x && !isStateOnly(x)) || full;
      items.push({ text: first, full, ctx: contextOf(el), state: stateOf(el) });
    }
    return { items, unlabeled };
  }

  return { collect, labelOf, stateOf, isStateOnly };
});
