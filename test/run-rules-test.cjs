// 判定ロジック（rules.js）の単体テスト。実行: node test/run-rules-test.cjs
const path = require('path');
const R = require(path.join(__dirname, '..', 'extension', 'rules.js'));
let fail = 0, n = 0;
function check(name, cond) { n++; if (!cond) { fail++; console.log('NG  ' + name); } else console.log('OK  ' + name); }

// 分類
check('翻訳 → translate', R.classify('クリエイティブ翻訳（テキスト）') === 'translate');
check('テキストの改善 → creative-enhance（翻訳に誤分類されない）', R.classify('テキストの改善') === 'creative-enhance');
check('柔軟性のあるメディア → flexible-media', R.classify('柔軟性のあるメディア') === 'flexible-media');
check('関連度が高いコメント → basic-enhance', R.classify('関連度が高いコメント') === 'basic-enhance');
check('英語 Flexible media', R.classify('Flexible media') === 'flexible-media');
check('英語 Translate text', R.classify('Translate text') === 'translate');
check('英語 Visual touch-ups', R.classify('Visual touch-ups') === 'creative-enhance');
check('複数広告主の広告 → multi-advertiser', R.classify('複数広告主の広告') === 'multi-advertiser');
check('無関係なラベルは null', R.classify('予算を最適化') === null);

// 判定
let ev = R.evaluate([
  { text: 'テキストの改善', state: 'off' },
  { text: 'オーバーレイを追加', state: 'on' },
  { text: '柔軟性のあるメディア', state: 'off' },
]);
const by = (e, id) => e.results.find((r) => r.id === id);
check('ONが1つでもあれば ng', by(ev, 'creative-enhance').status === 'ng' && by(ev, 'creative-enhance').on === 1);
check('全部OFFなら ok', by(ev, 'flexible-media').status === 'ok');
check('項目なしは notfound', by(ev, 'translate').status === 'notfound');
check('summary 集計', ev.summary.ng === 1 && ev.summary.ok === 1 && ev.summary.notfound === 4);

ev = R.evaluate([{ text: '翻訳', state: 'unknown' }]);
check('状態不明のみは unknown', by(ev, 'translate').status === 'unknown');

ev = R.evaluate([{ text: 'テキストの改善', state: 'on' }], ['flexible-media']);
check('対象外ルールは結果に出ない', ev.results.length === 1 && ev.results[0].id === 'flexible-media');

ev = R.evaluate([{ text: '予算を最適化', state: 'on' }]);
check('未分類は unclassified に数える', ev.unclassified === 1);

check('toText に NG 行が出る', R.toText(R.evaluate([{ text: '翻訳', state: 'on' }])).includes('[NG] クリエイティブ翻訳'));

// OFFと状態不明の混在、説明文による誤分類、パターンの絞り込み、表記ゆれ
ev = R.evaluate([{ text: '翻訳', state: 'off' }, { text: 'クリエイティブ翻訳', state: 'unknown' }]);
check('OFFと状態不明が混在したら unknown（OKにしない）', by(ev, 'translate').status === 'unknown');
check('unknown の文言に読み取れない件数が出る', R.detailOf(by(ev, 'translate')).includes('1件のON/OFFを読み取れません'));

check('タイトル行を優先（説明文に「翻訳」があっても、タイトルがテキストの改善なら creative-enhance）',
  R.classify({ text: 'テキストの改善', full: 'テキストの改善 言語ごとに翻訳して最適化します' }) === 'creative-enhance');
check('タイトルが無関係なら全文で照合する',
  R.classify({ text: '自動で最適化', full: '自動で最適化 テキストを翻訳します' }) === 'translate');
check('説明文に別項目の語があってもタイトル優先（タッチアップ > 明るさ）',
  R.classify({ text: 'ビジュアルのタッチアップ', full: 'ビジュアルのタッチアップ 明るさとコントラストを調整' }) === 'creative-enhance');

check('テンプレートとして保存 は対象外', R.classify('広告をテンプレートとして保存') === null);
check('13Dマップ は対象外', R.classify('13Dマップを表示') === null);
check('3D アニメーション は creative-enhance', R.classify('3D アニメーション') === 'creative-enhance');
check('Ad template は対象外', R.classify('Use ad template') === null);
check('画像テンプレート は creative-enhance', R.classify('画像テンプレート') === 'creative-enhance');
check('Music は creative-enhance、Musical instruments は対象外',
  R.classify('Add music') === 'creative-enhance' && R.classify('Musical instruments') === null);

check('複数の広告主の広告', R.classify('複数の広告主の広告') === 'multi-advertiser');
check('Multiple advertisers', R.classify('Multiple advertisers') === 'multi-advertiser');

ev = R.evaluate([{ text: '広告プレビュー', state: 'on' }, { text: '翻訳', state: 'off' }]);
check('判定対象外のスイッチの中身を返す', ev.unclassifiedItems.length === 1 && ev.unclassifiedItems[0].text === '広告プレビュー');

// 実機（広告マネージャのクリエイティブ設定）で見つかった表記への対応
check('実機: 広告掲載中に、関連するサイトリンクを特定して追加 → auto-extras',
  R.classify('広告掲載中に、関連するサイトリンクを特定して追加') === 'auto-extras');
check('実機: このブランディングを適用 → auto-extras', R.classify('このブランディングを適用') === 'auto-extras');
check('実機: 言語（説明文に自動翻訳）は全文照合で translate',
  R.classify({ text: '言語', full: '言語 広告にご自身の翻訳や自動翻訳を追加することで、より多くの言語のターゲットにリーチできます。' }) === 'translate');
check('実機: 広告プレビュー は対象外', R.classify('広告プレビュー') === null);

check('実機: トリミングと拡大（Meta AI）→ creative-enhance',
  R.classify({ text: 'トリミングと拡大', full: 'トリミングと拡大 Meta AI' }) === 'creative-enhance');
check('画像の拡張 → creative-enhance', R.classify('画像の拡張') === 'creative-enhance');
check('実機: CTAエンハンス → creative-enhance', R.classify('CTAエンハンス') === 'creative-enhance');
check('実機: 音楽を追加 → creative-enhance', R.classify('音楽を追加') === 'creative-enhance');

// 実機（2回目）で見つかった、タイトル行と説明文が別の要素にある構造への対応
check('実機: ラベルが「言語」だけで、説明文が別要素にあるスイッチは translate',
  R.classify({ text: '言語', full: '言語 オフ', ctx: '言語 オフ 広告にご自身の翻訳や自動翻訳を追加することで、より多くの言語のターゲットにリーチできます。 詳しくはこちら' }) === 'translate');
check('ctx が空でも動く（どの項目にも当てはまらないラベルは null）', R.classify({ text: '広告プレビュー', full: '広告プレビュー オン', ctx: '' }) === null);

// 描画が見えている範囲だけのときの合算
const store = new Map();
R.mergeItems(store, [{ text: '複数広告主の広告', full: '複数広告主の広告', state: 'on' }]);
R.mergeItems(store, [{ text: '言語', full: '言語 オフ', ctx: '言語 翻訳', state: 'off' }]);
let evm = R.evaluate(Array.from(store.values()));
check('合算: 前のスキャンの項目が画面外でも残る（複数広告主 NG）', evm.results.find((r) => r.id === 'multi-advertiser').status === 'ng');
check('合算: 後のスキャンの項目も入る（翻訳 OK）', evm.results.find((r) => r.id === 'translate').status === 'ok');
R.mergeItems(store, [{ text: '複数広告主の広告', full: '複数広告主の広告', state: 'off' }]);
evm = R.evaluate(Array.from(store.values()));
check('合算: 同じタイトルは最新の状態で上書き（OFFにしたら OK）', evm.results.find((r) => r.id === 'multi-advertiser').status === 'ok');

// 広告の編集画面の「設定のまとめ文」（実機のスクリーンショットの文言）
const SUMMARY_TEXT = [
  'クリエイティブ', 'Advantage+ クリエイティブエンハンス (4/5件)', 'オフ: アニメーションを追加',
  'オン: オーバーレイを追加、ビジュアルのタッチアップ、音楽を追加、他1件',
  '基本的なエンハンス (2/4件)', 'オフ: 明るさとコントラストを調整、スポットライトを表示',
  'オン: 関連度が高いコメント、CTAエンハンス', 'クリエイティブテスト', '最大7個のバージョンのクリエイティブを比較します。',
].join('\n');
let ps = R.parseSummary(SUMMARY_TEXT);
check('まとめ文: 2つの見出しを検出', ps.found.length === 2);
check('まとめ文: Advantage+ のON件数が括弧内(4)と一致', ps.found[0].on === 4 && ps.found[0].parsedOn === 4 && ps.found[0].total === 5);
check('まとめ文: 基本的なエンハンスのON件数が括弧内(2)と一致', ps.found[1].on === 2 && ps.found[1].parsedOn === 2 && ps.found[1].total === 4);
evm = R.evaluate(ps.items);
check('まとめ文: クリエイティブ エンハンスは NG（ON 4/5件）',
  evm.results.find((r) => r.id === 'creative-enhance').status === 'ng' && evm.results.find((r) => r.id === 'creative-enhance').on === 4);
check('まとめ文: 基本的なエンハンスも NG（関連度が高いコメント、CTAエンハンス）',
  evm.results.find((r) => r.id === 'basic-enhance').status === 'ng'
  && evm.results.find((r) => r.id === 'basic-enhance').onLabels.includes('CTAエンハンス'));
ps = R.parseSummary('Advantage+ クリエイティブエンハンス (0/5件)\nオフ: アニメーションを追加、音楽を追加');
check('まとめ文: すべてOFFなら OK', R.evaluate(ps.items).results.find((r) => r.id === 'creative-enhance').status === 'ok');
ps = R.parseSummary('基本的なエンハンス (1/4件)オフ: 明るさとコントラストを調整オン: 関連度が高いコメント');
check('まとめ文: オフ/オンが同じ行に続いていても分けて読む',
  ps.found[0].parsedOn === 1 && ps.items.filter((x) => x.state === 'off').length === 1);
ps = R.parseSummary('基本的なエンハンス (2/4件)\nオフ: 明るさとコントラストを調整\nオン: 関連度が高いコメント');
check('まとめ文: 名前を読めたON件数が括弧内より少なければ、差を ON（名称不明）で数える',
  R.evaluate(ps.items).results.find((r) => r.id === 'basic-enhance').on === 2);
check('まとめ文: 見出しが無ければ何も返さない', R.parseSummary('言語 オフ').found.length === 0);

// 件数の上限、見出しごとの名称不明の入れ替え
const t0 = Date.now();
ps = R.parseSummary('基本的なエンハンス (999999999/999999999件)\nオン: 他999999999件');
check('まとめ文: ページ由来の巨大な件数でも固まらない（上限50件）', ps.items.length <= 50 && Date.now() - t0 < 1000);

const st2 = new Map();
R.mergeSummary(st2, R.parseSummary('Advantage+ クリエイティブエンハンス (2/5件)\nオン: 他2件\n基本的なエンハンス (1/4件)\nオン: 他1件'));
check('合算の前提: 2見出しの名称不明が入る',
  R.evaluate(Array.from(st2.values())).results.find((r) => r.id === 'creative-enhance').on === 2
  && R.evaluate(Array.from(st2.values())).results.find((r) => r.id === 'basic-enhance').on === 1);
// 基本的なエンハンスの見出しだけが見えている状態で読み直す（Advantage+ 側は画面にない）
R.mergeSummary(st2, R.parseSummary('基本的なエンハンス (0/4件)\nオフ: 明るさとコントラストを調整'));
evm = R.evaluate(Array.from(st2.values()));
check('見えていない見出し（Advantage+）の名称不明のONは残り、NGのまま', evm.results.find((r) => r.id === 'creative-enhance').status === 'ng');
check('見えている見出し（基本的なエンハンス）は、数え直されて OK になる', evm.results.find((r) => r.id === 'basic-enhance').status === 'ok');

// オンとオフの両方に「他N件」があっても、ONの数え落としが起きない
ps = R.parseSummary('Advantage+ クリエイティブエンハンス (2/5件)\nオフ: 他2件\nオン: 他2件');
const stBoth = new Map();
R.mergeSummary(stBoth, ps);
const bothRes = R.evaluate(Array.from(stBoth.values())).results.find((r) => r.id === 'creative-enhance');
check('まとめ文: オンとオフの両方に「他N件」があっても、ONの数が括弧内(2)と一致', ps.found[0].parsedOn === 2 && bothRes.on === 2 && bothRes.off === 2);
check('まとめ文: 名称不明の text はオンとオフで異なる', new Set(ps.items.map((x) => x.text)).size === 4);

// 実機（2回目の下書き）で見つかった、まとめ文の形式「クリエイティブの設定 (n/m件)」
const SUMMARY_TEXT2 = [
  'クリエイティブ', '広告テキスト、メディア、エンハンスを選択して最適化します。',
  'クリエイティブの設定(0/3件)', 'オフ: ブランディング, サイトリンク、ウェブサイトのハイライト', '編集',
  '* メディア', 'フィード、リール動画のインストリーム広告',
].join('\n');
ps = R.parseSummary(SUMMARY_TEXT2);
check('まとめ文: クリエイティブの設定(0/3件)を検出', ps.found.length === 1 && ps.found[0].rule === 'auto-extras' && ps.found[0].total === 3);
check('まとめ文: 3項目すべてOFFとして読む（ブランディング、サイトリンク、ウェブサイトのハイライト）',
  ps.items.length === 3 && ps.items.every((x) => x.state === 'off'));
check('まとめ文: 「その他の自動追加」は OK になる', R.evaluate(ps.items).results.find((r) => r.id === 'auto-extras').status === 'ok');
ps = R.parseSummary('クリエイティブの設定(1/3件)\nオフ: ブランディング、サイトリンク\nオン: ウェブサイトのハイライト\n編集');
check('まとめ文: ウェブサイトのハイライトがONなら「その他の自動追加」は NG',
  R.evaluate(ps.items).results.find((r) => r.id === 'auto-extras').status === 'ng');
check('スイッチのラベル: ウェブサイトのハイライト → auto-extras', R.classify('ウェブサイトのハイライト') === 'auto-extras');
// 3種類のまとめ文が同じ画面にあっても、それぞれ読める
ps = R.parseSummary(SUMMARY_TEXT2 + '\nAdvantage+ クリエイティブエンハンス (1/5件)\nオフ: アニメーションを追加\nオン: 音楽を追加\n基本的なエンハンス (0/4件)\nオフ: 他4件');
check('まとめ文: 3つの見出しが同じ画面にあっても、それぞれ読める', ps.found.length === 3);

// 実機（2回目の下書き）で、「言語：OFF」が判定対象外に入った不具合への対応
check('実機: ラベルが「言語」だけのスイッチは translate', R.classify('言語') === 'translate' && R.classify({ text: '言語', full: '言語 オフ', ctx: '' }) === 'translate');
check('「言語」を含む別のラベル（言語を選択）は translate にしない', R.classify('言語を選択') === null);

// 実機で、「広告プレビュー」が、周囲の文字（埋め込みオーバーレイ）で Advantage+ に誤分類された不具合への対応
check('実機: 広告プレビューは、周囲の文字に「オーバーレイ」があっても、どの項目にも分類しない',
  R.classify({ text: '広告プレビュー', full: '広告プレビュー', ctx: '広告プレビュー 埋め込みオーバーレイ デフォルトを確認' }) === null);
check('周囲の文字は、分類には使わない（タイトルと全文が無関係なら null）',
  R.classify({ text: '自動で最適化', full: '自動で最適化', ctx: 'テキストを翻訳します' }) === null);

// 前回の記憶（restored）を含む OK には注記が付く
evm = R.evaluate([{ text: '音楽を追加', full: '音楽を追加', state: 'off', restored: true }]);
check('記憶を含む OK は注記が付く', R.detailOf(evm.results.find((r) => r.id === 'creative-enhance')).includes('前回の確認の記憶'));

const S = require(path.join(__dirname, '..', 'extension', 'scanner.js'));
check('状態文言: オン/オフ', S.isStateOnly('オン/オフ'));
check('状態文言: オフ', S.isStateOnly('オフ'));
check('状態文言: ON / OFF', S.isStateOnly('ON / OFF'));
check('状態文言: 「複数広告主の広告」は状態文言ではない', !S.isStateOnly('複数広告主の広告'));

console.log(`\n${n - fail}/${n} 件が期待どおり`);
process.exit(fail ? 1 : 0);
