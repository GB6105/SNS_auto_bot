#!/usr/bin/env bash
# generate-html.sh — observer-log.jsonl → observer-log.html (self-contained)
# 사용: bash .scaffold/v0/observer/generate-html.sh "$(pwd)/workspace"
set -euo pipefail

WORKSPACE_DIR="${1:-$(pwd)/workspace}"
JSONL="${WORKSPACE_DIR}/observer-log.jsonl"
OUT="${WORKSPACE_DIR}/observer-log.html"

if ! command -v jq >/dev/null 2>&1; then
  echo "[generate-html] jq가 필요합니다. (init.sh가 정적 바이너리 설치를 시도합니다)" >&2
  exit 1
fi
if [ ! -f "$JSONL" ]; then
  echo "[generate-html] $JSONL 없음" >&2
  exit 1
fi

# JSONL → 단일 JSON 배열(각 줄을 객체로 슬러프). 잘못된 줄은 jq -s가 실패시키므로 유효성도 검증됨.
EVENTS_JSON="$(jq -s '.' "$JSONL")"

cat > "$OUT" <<HTMLDOC
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Observer Log — prd-scaffold-v0</title>
<style>
  :root{--bg:#0d1117;--card:#161b22;--bd:#30363d;--fg:#e6edf3;--mut:#8b949e;--ac:#58a6ff;--ok:#3fb950;--warn:#d29922;--err:#f85149;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;line-height:1.5}
  header{padding:24px 28px;border-bottom:1px solid var(--bd)}
  h1{margin:0;font-size:20px}
  .sub{color:var(--mut);font-size:13px;margin-top:4px}
  main{max-width:1100px;margin:0 auto;padding:24px 28px}
  section{margin-bottom:32px}
  h2{font-size:15px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);border-bottom:1px solid var(--bd);padding-bottom:8px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
  .metric{background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:16px;text-align:center}
  .metric .n{font-size:28px;font-weight:700;color:var(--ac)}
  .metric .l{font-size:12px;color:var(--mut);margin-top:4px}
  .card{background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:16px;margin-bottom:14px}
  .card h3{margin:0 0 6px;font-size:14px}
  .card .meta{font-size:12px;color:var(--mut);margin-bottom:8px}
  .tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:10px;background:#1f6feb33;color:var(--ac);margin-right:6px}
  ul{margin:6px 0;padding-left:18px}
  li{font-size:13px;margin:2px 0}
  .timeline li{border-left:2px solid var(--bd);padding:4px 0 4px 14px;list-style:none;margin-left:4px}
  .escalate{border-color:var(--err)!important;color:var(--err)}
  .empty{color:var(--mut);font-style:italic}
  code{background:#1f242c;padding:1px 5px;border-radius:4px;font-size:12px}
  .mermaid{background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:16px}
</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</head>
<body>
<header>
  <h1>🛰️ Observer Log — prd-scaffold-v0</h1>
  <div class="sub">추상 Plan → PRD 파이프라인 관찰 대시보드</div>
</header>
<main>
  <section><h2>파이프라인</h2>
    <div class="mermaid">
flowchart LR
  IN[input-plan.txt] --> P1[P1 Socratic]
  P1 --> P2[P2 PM]
  P2 --> P3[P3 Engineer]
  P3 --> P4[P4 User]
  P4 --> P5[P5 Devil]
  P5 --> P6[P6 SlopChecker]
  P6 --> P7[P7 Synthesis]
  P7 --> OUT[PRD.md / prd.json]
    </div>
  </section>
  <section><h2>메트릭 대시보드</h2><div id="dash" class="grid"></div></section>
  <section><h2>Phase 카드</h2><div id="cards"></div></section>
  <section><h2>의사결정 타임라인</h2><ul id="timeline" class="timeline"></ul></section>
  <section><h2>분쟁 / ESCALATE 트래커</h2><div id="disputes"></div></section>
</main>
<script>
const EVENTS = ${EVENTS_JSON};

// 보안: 모든 동적 innerHTML에 적용
function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// 메트릭 집계 — 최신 metrics를 병합(후행 Phase가 누적 수치를 갖는 경향)
function num(v){ return typeof v === 'number' ? v : 0; }
const agg = {p0:0,p1:0,p2:0,slop:0,total:0};
for(const ev of EVENTS){
  const m = ev.metrics || {};
  if('p0' in m) agg.p0 = num(m.p0);
  if('p1' in m) agg.p1 = num(m.p1);
  if('p2' in m) agg.p2 = num(m.p2);
  if('slop_removed' in m) agg.slop = num(m.slop_removed);
  if('slop' in m) agg.slop = num(m.slop);
  if('total_stories' in m) agg.total = num(m.total_stories);
  else if('stories' in m) agg.total = num(m.stories);
}
const dashItems = [
  ['P0', agg.p0], ['P1', agg.p1], ['P2', agg.p2],
  ['Slop 제거', agg.slop], ['총 스토리', agg.total],
];
document.getElementById('dash').innerHTML = dashItems.map(
  ([l,n]) => '<div class="metric"><div class="n">'+esc(n)+'</div><div class="l">'+esc(l)+'</div></div>'
).join('');

// Phase 카드
document.getElementById('cards').innerHTML = EVENTS.map(ev => {
  const decs = (ev.decisions || []).map(d =>
    '<li><span class="tag">'+esc(d.type)+'</span>'+esc(d.item)+' → <code>'+esc(d.value)+'</code> '+esc(d.reason ? '· '+d.reason : '')+'</li>'
  ).join('') || '<li class="empty">결정 없음</li>';
  const mets = Object.entries(ev.metrics || {}).map(([k,v]) =>
    '<span class="tag">'+esc(k)+': '+esc(v)+'</span>'
  ).join('') || '<span class="empty">메트릭 없음</span>';
  return '<div class="card">'
    + '<h3>Phase '+esc(ev.phase)+' — '+esc(ev.agent)+'</h3>'
    + '<div class="meta">'+esc(ev.timestamp)+' · <code>'+esc(ev.output_file)+'</code></div>'
    + '<div>'+esc(ev.summary)+'</div>'
    + '<div style="margin-top:8px">'+mets+'</div>'
    + '<ul>'+decs+'</ul>'
    + '</div>';
}).join('');

// 의사결정 타임라인
const allDecs = EVENTS.flatMap(ev => (ev.decisions || []).map(d => ({...d, phase: ev.phase, agent: ev.agent})));
document.getElementById('timeline').innerHTML = allDecs.length
  ? allDecs.map(d =>
      '<li class="'+(d.type === 'escalate' ? 'escalate' : '')+'">'
      + 'P'+esc(d.phase)+' ['+esc(d.agent)+'] <span class="tag">'+esc(d.type)+'</span>'
      + esc(d.item)+' → <code>'+esc(d.value)+'</code></li>'
    ).join('')
  : '<li class="empty">의사결정 이벤트 없음</li>';

// 분쟁 / ESCALATE 트래커
const escalations = EVENTS.flatMap(ev => (ev.decisions || []).filter(d => d.type === 'escalate'));
const disputes = EVENTS.flatMap(ev => (ev.disputes || []));
let dh = '';
dh += '<div class="card"><h3>ESCALATE ('+escalations.length+')</h3><ul>'
   + (escalations.map(d => '<li class="escalate">'+esc(d.item)+' — '+esc(d.reason)+'</li>').join('') || '<li class="empty">없음</li>')
   + '</ul></div>';
dh += '<div class="card"><h3>미해결 분쟁 ('+disputes.length+')</h3><ul>'
   + (disputes.map(x => '<li>'+esc(typeof x === 'string' ? x : JSON.stringify(x))+'</li>').join('') || '<li class="empty">없음</li>')
   + '</ul></div>';
document.getElementById('disputes').innerHTML = dh;

mermaid.initialize({ startOnLoad: true, theme: 'dark' });
</script>
</body>
</html>
HTMLDOC

echo "[generate-html] 생성: $OUT (이벤트 $(jq 'length' <<<"$EVENTS_JSON")개)"
