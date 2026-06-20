/* 루멘드리아 — 게임 엔진 (정적 분기 내러티브)
   scenario_v3.json을 읽어 노드별 스토리/선택지/이미지를 렌더링하고,
   선택의 결과(effects)를 상태에 반영해 분기를 처리한다. */

console.log('[game.js] loaded');

const $ = (s) => document.querySelector(s);

const dom = {
  sceneImage: $('#scene-image'),
  sceneIcon: $('#scene-icon'),
  sceneImageControls: $('#scene-image-controls'),
  sceneImagePrev: $('#scene-image-prev'),
  sceneImageNext: $('#scene-image-next'),
  sceneImageCounter: $('#scene-image-counter'),
  storyText: $('#story-text'),
  choicesArea: $('#choices-area'),
  btnContinue: $('#btn-continue'),
};

let scenario = null;
let gameState = null;
let currentSceneImages = [];
let currentSceneImageIndex = 0;

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
    if (attempts >= count) return; // 전부 실패하면 기본 아이콘을 유지
    attempts++;
    const idx = ((i % count) + count) % count;
    const url = currentSceneImages[idx];
    const img = new Image();
    img.onload = () => {
      currentSceneImageIndex = idx;
      if (dom.sceneImage) {
        dom.sceneImage.style.backgroundImage = `url('${url}')`;
        dom.sceneImage.style.visibility = 'visible';
      }
      if (dom.sceneIcon) dom.sceneIcon.style.display = 'none';
      if (dom.sceneImageControls) dom.sceneImageControls.classList.remove('hidden');
      if (dom.sceneImageCounter) dom.sceneImageCounter.textContent = `${idx + 1} / ${count}`;
    };
    img.onerror = () => tryShow(idx + 1);
    img.src = url;
  }

  tryShow(index);
}

function updateScene() {
  if (!gameState || !scenario) return;
  if (dom.sceneImage) {
    dom.sceneImage.className = 'scene-image';
    dom.sceneImage.style.backgroundImage = '';
  }
  if (dom.sceneIcon) dom.sceneIcon.style.display = 'block';
  if (dom.sceneImageControls) dom.sceneImageControls.classList.add('hidden');
  currentSceneImages = [];
  currentSceneImageIndex = 0;
  const node = scenario.nodes[gameState.current_node];
  currentSceneImages = getNodeImages(node);
  if (currentSceneImages.length > 0) {
    showSceneImage(0);
    return;
  }
}

function showStory(text, choices) {
  if (dom.storyText) dom.storyText.textContent = text || '';
  if (dom.choicesArea) {
    dom.choicesArea.innerHTML = '';
    const list = (choices || []).slice();
    list.forEach((c, i) => {
      // evaluate conditions; if not met, do not render this choice (hide)
      const cond = c.conditions || c.condition || null;
      let enabled = true;
      try {
        if (cond && gameState) {
          for (const [k, v] of Object.entries(cond)) {
            if (!matchCondition(gameState[k], v)) { enabled = false; break; }
          }
        }
      } catch (e) { enabled = false; }

      if (!enabled) return; // skip rendering this choice

      const btn = document.createElement('button');
      btn.className = 'btn-choice';
      btn.textContent = c.text || c;
      btn.addEventListener('click', () => makeChoice(i));
      dom.choicesArea.appendChild(btn);
    });
  }
}

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

// 노드로 진입한다: 노드 effects 적용 → 화면/스토리 갱신.
function enterNode(nodeKey) {
  gameState.current_node = nodeKey;
  const node = scenario.nodes[nodeKey];
  applyEffects(node?.effects);
  updateScene();
  showStory(node?.text, node?.choices || []);
}

function startGame() {
  if (!scenario) return;
  // 화면 전환: 타이틀 숨기고 게임 화면 표시
  const title = document.getElementById('screen-title');
  const gameScreen = document.getElementById('screen-game');
  if (title) title.classList.remove('active');
  if (gameScreen) {
    gameScreen.classList.add('active');
    gameScreen.style.visibility = 'visible';
  }

  gameState = { ...scenario.initial_state };
  enterNode(scenario.start);
}

function makeChoice(index) {
  const node = scenario.nodes[gameState.current_node];
  const choice = (node.choices || [])[index];
  if (!choice) return;
  applyEffects(choice.effects); // 선택의 결과(검 획득 등)를 상태에 반영
  enterNode(choice.next);
}

window.startGame = startGame;
window.makeChoice = makeChoice;

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

  if (dom.sceneImagePrev) dom.sceneImagePrev.addEventListener('click', (e) => { e.stopPropagation(); showSceneImage(currentSceneImageIndex - 1); });
  if (dom.sceneImageNext) dom.sceneImageNext.addEventListener('click', (e) => { e.stopPropagation(); showSceneImage(currentSceneImageIndex + 1); });

  // 타이틀 화면을 보여주고 게임은 자동 시작하지 않는다.
  const title = document.getElementById('screen-title');
  const gameScreen = document.getElementById('screen-game');
  if (title) title.classList.add('active');
  if (gameScreen) gameScreen.classList.remove('active');

  // 씬 이미지가 선택지 클릭을 가로채지 않도록 한다.
  if (dom.sceneImage) dom.sceneImage.style.pointerEvents = 'none';
}

init();
