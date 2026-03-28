"""
루멘드리아 - 게임 로직 엔진
전투 공식, 상태 관리, 챕터/보스 설정 등 핵심 게임 로직을 서버에서 처리한다.
AI에게는 연출 텍스트만 맡기고, 수치 계산은 여기서 확정한다.
"""

from __future__ import annotations

import random

# ─── 게임 상수 ───────────────────────────────────────────────

MAX_HP = 100
MAX_MP = 50
MP_REGEN_PER_TURN = 5
TOTAL_CHAPTERS = 3

# ─── 챕터별 보스 정의 ────────────────────────────────────────

BOSSES = {
    1: {
        "name": "그림자 늑대 아르칸",
        "hp": 60,
        "attack": 8,
        "special_skill": "그림자 돌진",
        "special_damage": 15,
        "special_chance": 0.25,
        "description": "어둠의 기운을 두른 거대한 늑대. 붉은 눈이 번뜩인다.",
    },
    2: {
        "name": "숲의 정령 에르다",
        "hp": 80,
        "attack": 10,
        "special_skill": "덩굴 속박",
        "special_damage": 12,
        "special_chance": 0.3,
        "description": "고대 숲을 지키는 정령. 분노로 가득 차 있다.",
    },
    3: {
        "name": "흑염의 마녀 모르가나",
        "hp": 100,
        "attack": 12,
        "special_skill": "흑염의 폭풍",
        "special_damage": 18,
        "special_chance": 0.35,
        "description": "루멘드리아를 어둠에 빠뜨린 원흉. 검은 불꽃이 그녀를 감싼다.",
    },
}

# ─── 챕터별 장소 ─────────────────────────────────────────────

CHAPTER_LOCATIONS = {
    1: "안개 낀 시작 마을",
    2: "속삭이는 숲",
    3: "흑염의 성",
}

# ─── 아이템 정의 ─────────────────────────────────────────────

ITEMS = {
    "빛나는 포션": {"type": "heal_hp", "value": 30, "description": "체력을 30 회복한다."},
    "마나 크리스탈": {"type": "heal_mp", "value": 20, "description": "마나를 20 회복한다."},
    "수호의 부적": {"type": "shield", "value": 15, "description": "다음 공격의 피해를 15 줄인다."},
    "용기의 반지": {"type": "attack_boost", "value": 10, "description": "다음 공격의 피해를 10 올린다."},
}

# 챕터별 획득 가능 아이템 (스토리 진행 중 AI가 선택지에 따라 부여)
CHAPTER_REWARDS = {
    1: ["빛나는 포션", "수호의 부적"],
    2: ["마나 크리스탈", "용기의 반지"],
    3: ["빛나는 포션", "마나 크리스탈"],
}

# ─── 성향 시스템 ─────────────────────────────────────────────

def get_route(tendency: int) -> str:
    if tendency >= 3:
        return "빛의 길"
    elif tendency <= -3:
        return "어둠의 길"
    return "균형의 길"


# ─── 초기 상태 생성 ──────────────────────────────────────────

def create_initial_state() -> dict:
    return {
        "player": {
            "hp": MAX_HP,
            "mp": MAX_MP,
            "items": ["빛나는 포션"],
            "tendency": 0,
            "route": "균형의 길",
            "attack_boost": 0,
            "shield": 0,
        },
        "chapter": 1,
        "location": CHAPTER_LOCATIONS[1],
        "turn_count": 0,
        "in_boss_battle": False,
        "boss": {
            "name": "",
            "hp": 0,
            "attack": 0,
            "special_skill": "",
        },
        "last_story": "",
        "stunned": False,
        "game_clear": False,
    }


# ─── 전투 로직 ───────────────────────────────────────────────

def calc_player_attack(mp: int, attack_boost: int = 0) -> tuple[int, str]:
    """기본 공격: 15~20 랜덤 데미지"""
    base = random.randint(15, 20)
    total = base + attack_boost
    return total, "공격"


def calc_player_magic(mp: int, attack_boost: int = 0) -> tuple[int, int, str]:
    """마법 공격: MP 15 소모, 25~35 데미지. MP 부족 시 실패."""
    cost = 15
    if mp < cost:
        return 0, 0, "마나 부족"
    base = random.randint(25, 35)
    total = base + attack_boost
    return total, cost, "마법"


def calc_player_defend() -> int:
    """방어: 받는 데미지 60% 감소 (감소량 반환)"""
    return 60  # 퍼센트


def calc_boss_action(boss_config: dict) -> tuple[int, str, bool]:
    """보스 행동 결정: 일반 공격 또는 특수 스킬"""
    if random.random() < boss_config["special_chance"]:
        stun = boss_config["special_skill"] == "덩굴 속박"
        return boss_config["special_damage"], boss_config["special_skill"], stun
    return boss_config["attack"], "일반 공격", False


def process_boss_turn(state: dict, action: str, item_name: str | None = None) -> dict:
    """
    보스전 1턴 처리. 모든 수치 계산을 여기서 확정한다.
    반환: 업데이트된 state + 턴 결과 정보
    """
    player = state["player"]
    boss = state["boss"]
    chapter = state["chapter"]
    boss_config = BOSSES[chapter]

    result = {
        "player_damage_dealt": 0,
        "player_action": "",
        "boss_damage_dealt": 0,
        "boss_action": "",
        "stunned": False,
        "boss_dead": False,
        "game_over": False,
        "item_used": None,
        "player_healed": 0,
        "mp_regenerated": 0,
        "turn_number": state["turn_count"] + 1,
    }

    # 스턴 상태면 행동 불가, 스턴 해제
    if state["stunned"]:
        result["player_action"] = "기절에서 회복 중"
        result["player_damage_dealt"] = 0
        state["stunned"] = False
    elif action == "아이템" and item_name:
        # 아이템 사용
        used = use_item(player, item_name)
        if used:
            result["item_used"] = item_name
            result["player_action"] = f"{item_name} 사용"
            item_info = ITEMS.get(item_name, {})
            if item_info.get("type") == "heal_hp":
                result["player_healed"] = item_info["value"]
            elif item_info.get("type") == "heal_mp":
                result["player_healed"] = item_info["value"]
        else:
            result["player_action"] = "아이템 사용 실패"
    elif action == "공격":
        damage, action_name = calc_player_attack(player["mp"], player.get("attack_boost", 0))
        boss["hp"] = max(0, boss["hp"] - damage)
        result["player_damage_dealt"] = damage
        result["player_action"] = action_name
        player["attack_boost"] = 0
    elif action == "마법":
        damage, cost, action_name = calc_player_magic(player["mp"], player.get("attack_boost", 0))
        if damage > 0:
            boss["hp"] = max(0, boss["hp"] - damage)
            player["mp"] = max(0, player["mp"] - cost)
        result["player_damage_dealt"] = damage
        result["player_action"] = action_name
        player["attack_boost"] = 0
    elif action == "방어":
        result["player_action"] = "방어"
    else:
        result["player_action"] = action

    # 보스 사망 체크
    if boss["hp"] <= 0:
        result["boss_dead"] = True
        state["in_boss_battle"] = False
        # 다음 챕터 준비
        if chapter < TOTAL_CHAPTERS:
            state["chapter"] = chapter + 1
            state["location"] = CHAPTER_LOCATIONS[chapter + 1]
            # 챕터 간 전체 회복
            player["hp"] = MAX_HP
            player["mp"] = MAX_MP
            player["shield"] = 0
            player["attack_boost"] = 0
        else:
            state["game_clear"] = True
        state["turn_count"] = result["turn_number"]
        return {**state, "_turn_result": result}

    # 보스 행동
    boss_damage, boss_action_name, stun = calc_boss_action(boss_config)

    # 방어 시 데미지 감소
    if action == "방어":
        reduction = calc_player_defend()
        boss_damage = max(1, boss_damage * (100 - reduction) // 100)

    # 보호 부적 효과
    if player.get("shield", 0) > 0:
        boss_damage = max(0, boss_damage - player["shield"])
        player["shield"] = 0

    player["hp"] = max(0, player["hp"] - boss_damage)
    result["boss_damage_dealt"] = boss_damage
    result["boss_action"] = boss_action_name
    result["stunned"] = stun
    state["stunned"] = stun

    # MP 자연 회복
    mp_before = player["mp"]
    player["mp"] = min(MAX_MP, player["mp"] + MP_REGEN_PER_TURN)
    result["mp_regenerated"] = player["mp"] - mp_before

    # 게임 오버 체크
    if player["hp"] <= 0:
        result["game_over"] = True

    state["turn_count"] = result["turn_number"]
    return {**state, "_turn_result": result}


def use_item(player: dict, item_name: str) -> bool:
    """아이템 사용. 성공 시 True 반환."""
    if item_name not in player["items"]:
        return False

    item = ITEMS.get(item_name)
    if not item:
        return False

    player["items"].remove(item_name)

    if item["type"] == "heal_hp":
        player["hp"] = min(MAX_HP, player["hp"] + item["value"])
    elif item["type"] == "heal_mp":
        player["mp"] = min(MAX_MP, player["mp"] + item["value"])
    elif item["type"] == "shield":
        player["shield"] = item["value"]
    elif item["type"] == "attack_boost":
        player["attack_boost"] = item["value"]

    return True


def start_boss_battle(state: dict) -> dict:
    """보스전 시작. 보스 정보를 state에 세팅."""
    chapter = state["chapter"]
    boss_config = BOSSES[chapter]

    state["in_boss_battle"] = True
    state["stunned"] = False
    state["turn_count"] = 0
    state["boss"] = {
        "name": boss_config["name"],
        "hp": boss_config["hp"],
        "max_hp": boss_config["hp"],
        "attack": boss_config["attack"],
        "special_skill": boss_config["special_skill"],
        "description": boss_config["description"],
    }
    state["player"]["shield"] = 0
    state["player"]["attack_boost"] = 0

    return state


def restart_boss_battle(state: dict) -> dict:
    """게임오버 후 보스전 재시작."""
    state["player"]["hp"] = MAX_HP
    state["player"]["mp"] = MAX_MP
    return start_boss_battle(state)


def add_item_to_player(state: dict, item_name: str) -> dict:
    """스토리 진행 중 아이템 획득."""
    if item_name in ITEMS and len(state["player"]["items"]) < 5:
        state["player"]["items"].append(item_name)
    return state


def apply_tendency(state: dict, delta: int) -> dict:
    """성향 수치 변경 및 루트 업데이트."""
    state["player"]["tendency"] += delta
    state["player"]["tendency"] = max(-5, min(5, state["player"]["tendency"]))
    state["player"]["route"] = get_route(state["player"]["tendency"])
    return state
