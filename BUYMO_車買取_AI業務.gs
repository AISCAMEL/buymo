/* ============================================================
   BUYMO 本部の AI（AI業務.gs）
   ------------------------------------------------------------
   「BUYMO 車買取 LINE AI応答」の GAS に足すファイル（ファイル名「AI業務」）。
   本部の画面から呼ばれて、Claude API で次のことをする（合言葉 ADMIN_KEY で確認）。
     ・aiRead   ：車検証・印鑑証明・免許証などの写真や PDF を読み取って、項目に分ける（転記用）
     ・aiAssist ：本部の AI アシスタント。話しかけた内容から、返事と「やること（操作の候補）」を返す
                  操作は本部の画面が「これでいいですか？［実行］」と見せて、人が押したときだけ行う
   使うプロパティ：ANTHROPIC_API_KEY（LINE の AI と同じもの）、CLAUDE_MODEL（任意）
   コード.gs の管理用 API（adminApi_）から呼ばれる。準備は不要（貼ってデプロイするだけ）。
   ============================================================ */

var AI_DOC_KINDS = {
  shaken: {
    label: '車検証（自動車検査証・記録事項）',
    fields: [['plate', '登録番号（ナンバー）'], ['kind', '自動車の種別（普通・小型・軽など）'], ['maker', '車名（メーカー）'], ['model', '車種名（わかれば）'],
      ['model_code', '型式'], ['vin', '車台番号'], ['engine', '原動機の型式'], ['first_reg', '初度登録年月（または初度検査年月）'],
      ['expiry', '有効期間の満了する日'], ['owner_name', '所有者の氏名又は名称'], ['owner_addr', '所有者の住所'],
      ['user_name', '使用者の氏名又は名称'], ['user_addr', '使用者の住所'], ['base', '使用の本拠の位置'],
      ['use', '用途（乗用・貨物など）'], ['private', '自家用・事業用の別'], ['shape', '車体の形状'], ['capacity', '乗車定員'],
      ['displacement', '総排気量又は定格出力'], ['fuel', '燃料の種類'], ['mileage', '走行距離計表示値（記載があれば）']]
  },
  inkan: {
    label: '印鑑登録証明書',
    fields: [['name', '氏名'], ['addr', '住所'], ['birth', '生年月日'], ['issued', '発行日'], ['issuer', '発行した市区町村']]
  },
  license: {
    label: '運転免許証',
    fields: [['name', '氏名'], ['addr', '住所'], ['birth', '生年月日'], ['expiry', '有効期限']]
  },
  other: {
    label: 'そのほかの書類',
    fields: [['title', '書類の種類'], ['name', '氏名・名称'], ['addr', '住所'], ['date', '日付'], ['summary', '書いてある大事なこと（3行まで）']]
  }
};

function aiAdmin_(req) {
  if (!PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY')) return { ok: false, error: 'nokey' };
  if (req.action === 'aiRead') return aiRead_(req);
  if (req.action === 'aiAssist') return aiAssist_(req);
  return { ok: false, error: 'action' };
}

// Claude API を呼ぶ（画像・PDF も渡せる）。返事の文字だけを返す。失敗したら null
function aiCall_(system, messages, opt) {
  opt = opt || {};
  var props = PropertiesService.getScriptProperties();
  var model = String(props.getProperty('CLAUDE_MODEL') || 'claude-opus-5-5').trim();
  try {
    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': props.getProperty('ANTHROPIC_API_KEY'),
        'anthropic-version': '2026-10-21',
        'anthropic-beta': 'server-side-fallback-2026-07-01'
      },
      payload: JSON.stringify({
        model: model,
        max_tokens: opt.maxTokens || 3000,
        system: system,
        output_config: { effort: opt.effort || 'low' },
        fallbacks: 'default',
        messages: messages
      }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code !== 200) {
      Logger.log('aiCall_ ' + code + ': ' + res.getContentText().slice(0, 400));
      reportError_('本部のAI（Claude API）', 'HTTP ' + code, res.getContentText().slice(0, 300));
      return null;
    }
    var data = JSON.parse(res.getContentText());
    if (data.stop_reason === 'refusal') return null;
    return (data.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('').trim() || null;
  } catch (err) {
    Logger.log('aiCall_: ' + err.message);
    reportError_('本部のAI', err);
    return null;
  }
}

// 文の中から最初の { … } を取り出して JSON にする
function aiJson_(text) {
  var s = String(text || '');
  var i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; }
}

/* ---------- 書類の読み取り ---------- */
function aiRead_(req) {
  var mime = String(req.mime || '');
  var data = String(req.data || '');
  if (!data || data.length > 12 * 1024 * 1024) return { ok: false, error: 'size' };
  var isPdf = mime === 'application/pdf';
  if (!isPdf && !/^image\/(jpeg|png|gif|webp)$/.test(mime)) return { ok: false, error: 'type' };
  var kind = AI_DOC_KINDS[req.kind] ? req.kind : 'auto';
  var kinds = kind === 'auto' ? Object.keys(AI_DOC_KINDS) : [kind];
  var spec = kinds.map(function (k) {
    return '「' + k + '」' + AI_DOC_KINDS[k].label + '：' + AI_DOC_KINDS[k].fields.map(function (f) { return f[0] + '＝' + f[1]; }).join('、');
  }).join('\n');
  var system = [
    'あなたは車買取の本部で、お客様からいただいた書類の写真や PDF を読み取って転記する係です。',
    '書いてあることだけを正確に写す。読めない・書いていない項目は空文字にする。推測で埋めない。',
    '和暦はそのまま写す（例：令和3年4月）。数字・英字は半角にする。車台番号・型式は記号も含めてそのまま。',
    '返事は JSON だけ。形：{"kind":"書類の種類のキー","fields":{"キー":"値",…},"unclear":["読みにくかった項目のキー"],"note":"気づいたこと（なければ空）"}',
    '書類の種類と項目のキー：',
    spec
  ].join('\n');
  var block = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data } }
    : { type: 'image', source: { type: 'base64', media_type: mime, data: data } };
  var text = aiCall_(system, [{ role: 'user', content: [block, { type: 'text', text: kind === 'auto' ? 'この書類を読み取ってください。種類も判断してください。' : 'この' + AI_DOC_KINDS[kind].label + 'を読み取ってください。' }] }], { effort: 'medium', maxTokens: 2000 });
  if (!text) return { ok: false, error: 'ai' };
  var j = aiJson_(text);
  if (!j || !j.fields) return { ok: false, error: 'parse', raw: text.slice(0, 500) };
  var k2 = AI_DOC_KINDS[j.kind] ? j.kind : (kind === 'auto' ? 'other' : kind);
  var fields = {};
  AI_DOC_KINDS[k2].fields.forEach(function (f) { var v = j.fields[f[0]]; fields[f[0]] = v == null ? '' : String(v).trim().slice(0, 200); });
  return { ok: true, kind: k2, label: AI_DOC_KINDS[k2].label, fields: fields,
    names: AI_DOC_KINDS[k2].fields.reduce(function (o, f) { o[f[0]] = f[1]; return o; }, {}),
    unclear: Array.isArray(j.unclear) ? j.unclear.slice(0, 20) : [], note: String(j.note || '').slice(0, 300) };
}

/* ---------- AI アシスタント ---------- */
var AI_ASSIST_SYSTEM = [
  'あなたは BUYMO（車買取）の本部で働くスタッフを手伝う AI アシスタントです。日本語で、短く、やさしく答える。',
  '本部の仕事：お客様の査定の申込を受け、加盟店に担当を割り当て、査定 → 商談 → 契約 → 引取り → 入金 と進める。',
  '案件のステージ：新規受付／査定中／商談中／後追い／契約／入金待ち／完了／失注。',
  '本部の画面：今日やること(today)・案件ボード(board)・案件の一覧(leads)・車買取LINE(kaitoriline)・接客アシスト(chatassist)・書類発行(documents)・オークション(auctions)・加盟店(stores)・加盟店の動き(activity)・加盟店募集(recruit)・お知らせ(notices)・本部の使い方(manual)。',
  '',
  '# 返事の形（JSON だけを返す）',
  '{"reply":"スタッフへの返事（3〜8行）","actions":[操作の候補]}',
  '操作の候補（必要なときだけ。人が確認して［実行］を押したときだけ行われる。最大5つ）：',
  '- {"type":"stage","id":"案件ID","stage":"ステージ"}：ステージを変える',
  '- {"type":"assign","id":"案件ID","assignee":"加盟店名"}：担当を決める（加盟店名は一覧にあるものだけ）',
  '- {"type":"amount","id":"案件ID","amount":数字}：査定額（買取金額）を入れる',
  '- {"type":"note","id":"案件ID","text":"メモ"}：案件に対応メモを残す',
  '- {"type":"open","id":"案件ID"}：その案件を開く',
  '- {"type":"go","page":"画面のキー"}：その画面を開く',
  '- {"type":"draft","id":"案件ID（あれば）","to":"LINE または メール","text":"お客様に送る文の下書き"}：下書きを見せる（送るのは人）',
  '',
  '# 守ること',
  '- 案件の情報は、渡された「いまの案件」だけを使う。ない案件・ない数字を作らない。わからないときはそう言う。',
  '- 金額を決めたり、お客様に勝手に送ったりはしない。下書きと候補を出すだけ。',
  '- お客様に送る文は、ていねいで、しつこくない言い方にする。査定額を伝えるときは、根拠（装備・人気・相場）をひとこと添える。',
  '- 「今日やること」をまとめてと言われたら、急ぐ順に、なぜ急ぐかと、次の一手を書く。',
  '- 返事の reply にはマークダウンの記号（** や #）を使わない。箇条書きは「・」。'
].join('\n');

function aiAssist_(req) {
  var ctx = req.context || {};
  var msgs = (Array.isArray(req.messages) ? req.messages : []).slice(-12).map(function (m) {
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 4000) };
  }).filter(function (m) { return m.content; });
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length) return { ok: false, error: 'empty' };
  var c = [
    '# いまの状況（本部の画面から）',
    '日時：' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd（E）HH:mm'),
    '開いている画面：' + String(ctx.page || ''),
    '加盟店：' + (Array.isArray(ctx.stores) ? ctx.stores.join('、') : ''),
    ctx.staff ? '※ このスタッフにはお金の管理（請求書・支払い）を見せない。売上の合計などは答えない。' : '',
    '',
    '# いまの案件（新しい順・最大150件）',
    JSON.stringify((Array.isArray(ctx.cases) ? ctx.cases : []).slice(0, 150)).slice(0, 60000),
    ctx.line ? '\n# 車買取LINE で対応が必要な人\n' + JSON.stringify(ctx.line).slice(0, 8000) : '',
    ctx.extra ? '\n# 補足\n' + String(ctx.extra).slice(0, 4000) : ''
  ].join('\n');
  var text = aiCall_(AI_ASSIST_SYSTEM + '\n\n' + c, msgs, { effort: 'low', maxTokens: 2500 });
  if (!text) return { ok: false, error: 'ai' };
  var j = aiJson_(text);
  if (!j) return { ok: true, reply: text.slice(0, 3000), actions: [] };
  var ALLOWED = { stage: 1, assign: 1, amount: 1, note: 1, open: 1, go: 1, draft: 1 };
  var acts = (Array.isArray(j.actions) ? j.actions : []).filter(function (a) { return a && ALLOWED[a.type]; }).slice(0, 5);
  return { ok: true, reply: String(j.reply || '').slice(0, 3000), actions: acts };
}

// エディタから試す：AI につながるか
function testAIWork() {
  var r = aiAssist_({ messages: [{ role: 'user', content: '案件ボードの使い方を3行で教えて' }], context: { page: 'test', cases: [] } });
  Logger.log(JSON.stringify(r));
}
