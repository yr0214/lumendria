"""
루멘드리아 - Flask 서버
API 엔드포인트 + 정적 파일 서빙
"""

import os
import sys

from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv

# backend/ 디렉토리에서 실행하든 루트에서 실행하든 동작하도록
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)

load_dotenv(os.path.join(PROJECT_DIR, ".env"))

sys.path.insert(0, BASE_DIR)

from game_logic import (
    create_initial_state,
    process_boss_turn,
    start_boss_battle,
    restart_boss_battle,
    apply_tendency,
    add_item_to_player,
    BOSSES,
    ITEMS,
)
from ai_service import (
    generate_story,
    generate_boss_intro,
    generate_boss_turn_narration,
    generate_ending,
)

app = Flask(
    __name__,
    static_folder=os.path.join(PROJECT_DIR, "static"),
    template_folder=os.path.join(PROJECT_DIR, "templates"),
)


# ─── 프론트엔드 서빙 ─────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(app.template_folder, "index.html")


@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(app.static_folder, filename)


# ─── API 엔드포인트 ──────────────────────────────────────────

@app.post("/api/start")
def api_start():
    """게임 초기화 및 첫 스토리 반환."""
    state = create_initial_state()
    story_data = generate_story(state)

    state["last_story"] = story_data["story"]
    state["turn_count"] = 1

    return jsonify({
        "story": story_data["story"],
        "choices": story_data["choices"],
        "tendency_deltas": story_data.get("tendency_deltas", [0, 0, 0]),
        "state": state,
    })


@app.post("/api/choice")
def api_choice():
    """플레이어 선택 → 다음 스토리."""
    data = request.get_json()
    choice = data.get("choice", "")
    state = data.get("state", {})
    tendency_delta = data.get("tendency_delta", 0)

    # 성향 적용
    state = apply_tendency(state, tendency_delta)

    # 아이템 획득 처리 (이전 턴의 보상)
    item_reward = data.get("item_reward")
    if item_reward:
        state = add_item_to_player(state, item_reward)

    state["turn_count"] = state.get("turn_count", 0) + 1

    # 보스전 진입 판단 (선택지에 "맞서" 등이 포함되거나 턴 수 초과)
    trigger_boss = data.get("trigger_boss", False)
    if trigger_boss:
        return _start_boss(state)

    story_data = generate_story(state, choice)
    state["last_story"] = story_data["story"]

    # 아이템 보상 처리
    item_reward = story_data.get("item_reward")
    if item_reward and item_reward in ITEMS:
        state = add_item_to_player(state, item_reward)

    return jsonify({
        "story": story_data["story"],
        "choices": story_data["choices"],
        "tendency_deltas": story_data.get("tendency_deltas", [0, 0, 0]),
        "item_reward": item_reward,
        "state": state,
    })


@app.post("/api/boss/start")
def api_boss_start():
    """보스전 시작."""
    data = request.get_json()
    state = data.get("state", {})
    return _start_boss(state)


def _start_boss(state: dict):
    """보스전 시작 공통 로직."""
    state = start_boss_battle(state)
    boss = state["boss"]

    intro = generate_boss_intro(boss)

    return jsonify({
        "story": intro["narration"],
        "boss": boss,
        "state": state,
        "phase": "boss_battle",
    })


@app.post("/api/boss/turn")
def api_boss_turn():
    """보스전 턴 처리."""
    data = request.get_json()
    action = data.get("action", "공격")
    item_name = data.get("item_name")
    state = data.get("state", {})

    # game_logic에서 수치 계산
    state = process_boss_turn(state, action, item_name)
    turn_result = state.pop("_turn_result")

    # AI가 연출 텍스트 생성
    narration = generate_boss_turn_narration(turn_result, state["boss"]["name"])

    response = {
        "narration": narration["narration"],
        "player_hp": state["player"]["hp"],
        "player_mp": state["player"]["mp"],
        "boss_hp": state["boss"]["hp"],
        "boss_max_hp": state["boss"].get("max_hp", state["boss"]["hp"]),
        "player_damage": turn_result["player_damage_dealt"],
        "boss_damage": turn_result["boss_damage_dealt"],
        "player_action": turn_result["player_action"],
        "boss_action": turn_result["boss_action"],
        "stunned": turn_result["stunned"],
        "boss_dead": turn_result["boss_dead"],
        "game_over": turn_result["game_over"],
        "item_used": turn_result.get("item_used"),
        "state": state,
    }

    # 게임 클리어
    if turn_result["boss_dead"] and state.get("game_clear"):
        ending = generate_ending(state)
        response["ending"] = ending["ending"]
        response["game_clear"] = True

    return jsonify(response)


@app.post("/api/boss/retry")
def api_boss_retry():
    """보스전 재시작 (게임오버 후)."""
    data = request.get_json()
    state = data.get("state", {})
    state = restart_boss_battle(state)
    boss = state["boss"]
    intro = generate_boss_intro(boss)

    return jsonify({
        "story": intro["narration"],
        "boss": boss,
        "state": state,
        "phase": "boss_battle",
    })


@app.post("/api/items")
def api_items():
    """현재 보유 아이템 목록 + 상세 정보."""
    data = request.get_json()
    state = data.get("state", {})
    player_items = state.get("player", {}).get("items", [])

    items_detail = []
    for name in player_items:
        if name in ITEMS:
            items_detail.append({"name": name, **ITEMS[name]})

    return jsonify({"items": items_detail})


# ─── 서버 시작 ────────────────────────────────────────────────

if __name__ == "__main__":
    if not os.getenv("OPENAI_API_KEY"):
        print("⚠️  OPENAI_API_KEY가 설정되지 않았습니다.")
        print("   .env 파일에 OPENAI_API_KEY=sk-... 를 추가해주세요.")
        sys.exit(1)

    print("✨ 루멘드리아 서버를 시작합니다...")
    print("🌐 http://localhost:5000 에서 게임을 즐겨보세요!")
    app.run(host="0.0.0.0", port=5001, debug=True)
