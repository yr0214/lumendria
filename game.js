/* Minimal game.js - focused on init, image loading, and scene display
   Restores page initialization and image display for start node.
*/

console.log('[game.js] loaded');

const DEFAULT_IMAGE_BASE_PATH = 'file:///C:/Users/User/Downloads/lunmandria/';
const SAVE_KEY = 'lumendria_save';

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

function resolveImagePath(entry) {
  if (!entry) return null;
  const raw = String(entry).trim();
  // 이미 data URI 이면 그대로 반환
  if (/^data:/i.test(raw)) return raw;
  // EMBEDDED_IMAGES 맵에 키가 있으면 그 값을 사용
  try {
    if (window?.EMBEDDED_IMAGES) {
      // 직접 키 지정("start-1") 또는 접두사 embedded: 키를 허용
      const key = raw.startsWith('embedded:') ? raw.slice('embedded:'.length) : raw;
      if (window.EMBEDDED_IMAGES[key]) return window.EMBEDDED_IMAGES[key];
    }
  } catch (e) {
    console.warn('[resolveImagePath] EMBEDDED_IMAGES 검사 중 오류', e);
  }
  if (/^(file|https?):\/\//i.test(raw)) return raw;
  // If the entry already points into the images/ folder, keep it as-is
  if (/^images\//.test(raw)) return raw;
  // non-numeric entries: if it's a path (contains '/'), treat as relative path; otherwise prefix with images/
  const encoded = raw.split('/').map(encodeURIComponent).join('/');
  if (raw.indexOf('/') >= 0) return `${encoded}`;
  return `images/${encoded}`;
}

function getNodeImages(node, nodeKey) {
  if (!node && !scenario) return [];
  let raw = node?.images ?? node?.image ?? scenario?.images ?? [];
  if (!raw) raw = [];
  const entries = Array.isArray(raw) ? raw.slice() : [raw];
  const images = entries.map((e) => {
    if (e == null) return null;
    // numeric shorthand -> images/<nodeKey>-<n>.png
    if (/^\d+$/.test(String(e))) {
      const key = nodeKey || (scenario?.start) || 'scene';
      return `images/${encodeURIComponent(key)}-${String(e)}.png`;
    }
    return resolveImagePath(e);
  }).filter(Boolean);
  // fallback to scenario.imageCount producing nodeKey-<n>.png
  if (images.length === 0 && scenario?.imageCount && nodeKey) {
    for (let i = 1; i <= scenario.imageCount; i++) images.push(`images/${encodeURIComponent(nodeKey)}-${i}.png`);
  }
  return images;
}

function showSceneImage(index) {
  if (!currentSceneImages || currentSceneImages.length === 0) return;
  const count = currentSceneImages.length;
  const startIdx = ((index % count) + count) % count;
  // Try each image in the list (wrapping) until one loads successfully.
  let attempts = 0;
  function tryFrom(offset) {
    if (attempts >= count) return; // none worked
    const idx = (startIdx + offset) % count;
    const initialUrl = currentSceneImages[idx];
    attempts++;
    // Try initialUrl with svg/png fallback
    const candidates = [initialUrl];
    try {
      const u = new URL(initialUrl, location.href).toString();
      if (/\.svg$/i.test(u)) candidates.push(u.replace(/\.svg$/i, '.png'));
      if (/\.png$/i.test(u)) candidates.push(u.replace(/\.png$/i, '.svg'));
    } catch (e) { /* ignore */ }

    let ci = 0;
    function tryCandidate() {
      if (ci >= candidates.length) return tryFrom(offset + 1);
      const img = new Image();
      img.onload = function() {
        currentSceneImageIndex = idx;
        if (dom.sceneImage) {
          dom.sceneImage.style.backgroundImage = `url('${candidates[ci]}')`;
          dom.sceneImage.style.visibility = 'visible';
        }
        if (dom.sceneIcon) dom.sceneIcon.style.display = 'none';
        if (dom.sceneImageControls) dom.sceneImageControls.classList.remove('hidden');
        if (dom.sceneImageCounter) dom.sceneImageCounter.textContent = `${currentSceneImageIndex+1} / ${count}`;
      };
      img.onerror = function() { ci++; tryCandidate(); };
      img.src = candidates[ci];
    }
    tryCandidate();
  }
  tryFrom(0);
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
  currentSceneImages = getNodeImages(node, gameState.current_node);
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
  if (location.protocol === 'file:') {
    // try to use scenario_v3.json via fetch may fail; fallback to INLINE
    try {
      const res = await fetch('./scenario_v3.json', {cache: 'no-store'});
      if (res.ok) {
        scenario = await res.json();
      } else {
        throw new Error('fetch failed');
      }
    } catch (e) {
      console.warn('[init] fetch failed, using embedded minimal scenario', e);
      scenario = {
        meta: { title: '아에르돈의 계약' },
        imageFolder: DEFAULT_IMAGE_BASE_PATH,
        imageCount: 3,
        initial_state: {},
        start: 'start',
        nodes: { start: { text: '시작 장면', images: [1], choices: [] } }
      };
    }
  } else {
    try {
      const res = await fetch('./scenario_v3.json', {cache: 'no-store'});
      scenario = res.ok ? await res.json() : null;
    } catch (e) {
      console.warn('[init] fetch error, using inline fallback', e);
      scenario = null;
    }
    if (!scenario) scenario = {
      meta: { title: '아에르돈의 계약' },
      imageFolder: DEFAULT_IMAGE_BASE_PATH,
      imageCount: 3,
      initial_state: {},
      start: 'start',
      nodes: { start: { text: '시작 장면', images: [1], choices: [] } }
    };
  }

  if (!scenario.imageFolder) scenario.imageFolder = DEFAULT_IMAGE_BASE_PATH;

  if (dom.sceneImagePrev) dom.sceneImagePrev.addEventListener('click', (e)=>{ e.stopPropagation(); showSceneImage(currentSceneImageIndex-1); });
  if (dom.sceneImageNext) dom.sceneImageNext.addEventListener('click', (e)=>{ e.stopPropagation(); showSceneImage(currentSceneImageIndex+1); });

  console.log('[init] scenario loaded', scenario && scenario.meta && scenario.meta.title);
  // Ensure title screen is shown and do NOT auto-start the game.
  const title = document.getElementById('screen-title');
  const gameScreen = document.getElementById('screen-game');
  if (title) title.classList.add('active');
  if (gameScreen) gameScreen.classList.remove('active');

  // Remove any leftover debug overlay element if present
  try {
    const dbg = document.getElementById('debug-scene-overlay');
    if (dbg && dbg.parentNode) dbg.parentNode.removeChild(dbg);
  } catch (e) { /* ignore */ }

  // Ensure scene image does not capture pointer events (buttons must remain clickable)
  try { if (dom.sceneImage) dom.sceneImage.style.pointerEvents = 'none'; } catch (e) {}
}

init();
