// チェックルールと判定ロジック（DOMに依存しない純関数）。
// ラベルのパターンは、Meta広告マネージャの日本語・英語UIの表記を想定した推定です。
// 画面の文言が変わると検出できなくなるため、見つからない場合は「未検出」、
// どの項目にも当てはまらないスイッチは「判定対象外」として画面に出します。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MPC_RULES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // 上から順に照合し、最初に一致したルールに割り当てます（翻訳などの個別項目を先に置く）。
  const RULES = [
    {
      id: 'translate',
      title: 'クリエイティブ翻訳',
      hint: '広告文が意図しない言語に翻訳されて配信されないか確認',
      // 「言語」だけのラベルは、広告の自動翻訳の設定（説明文に「翻訳」とある）。実機で、説明文が別の要素にあり、周囲の文字では届かなかったため
      patterns: ['翻訳', 'translat', '^\\s*言語\\s*$'],
    },
    {
      id: 'flexible-media',
      title: '柔軟性のあるメディア',
      hint: '画像や動画が、指定していない配置に追加で配信されないか確認',
      patterns: ['柔軟性のあるメディア', 'フレキシブル', 'flexible\\s*media'],
    },
    {
      id: 'multi-advertiser',
      title: '複数広告主の広告',
      hint: '他の広告主の広告と並べて表示される設定',
      patterns: ['複数(の)?広告主', 'multi-?\\s*advertiser', 'multiple\\s*advertisers?'],
    },
    {
      id: 'basic-enhance',
      title: '基本的なエンハンス',
      hint: '関連度が高いコメント、明るさとコントラスト、スポットライトなど',
      patterns: [
        '関連度が高いコメント', '明るさ', 'コントラスト', 'スポットライト',
        'relevant\\s*comments?', 'brightness', 'contrast', 'spotlight',
      ],
    },
    {
      id: 'creative-enhance',
      title: 'Advantage+ クリエイティブ エンハンス',
      hint: 'タッチアップ、テキストの改善、オーバーレイ、アニメーション、音楽、テンプレートなど',
      patterns: [
        'タッチアップ', 'テキストの改善', 'オーバーレイ', 'アニメーション', '音楽',
        '(?<![A-Za-z0-9])3D(?![A-Za-z0-9])', 'テンプレートを(適用|追加)', '画像テンプレート', 'ビデオ効果',
        'トリミングと拡大', '画像の拡張', 'image\\s*expansion', 'crop\\s*(and|&)\\s*(zoom|expand)',
        'CTAエンハンス', 'enhance\\s*cta',
        'touch-?\\s*ups?', 'text\\s*improvements?', 'overlays?', 'animation',
        '(?<![a-z])music(?![a-z])', 'image\\s*templates?', 'video\\s*effects?',
      ],
    },
    {
      id: 'auto-extras',
      title: 'その他の自動追加（サイトリンク、ブランディング）',
      hint: '広告にサイトリンクが自動で追加される設定や、ブランドの設定を広告に自動適用する設定',
      patterns: [
        'サイトリンク', 'ブランディングを適用', 'ウェブサイトのハイライト',
        'site\\s*links?', 'apply\\s*(this\\s*)?branding', 'website\\s*highlights?',
      ],
    },
  ];

  const compiled = RULES.map((r) => ({ id: r.id, re: new RegExp(r.patterns.join('|'), 'i') }));

  function classifyOne(label) {
    if (!label) return null;
    for (const c of compiled) if (c.re.test(label)) return c.id;
    return null;
  }

  // 引数は文字列、または { text: タイトル行, full: 説明文を含む全文, ctx: 周囲の文字（保存だけに使い、分類には使わない） }。
  // オブジェクトのときは、タイトル行、全文の順に照合する。
  // 周囲の文字は、分類に使わない。実機で、広告プレビューのスイッチの近くにある「埋め込みオーバーレイ」の文字に引きずられ、
  // 無関係なスイッチが「Advantage+ クリエイティブ エンハンス」に分類されたため。
  function classify(label) {
    if (label && typeof label === 'object') {
      if (label.rule) return label.rule; // まとめ文から読んだ項目は、見出しで項目が決まっている
      return classifyOne(label.text) || classifyOne(label.full);
    }
    return classifyOne(label);
  }

  // 広告の編集画面には、設定のまとめ文がある。例：
  //   Advantage+ クリエイティブエンハンス (4/5件)
  //   オフ: アニメーションを追加
  //   オン: オーバーレイを追加、ビジュアルのタッチアップ、音楽を追加、他1件
  // 括弧内は「ONの件数/全体の件数」。スクロール前でも読める可能性があるため、スイッチとは別に読む。
  const SUMMARY_GROUPS = [
    { rule: 'creative-enhance', label: 'Advantage+ クリエイティブ エンハンス', re: /Advantage\+?\s*クリエイティブ\s*エンハンス\s*[（(]\s*(\d+)\s*\/\s*(\d+)\s*件\s*[）)]/g },
    { rule: 'basic-enhance', label: '基本的なエンハンス', re: /基本的なエンハンス\s*[（(]\s*(\d+)\s*\/\s*(\d+)\s*件\s*[）)]/g },
    // 実機で見つかった形式：「クリエイティブの設定 (0/3件)　オフ: ブランディング、サイトリンク、ウェブサイトのハイライト」
    { rule: 'auto-extras', label: 'その他の自動追加（クリエイティブの設定）', re: /クリエイティブの設定\s*[（(]\s*(\d+)\s*\/\s*(\d+)\s*件\s*[）)]/g },
  ];
  const MAX_PLACEHOLDERS = 50;
  const SUMMARY_STOP = /Advantage\+?\s*クリエイティブ\s*エンハンス|基本的なエンハンス|クリエイティブの設定\s*[（(]|クリエイティブテスト|(?:^|\n)\s*\*?\s*メディア|(?:^|\n)\s*言語|トラッキング/;

  function splitNames(s) {
    return String(s || '').split(/[、,，]/).map((x) => x.trim()).filter(Boolean);
  }

  // 返り値: { items: [{text, full, ctx, state, rule, source}], found: [{rule, label, on, total, parsedOn}] }
  function parseSummary(text) {
    const items = [];
    const found = [];
    const src = String(text || '');
    for (const g of SUMMARY_GROUPS) {
      g.re.lastIndex = 0;
      let m;
      while ((m = g.re.exec(src))) {
        let seg = src.slice(m.index + m[0].length, m.index + m[0].length + 500);
        const cut = seg.search(SUMMARY_STOP);
        if (cut > 0) seg = seg.slice(0, cut);
        const onM = /オン\s*[:：]\s*([^\n]*?)(?=オフ\s*[:：]|\n|$)/.exec(seg);
        const offM = /オフ\s*[:：]\s*([^\n]*?)(?=オン\s*[:：]|\n|$)/.exec(seg);
        let parsedOn = 0;
        const push = (name, state) => {
          const other = /^他\s*(\d+)\s*件$/.exec(name);
          if (other) {
            // 件数はページ由来の数値なので、上限を設ける
            for (let k = 1; k <= Math.min(Number(other[1]), MAX_PLACEHOLDERS); k++) {
              // オンとオフの両方に「他N件」があっても、同じ text で上書きし合わないよう、状態を text に含める
              const mark = state === 'on' ? 'オン' : 'オフ';
              items.push({ text: `${g.label}：名称不明(${mark})${k}`, full: name, ctx: '', state, rule: g.rule, source: 'summary' });
              if (state === 'on') parsedOn++;
            }
          } else {
            items.push({ text: name, full: name, ctx: '', state, rule: g.rule, source: 'summary' });
            if (state === 'on') parsedOn++;
          }
        };
        if (onM) splitNames(onM[1]).forEach((n) => push(n, 'on'));
        if (offM) splitNames(offM[1]).forEach((n) => push(n, 'off'));
        // 括弧内のON件数より、名前を読めたON件数が少ないときは、差の分を「ON（名称不明）」として数える（安全側）
        for (let k = parsedOn; k < Math.min(Number(m[1]), MAX_PLACEHOLDERS); k++) {
          items.push({ text: `${g.label}：名称不明（件数差）${k + 1}`, full: '', ctx: '', state: 'on', rule: g.rule, source: 'summary' });
        }
        found.push({ rule: g.rule, label: g.label, on: Number(m[1]), total: Number(m[2]), parsedOn });
      }
    }
    return { items, found };
  }

  // 画面の描画は見えている範囲だけのことがあるため、スキャンのたびに結果を store（Map）へ合算する。
  // 同じタイトルは最新の状態で上書きする。
  function mergeItems(store, items) {
    for (const it of items) store.set(it.text, it);
    return store;
  }

  // まとめ文の結果を store に反映する。いま見つかった見出し（項目）の前回の「名称不明」だけを消して数え直し、
  // 見つからなかった見出しの記憶は残す（見えていない側のONを消してOKに変えない）。
  function mergeSummary(store, parsed) {
    if (parsed.found.length) {
      const rules = new Set(parsed.found.map((f) => f.rule));
      Array.from(store.keys()).forEach((key) => {
        const it = store.get(key);
        if (it.source === 'summary' && key.includes('：名称不明') && rules.has(it.rule)) store.delete(key);
      });
    }
    return mergeItems(store, parsed.items);
  }

  // items: [{ text, full?, state: 'on' | 'off' | 'unknown' }]
  // enabledIds: 判定対象のルールID配列（省略時は全ルール）
  // 返り値: { results, summary, unclassified, unclassifiedItems }
  function evaluate(items, enabledIds) {
    const enabled = enabledIds ? new Set(enabledIds) : null;
    const buckets = {};
    for (const r of RULES) buckets[r.id] = [];
    const unclassifiedItems = [];
    for (const it of items) {
      const id = classify(it);
      if (id) buckets[id].push(it);
      else unclassifiedItems.push(it);
    }
    const results = [];
    const summary = { ng: 0, ok: 0, notfound: 0, unknown: 0 };
    for (const r of RULES) {
      if (enabled && !enabled.has(r.id)) continue;
      const list = buckets[r.id];
      const on = list.filter((x) => x.state === 'on');
      const off = list.filter((x) => x.state === 'off');
      const unk = list.filter((x) => x.state === 'unknown');
      let status;
      if (list.length === 0) status = 'notfound';
      else if (on.length > 0) status = 'ng';
      else if (unk.length > 0) status = 'unknown';
      else status = 'ok';
      summary[status]++;
      results.push({
        id: r.id, title: r.title, hint: r.hint, status,
        total: list.length, on: on.length, off: off.length, unknown: unk.length,
        onLabels: on.map((x) => x.text),
        restored: list.filter((x) => x.restored).length,
      });
    }
    return { results, summary, unclassified: unclassifiedItems.length, unclassifiedItems };
  }

  function detailOf(r) {
    if (r.status === 'ng') return `ONのスイッチ ${r.on}/${r.total}件：${r.onLabels.join('、')}`;
    if (r.status === 'notfound') return 'この画面に該当スイッチが見つかりません';
    if (r.status === 'unknown') return `スイッチ ${r.total}件のうち ${r.unknown}件のON/OFFを読み取れません`;
    const note = r.restored ? `（うち${r.restored}件は前回の確認の記憶。再確認してください）` : '';
    return `スイッチ ${r.total}件がすべてOFF${note}`;
  }

  function toText(evaluation) {
    const mark = { ng: 'NG', ok: 'OK', notfound: '未検出', unknown: '状態不明' };
    return evaluation.results.map((r) => `[${mark[r.status]}] ${r.title}：${detailOf(r)}`).join('\n');
  }

  return { RULES, classify, evaluate, toText, detailOf, mergeItems, mergeSummary, parseSummary };
});
