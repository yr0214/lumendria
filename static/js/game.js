/* ═══════════════════════════════════════════════════════
   루멘드리아 — 프론트엔드 게임 엔진
   상태 관리, API 통신, 타이핑 효과, 파티클, localStorage
   ═══════════════════════════════════════════════════════ */

// ─── 상태 ──────────────────────────────────────────────────

let gameState = null;
let currentChoices = [];
let tendencyDeltas = [];
let lastItemReward = null;
let isTyping = false;
let isBossBattle = false;
let actionLocked = false;

const SAVE_KEY = "lumendria_save";

// ─── DOM 캐시 ──────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    screenTitle: $("#screen-title"),
    screenGame: $("#screen-game"),
    btnContinue: $("#btn-continue"),
    barHp: $("#bar-hp"),
    barMp: $("#bar-mp"),
    textHp: $("#text-hp"),
    textMp: $("#text-mp"),
    chapterBadge: $("#chapter-badge"),
    routeBadge: $("#route-badge"),
    itemCount: $("#item-count"),
    bossStatus: $("#boss-status"),
    bossName: $("#boss-name"),
    barBoss: $("#bar-boss"),
    textBossHp: $("#text-boss-hp"),
    sceneImage: $("#scene-image"),
    sceneIcon: $("#scene-icon"),
    storyText: $("#story-text"),
    typingIndicator: $("#typing-indicator"),
    choicesArea: $("#choices-area"),
    bossActions: $("#boss-actions"),
    damageDisplay: $("#damage-display"),
    damagePlayer: $("#damage-player"),
    damageBoss: $("#damage-boss"),
    itemPanel: $("#item-panel"),
    itemList: $("#item-list"),
    bossItemSelect: $("#boss-item-select"),
    bossItemList: $("#boss-item-list"),
    overlayGameover: $("#overlay-gameover"),
    gameoverText: $("#gameover-text"),
    overlayBossClear: $("#overlay-boss-clear"),
    bossClearTitle: $("#boss-clear-title"),
    bossClearText: $("#boss-clear-text"),
    btnNextChapter: $("#btn-next-chapter"),
    overlayEnding: $("#overlay-ending"),
    endingBadge: $("#ending-badge"),
    endingText: $("#ending-text"),
    endingRoute: $("#ending-route"),
    overlayLoading: $("#overlay-loading"),
};

// ─── 파티클 시스템 ─────────────────────────────────────────

const canvas = $("#particles");
const ctx = canvas.getContext("2d");
let particles = [];

function initParticles() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    particles = [];
    const count = Math.floor((canvas.width * canvas.height) / 15000);
    for (let i = 0; i < count; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2 + 0.5,
            speedY: -(Math.random() * 0.3 + 0.1),
            speedX: (Math.random() - 0.5) * 0.2,
            opacity: Math.random() * 0.5 + 0.1,
            pulse: Math.random() * Math.PI * 2,
        });
    }
}

function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
        p.y += p.speedY;
        p.x += p.speedX;
        p.pulse += 0.02;
        const opacity = p.opacity * (0.7 + 0.3 * Math.sin(p.pulse));

        if (p.y < -10) {
            p.y = canvas.height + 10;
            p.x = Math.random() * canvas.width;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(167, 139, 250, ${opacity})`;
        ctx.fill();
    }
    requestAnimationFrame(animateParticles);
}

window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

initParticles();
animateParticles();

// ─── 초기화 ────────────────────────────────────────────────

(function init() {
    const saved = loadGame();
    if (saved) {
        dom.btnContinue.style.display = "inline-flex";
    }
})();

// ─── 화면 전환 ─────────────────────────────────────────────

function switchScreen(from, to) {
    from.classList.remove("active");
    setTimeout(() => to.classList.add("active"), 100);
}

// ─── API 호출 ──────────────────────────────────────────────

async function api(endpoint, body = {}) {
    showLoading(true);
    try {
        const res = await fetch(`/api${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error(`[API Error] ${endpoint}:`, err);
        return null;
    } finally {
        showLoading(false);
    }
}

function showLoading(show) {
    dom.overlayLoading.style.display = show ? "flex" : "none";
}

// ─── 게임 시작 ─────────────────────────────────────────────

async function startGame() {
    clearSave();
    const data = await api("/start");
    if (!data) return;

    gameState = data.state;
    isBossBattle = false;

    switchScreen(dom.screenTitle, dom.screenGame);
    updateUI();
    updateScene();
    showStory(data.story, data.choices, data.tendency_deltas);
    saveGame();
}

async function continueGame() {
    const saved = loadGame();
    if (!saved) return;

    gameState = saved.state;
    isBossBattle = saved.isBossBattle || false;

    switchScreen(dom.screenTitle, dom.screenGame);
    updateUI();
    updateScene();

    if (isBossBattle) {
        showBossUI(true);
        showStoryText(saved.lastStory || "전투가 계속된다!");
        showBossActions(true);
    } else {
        showStory(
            saved.lastStory || gameState.last_story,
            saved.choices || [],
            saved.tendencyDeltas || []
        );
    }
}

// ─── 스토리 선택 ───────────────────────────────────────────

async function makeChoice(index) {
    if (isTyping || actionLocked) return;
    actionLocked = true;

    const choice = currentChoices[index];
    const delta = tendencyDeltas[index] || 0;

    // 보스전 트리거 체크: 턴 수 >= 6 이상이면서 특정 키워드
    const triggerBoss =
        gameState.turn_count >= 6 &&
        /맞서|싸우|도전|대결|들어간다/.test(choice);

    const data = await api("/choice", {
        choice,
        state: gameState,
        tendency_delta: delta,
        item_reward: lastItemReward,
        trigger_boss: triggerBoss,
    });

    actionLocked = false;
    if (!data) return;

    gameState = data.state;
    lastItemReward = data.item_reward || null;

    if (data.phase === "boss_battle") {
        isBossBattle = true;
        showBossUI(true);
        await typeText(data.story);
        showBossActions(true);
    } else {
        updateUI();
        updateScene();
        showStory(data.story, data.choices, data.tendency_deltas);
    }

    saveGame();
}

// ─── 보스전 ────────────────────────────────────────────────

async function bossAction(action) {
    if (isTyping || actionLocked) return;
    actionLocked = true;
    showBossActions(false);
    hideDamageDisplay();

    const data = await api("/boss/turn", {
        action,
        state: gameState,
    });

    actionLocked = false;
    if (!data) {
        showBossActions(true);
        return;
    }

    gameState = data.state;

    // HP/MP 바 업데이트 with 애니메이션
    updatePlayerBars(data.player_hp, data.player_mp);
    updateBossBar(data.boss_hp, data.boss_max_hp);
    updateUI();

    // 데미지 표시
    showDamageDisplay(data);

    // 스크린 셰이크
    if (data.boss_damage > 0) {
        dom.screenGame.classList.add("shake");
        setTimeout(() => dom.screenGame.classList.remove("shake"), 400);
    }

    await typeText(data.narration);

    if (data.game_over) {
        setTimeout(() => showGameOver(data.narration), 800);
        saveGame();
        return;
    }

    if (data.boss_dead) {
        if (data.game_clear) {
            setTimeout(() => showEnding(data.ending, gameState), 800);
        } else {
            setTimeout(
                () =>
                    showBossClear(
                        gameState.boss.name,
                        data.narration,
                        gameState.chapter
                    ),
                800
            );
        }
        isBossBattle = false;
        showBossUI(false);
        saveGame();
        return;
    }

    showBossActions(true);
    saveGame();
}

function openBossItemSelect() {
    const items = gameState.player.items || [];
    if (items.length === 0) {
        closeBossItemSelect();
        return;
    }

    let html = "";
    const seen = {};
    for (const name of items) {
        if (seen[name]) continue;
        seen[name] = true;
        const count = items.filter((i) => i === name).length;
        html += `
            <button class="boss-item-entry" onclick="useBossItem('${name}')">
                <span class="item-icon">${getItemIcon(name)}</span>
                <span class="item-name">${name}${count > 1 ? ` x${count}` : ""}</span>
            </button>
        `;
    }

    dom.bossItemList.innerHTML = html;
    dom.bossItemSelect.style.display = "block";
}

function closeBossItemSelect() {
    dom.bossItemSelect.style.display = "none";
}

async function useBossItem(itemName) {
    closeBossItemSelect();
    if (isTyping || actionLocked) return;
    actionLocked = true;
    showBossActions(false);
    hideDamageDisplay();

    const data = await api("/boss/turn", {
        action: "아이템",
        item_name: itemName,
        state: gameState,
    });

    actionLocked = false;
    if (!data) {
        showBossActions(true);
        return;
    }

    gameState = data.state;
    updatePlayerBars(data.player_hp, data.player_mp);
    updateBossBar(data.boss_hp, data.boss_max_hp);
    updateUI();
    showDamageDisplay(data);

    if (data.boss_damage > 0) {
        dom.screenGame.classList.add("shake");
        setTimeout(() => dom.screenGame.classList.remove("shake"), 400);
    }

    await typeText(data.narration);

    if (data.game_over) {
        setTimeout(() => showGameOver(data.narration), 800);
        saveGame();
        return;
    }

    if (data.boss_dead) {
        if (data.game_clear) {
            setTimeout(() => showEnding(data.ending, gameState), 800);
        } else {
            setTimeout(
                () =>
                    showBossClear(
                        gameState.boss.name,
                        data.narration,
                        gameState.chapter
                    ),
                800
            );
        }
        isBossBattle = false;
        showBossUI(false);
        saveGame();
        return;
    }

    showBossActions(true);
    saveGame();
}

async function retryBoss() {
    dom.overlayGameover.style.display = "none";
    showLoading(true);

    const data = await api("/boss/retry", { state: gameState });
    if (!data) return;

    gameState = data.state;
    isBossBattle = true;
    showBossUI(true);
    updateUI();
    updateBossBar(data.boss.hp, data.boss.max_hp || data.boss.hp);
    await typeText(data.story);
    showBossActions(true);
    saveGame();
}

// ─── 챕터 전환 ─────────────────────────────────────────────

async function nextChapter() {
    dom.overlayBossClear.style.display = "none";
    showBossUI(false);

    const data = await api("/choice", {
        choice: "다음 챕터로 출발한다",
        state: gameState,
        tendency_delta: 0,
    });

    if (!data) return;

    gameState = data.state;
    isBossBattle = false;
    updateUI();
    updateScene();
    showStory(data.story, data.choices, data.tendency_deltas);
    saveGame();
}

// ─── UI 업데이트 ───────────────────────────────────────────

function updateUI() {
    if (!gameState) return;
    const p = gameState.player;

    updatePlayerBars(p.hp, p.mp);
    dom.chapterBadge.textContent = `Ch.${gameState.chapter}`;
    dom.routeBadge.textContent = p.route;
    dom.itemCount.textContent = p.items.length;

    // 루트 뱃지 색상
    if (p.route === "빛의 길") {
        dom.routeBadge.style.color = "#fbbf24";
        dom.routeBadge.style.borderColor = "rgba(251, 191, 36, 0.3)";
        dom.routeBadge.style.background = "rgba(251, 191, 36, 0.1)";
    } else if (p.route === "어둠의 길") {
        dom.routeBadge.style.color = "#a78bfa";
        dom.routeBadge.style.borderColor = "rgba(167, 139, 250, 0.3)";
        dom.routeBadge.style.background = "rgba(167, 139, 250, 0.1)";
    } else {
        dom.routeBadge.style.color = "";
        dom.routeBadge.style.borderColor = "";
        dom.routeBadge.style.background = "";
    }
}

function updatePlayerBars(hp, mp) {
    const hpPct = Math.max(0, (hp / 100) * 100);
    const mpPct = Math.max(0, (mp / 50) * 100);

    dom.barHp.style.width = `${hpPct}%`;
    dom.textHp.textContent = `${hp} / 100`;
    dom.barMp.style.width = `${mpPct}%`;
    dom.textMp.textContent = `${mp} / 50`;
}

function updateBossBar(hp, maxHp) {
    const pct = Math.max(0, (hp / maxHp) * 100);
    dom.barBoss.style.width = `${pct}%`;
    dom.textBossHp.textContent = `${hp} / ${maxHp}`;
}

function showBossUI(show) {
    dom.bossStatus.style.display = show ? "block" : "none";
    dom.choicesArea.style.display = show ? "none" : "flex";
    dom.bossActions.style.display = show ? "grid" : "none";

    if (show && gameState?.boss) {
        dom.bossName.textContent = gameState.boss.name;
        updateBossBar(
            gameState.boss.hp,
            gameState.boss.max_hp || gameState.boss.hp
        );
        dom.sceneImage.classList.add("boss-scene");
        dom.sceneIcon.innerHTML = "&#128126;"; // 보스 아이콘
    } else {
        dom.sceneImage.classList.remove("boss-scene");
    }
}

function showBossActions(show) {
    const btns = dom.bossActions.querySelectorAll(".btn-action");
    btns.forEach((btn) => (btn.disabled = !show));
}

function showDamageDisplay(data) {
    dom.damageDisplay.style.display = "flex";

    if (data.boss_damage > 0) {
        dom.damagePlayer.textContent = `-${data.boss_damage} HP (${data.boss_action})`;
        dom.damagePlayer.style.display = "block";
    } else {
        dom.damagePlayer.style.display = "none";
    }

    if (data.player_damage > 0) {
        dom.damageBoss.textContent = `${data.player_damage} DMG! (${data.player_action})`;
        dom.damageBoss.style.display = "block";
    } else if (data.item_used) {
        dom.damageBoss.textContent = `${data.item_used} 사용!`;
        dom.damageBoss.style.display = "block";
    } else {
        dom.damageBoss.style.display = "none";
    }
}

function hideDamageDisplay() {
    dom.damageDisplay.style.display = "none";
}

function updateScene() {
    if (!gameState) return;
    const ch = gameState.chapter;

    dom.sceneImage.className = "scene-image";
    dom.sceneImage.classList.add(`chapter-${ch}`);

    const icons = { 1: "&#127747;", 2: "&#127795;", 3: "&#127982;" };
    dom.sceneIcon.innerHTML = icons[ch] || "&#9876;";
}

// ─── 스토리 표시 ───────────────────────────────────────────

function showStory(story, choices, deltas) {
    dom.choicesArea.style.display = "flex";
    dom.bossActions.style.display = "none";
    dom.choicesArea.innerHTML = "";
    hideDamageDisplay();

    typeText(story).then(() => {
        showChoices(choices, deltas);
    });
}

function showStoryText(text) {
    dom.storyText.textContent = text;
}

function showChoices(choices, deltas) {
    currentChoices = choices || [];
    tendencyDeltas = deltas || [];

    dom.choicesArea.innerHTML = "";
    currentChoices.forEach((text, i) => {
        const btn = document.createElement("button");
        btn.className = "btn-choice";
        btn.textContent = text;
        btn.onclick = () => makeChoice(i);
        dom.choicesArea.appendChild(btn);
    });
}

// ─── 타이핑 효과 ───────────────────────────────────────────

function typeText(text) {
    return new Promise((resolve) => {
        isTyping = true;
        dom.storyText.textContent = "";
        dom.typingIndicator.style.display = "flex";

        // 짧은 딜레이 후 타이핑 시작 (AI가 생각하는 느낌)
        setTimeout(() => {
            dom.typingIndicator.style.display = "none";
            let i = 0;
            const speed = 30; // ms per char

            function type() {
                if (i < text.length) {
                    dom.storyText.textContent += text.charAt(i);
                    i++;
                    setTimeout(type, speed);
                } else {
                    isTyping = false;
                    resolve();
                }
            }

            type();
        }, 500);
    });
}

// 스토리 박스 클릭 시 타이핑 스킵
document.querySelector(".story-box")?.addEventListener("click", () => {
    if (isTyping) {
        // 즉시 완성은 복잡하므로 속도를 극도로 빠르게 변경
        // 현재 구현에서는 간단히 무시
    }
});

// ─── 아이템 패널 ───────────────────────────────────────────

function toggleItemPanel() {
    const panel = dom.itemPanel;
    if (panel.style.display === "none") {
        renderItemPanel();
        panel.style.display = "block";
    } else {
        panel.style.display = "none";
    }
}

function renderItemPanel() {
    const items = gameState?.player?.items || [];
    if (items.length === 0) {
        dom.itemList.innerHTML =
            '<div class="item-empty">아이템이 없습니다</div>';
        return;
    }

    const counted = {};
    items.forEach((name) => {
        counted[name] = (counted[name] || 0) + 1;
    });

    let html = "";
    for (const [name, count] of Object.entries(counted)) {
        html += `
            <div class="item-entry">
                <span class="item-icon">${getItemIcon(name)}</span>
                <div class="item-info">
                    <div class="item-name">${name}${count > 1 ? ` x${count}` : ""}</div>
                    <div class="item-desc">${getItemDesc(name)}</div>
                </div>
            </div>
        `;
    }
    dom.itemList.innerHTML = html;
}

function getItemIcon(name) {
    const icons = {
        "빛나는 포션": "\u{1F48E}",
        "마나 크리스탈": "\u{1F48E}",
        "수호의 부적": "\u{1F6E1}",
        "용기의 반지": "\u{1F48D}",
    };
    return icons[name] || "\u{1F381}";
}

function getItemDesc(name) {
    const descs = {
        "빛나는 포션": "체력을 30 회복한다",
        "마나 크리스탈": "마나를 20 회복한다",
        "수호의 부적": "다음 공격의 피해를 15 줄인다",
        "용기의 반지": "다음 공격의 피해를 10 올린다",
    };
    return descs[name] || "";
}

// ─── 오버레이 ──────────────────────────────────────────────

function showGameOver(text) {
    dom.gameoverText.textContent =
        text || "하지만 포기하지 않아! 다시 일어설 시간이야!";
    dom.overlayGameover.style.display = "flex";
}

function showBossClear(bossName, text, nextChapter) {
    dom.bossClearTitle.textContent = `${bossName} 격파!`;
    dom.bossClearText.textContent = text || "훌륭해! 다음 모험이 기다리고 있어!";
    dom.btnNextChapter.textContent = `챕터 ${nextChapter}로 출발`;
    dom.overlayBossClear.style.display = "flex";
}

function showEnding(endingText, state) {
    const route = state.player.route;
    const badges = {
        "빛의 길": "\u{2728}",
        "균형의 길": "\u{2696}",
        "어둠의 길": "\u{1F319}",
    };
    dom.endingBadge.textContent = badges[route] || "\u{2B50}";
    dom.endingText.textContent =
        endingText || "리아나의 모험이 끝났다. 루멘드리아에 평화가 찾아왔다.";
    dom.endingRoute.textContent = route;
    dom.overlayEnding.style.display = "flex";
    clearSave();
}

function backToTitle() {
    dom.overlayEnding.style.display = "none";
    isBossBattle = false;
    gameState = null;
    switchScreen(dom.screenGame, dom.screenTitle);

    const saved = loadGame();
    dom.btnContinue.style.display = saved ? "inline-flex" : "none";
}

// ─── 저장/불러오기 ─────────────────────────────────────────

function saveGame() {
    if (!gameState) return;
    const data = {
        state: gameState,
        isBossBattle,
        lastStory: dom.storyText.textContent,
        choices: currentChoices,
        tendencyDeltas,
        savedAt: Date.now(),
    };
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn("[Save] localStorage 저장 실패:", e);
    }
}

function loadGame() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function clearSave() {
    localStorage.removeItem(SAVE_KEY);
    dom.btnContinue.style.display = "none";
}

// ─── 글로벌 함수 등록 (onclick에서 호출) ───────────────────

window.startGame = startGame;
window.continueGame = continueGame;
window.makeChoice = makeChoice;
window.bossAction = bossAction;
window.retryBoss = retryBoss;
window.nextChapter = nextChapter;
window.backToTitle = backToTitle;
window.toggleItemPanel = toggleItemPanel;
window.openBossItemSelect = openBossItemSelect;
window.closeBossItemSelect = closeBossItemSelect;
window.useBossItem = useBossItem;
