/* 아에르돈의 계약 — 게임 엔진 (정적 분기 내러티브)
   scenario_v3.json을 읽어 노드별 스토리/선택지/이미지를 렌더링하고,
   선택의 결과(effects)를 상태에 반영해 분기를 처리한다.
   연출(흔적 바, 산문 페이드인, 숫자키 선택, 엔딩)은 표현 계층에서 더한다. */

console.log('[game.js] loaded');

const $ = (s) => document.querySelector(s);

const dom = {
  sceneArea: $('#scene-area'),
  sceneImage: $('#scene-image'),
  sceneControls: $('#scene-image-controls'),
  scenePrev: $('#scene-image-prev'),
  sceneNext: $('#scene-image-next'),
  sceneCounter: $('#scene-image-counter'),
  storyText: $('#story-text'),
  choices: $('#choices-area'),
  trace: $('#trace'),
  collectionOpen: $('#ending-collection-open'),
  collectionOverlay: $('#ending-collection-overlay'),
  collectionClose: $('#ending-collection-close'),
  collectionGrid: $('#ending-collection-grid'),
  collectionStats: $('#ending-collection-stats'),
  collectionReset: $('#ending-collection-reset'),
};

let scenario = null;
let gameState = null;
let currentSceneImages = [];
let currentSceneImageIndex = 0;
let choiceMap = []; // 화면에 보이는 선택지 위치(0..n) → 원본 choices 인덱스 (숫자키 매핑용)
let prevTrace = new Set();
let unlockedEndings = [];
const ENDING_COLLECTION_KEY = 'lumendria-unlocked-endings';

// 흔적 바에 표시할 상태 — 플레이어가 '쥔 것 / 되어버린 것'
const TRACE_DEFS = [
  { key: 'hasSword', label: '검' },
  { key: 'hasRelic', label: '유물' },
  { key: 'knowsTruth', label: '진실' },
  { key: 'sawSecret', label: '비밀' },
  { key: 'corrupted', label: '타락', danger: true },
  { key: 'killedVillager', label: '피', danger: true },
];

// ─── 이미지 ──────────────────────────────────────────────

// 노드의 이미지 경로 목록을 반환한다.
// 시나리오의 이미지는 모두 "images/<이름>-<번호>.png" 상대경로로 통일돼 있어
// 별도 변환 없이 그대로 사용한다.
function getNodeImages(node) {
  const raw = node?.images ?? node?.image ?? [];
  const entries = Array.isArray(raw) ? raw : [raw];
  return entries.filter((e) => typeof e === 'string' && e.trim());
}

// 이미지 캐러셀: index 위치부터 보여주되, 로드에 실패하면 다음 이미지로 넘어간다.
function showSceneImage(index) {
  const count = currentSceneImages.length;
  if (count === 0) return;
  let attempts = 0;

  function tryShow(i) {
    if (attempts >= count) return; // 전부 실패하면 프레임을 접는다
    attempts++;
    const idx = ((i % count) + count) % count;
    const url = currentSceneImages[idx];
    const img = new Image();
    img.onload = () => {
      currentSceneImageIndex = idx;
      dom.sceneArea.classList.remove('is-empty');
      dom.sceneImage.style.backgroundImage = `url('${url}')`;
      dom.sceneImage.classList.add('has-image');
      dom.sceneImage.style.cursor = count > 1 ? 'pointer' : 'default';
      dom.sceneControls.classList.add('hidden');
      dom.sceneCounter.textContent = '';
    };
    img.onerror = () => {
      if (attempts >= count) dom.sceneArea.classList.add('is-empty');
      tryShow(idx + 1);
    };
    img.src = url;
  }

  tryShow(index);
}

function updateScene() {
  const node = scenario.nodes[gameState.current_node];
  currentSceneImages = getNodeImages(node);
  currentSceneImageIndex = 0;

  dom.sceneImage.classList.remove('has-image');
  dom.sceneImage.style.backgroundImage = '';
  dom.sceneImage.style.cursor = 'default';
  dom.sceneControls.classList.add('hidden');
  dom.sceneCounter.textContent = '';

  if (currentSceneImages.length > 0) {
    showSceneImage(0); // 성공 시 is-empty 해제
  } else {
    dom.sceneArea.classList.add('is-empty'); // 텍스트 중심 노드
  }
}

// 도감이 완성되었는지 확인 (모든 일반 엔딩 9개 해금)
function isCollectionComplete() {
  return unlockedEndings.length >= 9;
}

// 타이틀 화면의 "진정한 엔딩" 버튼을 업데이트한다
function updateUltimateEndingButton() {
  const btn = document.getElementById('ultimate-ending-btn');
  if (!btn) return;
  if (isCollectionComplete()) {
    btn.classList.remove('hidden');
    btn.disabled = false;
  } else {
    btn.classList.add('hidden');
    btn.disabled = true;
  }
}

// 진정한 엔딩 시작
function startUltimateEnding() {
  const title = document.getElementById('screen-title');
  const gameScreen = document.getElementById('screen-game');
  if (title) title.classList.remove('active');
  if (gameScreen) {
    gameScreen.classList.add('active');
    gameScreen.classList.remove('ending-mode');
  }

  gameState = { ...scenario.initial_state };
  prevTrace = new Set();
  enterNode('ultimate_ending');
}

window.startUltimateEnding = startUltimateEnding;

function loadUnlockedEndings() {
  try {
    const raw = localStorage.getItem(ENDING_COLLECTION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === 'string' && e.trim()) : [];
  } catch (e) {
    console.warn('[collection] 저장된 엔딩 정보를 불러오지 못했습니다.', e);
    return [];
  }
}

function saveUnlockedEndings() {
  try {
    localStorage.setItem(ENDING_COLLECTION_KEY, JSON.stringify(unlockedEndings));
  } catch (e) {
    console.warn('[collection] 엔딩 정보를 저장하지 못했습니다.', e);
  }
}

function resetEndingCollection() {
  const confirmed = window.confirm('진짜 초기화하시겠습니까?\n엔딩 도감 수집 기록이 모두 삭제됩니다.');
  if (!confirmed) return;

  unlockedEndings = [];
  saveUnlockedEndings();
  renderEndingCollection();
  updateUltimateEndingButton();
}

function unlockEnding(nodeKey) {
  if (!nodeKey || !scenario?.nodes?.[nodeKey]?.ending) return;
  if (!unlockedEndings.includes(nodeKey)) {
    unlockedEndings.push(nodeKey);
    saveUnlockedEndings();
  }
  renderEndingCollection();
}

function getEndingCollectionEntries() {
  if (!scenario?.nodes) return [];
  const entries = Object.entries(scenario.nodes)
    .filter(([, node]) => Boolean(node?.ending))
    .map(([key, node]) => ({
      key,
      title: node?.title || node?.label || key.replace(/_/g, ' '),
      image: Array.isArray(node?.images) ? node.images[0] : '',
      text: node?.text || '',
      unlocked: unlockedEndings.includes(key),
    }));

  const baseEntries = entries.filter((entry) => entry.key !== 'ultimate_ending');
  if (isCollectionComplete()) {
    return [...baseEntries, entries.find((entry) => entry.key === 'ultimate_ending')].filter(Boolean);
  }
  return baseEntries;
}

function renderEndingCollection() {
  if (!dom.collectionGrid || !dom.collectionStats) return;
  const entries = getEndingCollectionEntries();
  dom.collectionStats.textContent = `해금됨 ${entries.filter((entry) => entry.unlocked).length} / ${entries.length}`;
  dom.collectionGrid.innerHTML = '';

  if (entries.length === 0) {
    dom.collectionGrid.innerHTML = '<div class="collection-empty">모든 엔딩을 해금하면 도감의 자리가 열립니다.</div>';
    return;
  }

  entries.forEach((entry) => {
    const card = document.createElement('div');
    card.className = `ending-card${entry.unlocked ? ' is-unlocked' : ' is-locked'}`;

    const preview = document.createElement('div');
    preview.className = 'ending-card__preview';
    if (entry.unlocked && entry.image) {
      preview.style.backgroundImage = `url('${entry.image}')`;
    }
    preview.innerHTML = entry.unlocked ? '' : '<span>???</span>';

    const title = document.createElement('div');
    title.className = 'ending-card__title';
    title.textContent = entry.unlocked ? entry.title : '???';

    const desc = document.createElement('div');
    desc.className = 'ending-card__desc';
    desc.textContent = entry.unlocked ? '해금된 엔딩' : '아직 해금되지 않았습니다.';

    card.append(preview, title, desc);
    dom.collectionGrid.appendChild(card);
  });
}

function openEndingCollection() {
  renderEndingCollection();
  dom.collectionOverlay?.classList.remove('hidden');
  dom.collectionOverlay?.setAttribute('aria-hidden', 'false');
}

function closeEndingCollection() {
  dom.collectionOverlay?.classList.add('hidden');
  dom.collectionOverlay?.setAttribute('aria-hidden', 'true');
}

function handleSceneImageClick(event) {
  if (currentSceneImages.length <= 1) return;

  const rect = dom.sceneImage.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const isLeftSide = clickX < rect.width / 2;
  showSceneImage(currentSceneImageIndex + (isLeftSide ? -1 : 1));
}

// ─── 흔적 바 ─────────────────────────────────────────────

function renderTrace() {
  const active = TRACE_DEFS.filter((d) => gameState[d.key]);
  dom.trace.innerHTML = '';
  active.forEach((d) => {
    const pill = document.createElement('span');
    pill.className = 'pill';
    if (d.danger) pill.classList.add('pill-danger');
    if (!prevTrace.has(d.key)) pill.classList.add('pill-new'); // 새로 얻은 것만 등장 연출
    pill.textContent = d.label;
    dom.trace.appendChild(pill);
  });
  dom.trace.classList.toggle('is-empty', active.length === 0);
  prevTrace = new Set(active.map((d) => d.key));
}

// ─── 스토리 / 선택지 ─────────────────────────────────────

// 산문을 줄 단위로 나눠 한 줄씩 페이드인한다 (시네마틱 리딩).
function renderStoryText(text) {
  dom.storyText.innerHTML = '';
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const p = document.createElement('p');
    p.className = 'line';
    p.textContent = line;
    p.style.animationDelay = `${0.09 * i}s`;
    dom.storyText.appendChild(p);
  });
  return lines.length;
}

// conditions를 평가해 이 선택지를 지금 보여줄지 결정한다.
function choiceVisible(choice) {
  const cond = choice.conditions || choice.condition;
  if (!cond) return true;
  try {
    for (const [k, v] of Object.entries(cond)) {
      if (!matchCondition(gameState[k], v)) return false;
    }
  } catch (e) {
    return false;
  }
  return true;
}

function renderChoices(choices, storyLineCount) {
  dom.choices.innerHTML = '';
  choiceMap = [];

  const visible = [];
  (choices || []).forEach((c, i) => {
    if (choiceVisible(c)) visible.push({ choice: c, index: i });
  });

  // 선택지가 없으면(엔딩이거나 모든 길이 닫힘) 마무리 처리
  if (visible.length === 0) {
    const node = scenario.nodes[gameState.current_node];
    // 엔딩이 아니지만 node.next가 있으면 자동 진행
    if (!node?.ending && node?.next) {
      setTimeout(() => enterNode(node.next), 800);
      return;
    }
    renderEnding();
    return;
  }

  const base = 0.09 * storyLineCount + 0.2; // 산문이 다 뜬 뒤 선택지가 떠오른다
  visible.forEach((v, pos) => {
    choiceMap[pos] = v.index;
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.style.animationDelay = `${base + pos * 0.07}s`;

    const key = document.createElement('span');
    key.className = 'choice-key';
    key.textContent = String(pos + 1);

    const txt = document.createElement('span');
    txt.className = 'choice-text';
    txt.textContent = v.choice.text || v.choice;

    btn.append(key, txt);
    btn.addEventListener('click', () => makeChoice(v.index));
    dom.choices.appendChild(btn);
  });
}

function renderEnding() {
  const node = scenario.nodes[gameState.current_node];
  dom.choices.innerHTML = '';
  choiceMap = [];

  // 엔딩 노드는 이미지가 화면 가득 차게
  const gameScreen = document.getElementById('screen-game');
  if (node?.ending) {
    gameScreen?.classList.add('ending-mode');
  }

  const wrap = document.createElement('div');
  wrap.className = 'ending';

  const label = document.createElement('div');
  label.className = 'ending-label';
  label.textContent = node?.ending ? '끝' : '막다른 길';

  const btn = document.createElement('button');
  btn.className = 'choice choice-restart';
  const txt = document.createElement('span');
  txt.className = 'choice-text';
  txt.textContent = '처음부터 다시';
  btn.append(txt);
  btn.addEventListener('click', restartGame);

  wrap.append(label, btn);
  dom.choices.appendChild(wrap);
}

function showStory(text, choices) {
  const lineCount = renderStoryText(text);
  renderChoices(choices, lineCount);
}

// ─── 상태 변경 로직 (분기 엔진) ──────────────────────────

// 선택지/노드의 effects를 gameState에 반영한다.
// 값이 "+1"/"-2" 같은 문자열이면 누적, 그 외(true/false/숫자/문자열)는 대입.
function applyEffects(effects) {
  if (!effects) return;
  for (const [key, value] of Object.entries(effects)) {
    if (typeof value === 'string') {
      const delta = value.match(/^\s*([+-])\s*(\d+)\s*$/);
      if (delta) {
        const current = Number(gameState[key]) || 0;
        gameState[key] = current + (delta[1] === '-' ? -1 : 1) * Number(delta[2]);
        continue;
      }
    }
    gameState[key] = value;
  }
}

// 선택지 conditions 한 항목을 평가한다.
// ">=2" 같은 비교 문자열을 지원하고, 그 외는 동등 비교.
function matchCondition(stateVal, expected) {
  if (typeof expected === 'string') {
    const cmp = expected.match(/^\s*(>=|<=|>|<|==|!=)\s*(-?\d+)\s*$/);
    if (cmp) {
      const current = Number(stateVal) || 0;
      const target = Number(cmp[2]);
      switch (cmp[1]) {
        case '>=': return current >= target;
        case '<=': return current <= target;
        case '>': return current > target;
        case '<': return current < target;
        case '==': return current === target;
        case '!=': return current !== target;
      }
    }
  }
  if (typeof expected === 'boolean') return Boolean(stateVal) === expected;
  if (typeof expected === 'number') return Number(stateVal) === expected;
  return String(stateVal) === String(expected);
}

// ─── 진행 ────────────────────────────────────────────────

// 노드로 진입한다: 노드 effects 적용 → 흔적/화면/스토리 갱신.
function enterNode(nodeKey) {
  gameState.current_node = nodeKey;
  const node = scenario.nodes[nodeKey];
  // 엔딩이 아닌 노드면 풀스크린 해제
  if (!node?.ending) {
    document.getElementById('screen-game')?.classList.remove('ending-mode');
  }
  if (node?.ending) {
    unlockEnding(nodeKey);
  }
  applyEffects(node?.effects);
  renderTrace();
  updateScene();
  showStory(node?.text, node?.choices || []);
  // 다음 노드를 위해 위에서부터 읽도록 스크롤
  const screen = document.getElementById('screen-game');
  if (screen) screen.scrollTo({ top: 0, behavior: 'smooth' });
}

function startGame() {
  const title = document.getElementById('screen-title');
  const gameScreen = document.getElementById('screen-game');
  if (title) title.classList.remove('active');
  if (gameScreen) {
    gameScreen.classList.add('active');
    gameScreen.classList.remove('ending-mode');
  }

  gameState = { ...scenario.initial_state };
  prevTrace = new Set();
  enterNode(scenario.start);
}

function makeChoice(index) {
  const node = scenario.nodes[gameState.current_node];
  const choice = (node.choices || [])[index];
  if (!choice) return;
  applyEffects(choice.effects); // 선택의 결과(검 획득 등)를 상태에 반영
  enterNode(choice.next);
}

function restartGame() {
  const title = document.getElementById('screen-title');
  const gameScreen = document.getElementById('screen-game');
  if (title) title.classList.add('active');
  if (gameScreen) {
    gameScreen.classList.remove('active');
    gameScreen.classList.remove('ending-mode');
  }
  gameState = null;
  prevTrace = new Set();
  unlockedEndings = loadUnlockedEndings();
  renderEndingCollection();
  updateUltimateEndingButton();
}

window.startGame = startGame;
window.makeChoice = makeChoice;
window.restartGame = restartGame;

// ─── 키보드 ──────────────────────────────────────────────

function onKeydown(e) {
  const titleActive = document.getElementById('screen-title')?.classList.contains('active');
  const gameActive = document.getElementById('screen-game')?.classList.contains('active');
  if (titleActive && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    startGame();
    return;
  }
  if (gameActive) {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= choiceMap.length) makeChoice(choiceMap[n - 1]);
  }
}

// ─── 초기화 ──────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch('./scenario_v3.json', { cache: 'no-store' });
    scenario = res.ok ? await res.json() : null;
  } catch (e) {
    console.warn('[init] scenario_v3.json 로드 실패, 폴백 사용', e);
    scenario = null;
  }
  if (!scenario) {
    scenario = {
      meta: { title: '아에르돈의 계약' },
      initial_state: {},
      start: 'start',
      nodes: { start: { text: '시작 장면을 불러오지 못했습니다.', images: [], choices: [] } },
    };
  }

  dom.sceneImage?.addEventListener('click', handleSceneImageClick);
  dom.collectionOpen?.addEventListener('click', openEndingCollection);
  dom.collectionClose?.addEventListener('click', closeEndingCollection);
  dom.collectionReset?.addEventListener('click', resetEndingCollection);
  dom.collectionOverlay?.addEventListener('click', (event) => {
    if (event.target === dom.collectionOverlay) closeEndingCollection();
  });
  document.addEventListener('keydown', onKeydown);

  unlockedEndings = loadUnlockedEndings();
  renderEndingCollection();
  updateUltimateEndingButton();

  // 타이틀 화면 표시, 게임은 자동 시작하지 않는다.
  document.getElementById('screen-title')?.classList.add('active');
  document.getElementById('screen-game')?.classList.remove('active');
}

init();
