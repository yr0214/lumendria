"""
루멘드리아 - AI 서비스
OpenAI GPT-4o-mini를 통한 스토리 생성 및 보스전 연출.
수치 계산은 game_logic.py에서 처리하고, 여기서는 연출 텍스트만 생성한다.
"""

from __future__ import annotations

import json
import os

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

MODEL = "gpt-4o-mini"


def _call_ai(system_prompt: str, user_prompt: str) -> dict | None:
    """OpenAI API 호출 후 JSON 파싱."""
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.8,
            max_tokens=1024,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        return json.loads(content)
    except Exception as e:
        print(f"[AI Error] {e}")
        return None


# ─── 스토리 생성 ─────────────────────────────────────────────

STORY_SYSTEM_PROMPT = """너는 초등학생 여자아이를 위한 서양 판타지 게임의 스토리 작가야.
세계관: "루멘드리아" — 빛의 힘이 점점 사라지고 있는 판타지 세계.
주인공: 마검사 리아나 (은발, 보라색 눈, 검은 망토). 빛의 수호자로 선택된 소녀.

스타일:
- 쉬운 한국어 사용 (초등학생 3~4학년이 이해할 수 있는 수준)
- 무섭거나 잔인한 내용 금지. 긴장감은 있되, 희망적인 톤
- 문장은 짧고 리듬감 있게
- 감각적 묘사 (빛, 색, 소리, 냄새) 적극 활용
- 리아나의 감정과 내면을 함께 표현

반드시 아래 형식의 JSON만 반환:
{
  "story": "3~5문장의 스토리. 생동감 있게.",
  "choices": ["선택지1 (8자 이내)", "선택지2 (8자 이내)", "선택지3 (8자 이내)"],
  "tendency_deltas": [0, 1, -1],
  "item_reward": null
}

tendency_deltas 규칙:
- 용감하거나 이타적인 선택 → 양수 (+1)
- 신중하거나 중립적인 선택 → 0
- 대담하거나 이기적인 선택 → 음수 (-1)

item_reward 규칙:
- 스토리 전개상 아이템을 획득하는 것이 자연스러운 경우에만 값을 넣어
- 가능한 아이템: "빛나는 포션", "마나 크리스탈", "수호의 부적", "용기의 반지"
- 대부분의 턴에서는 null"""


def generate_story(state: dict, choice: str | None = None) -> dict | None:
    """스토리 선택지 기반으로 다음 스토리를 생성한다."""
    player = state["player"]
    chapter = state["chapter"]
    location = state["location"]

    user_content = f"""현재 챕터: {chapter}/3
현재 장소: {location}
플레이어 상태: 체력 {player['hp']}/{100}, 마나 {player['mp']}/{50}
아이템: {', '.join(player['items']) if player['items'] else '없음'}
성향: {player['route']} (수치: {player['tendency']})
턴 수: {state['turn_count']}"""

    if choice:
        user_content += f"\n플레이어의 선택: {choice}"
        user_content += f"\n이전 스토리: {state.get('last_story', '')}"
    else:
        user_content += "\n게임 시작! 리아나의 모험이 시작되는 첫 장면을 만들어줘."

    # 보스전 유도 (턴 수 기반)
    if state["turn_count"] >= 5 and not state["in_boss_battle"]:
        user_content += "\n\n[중요] 이번 턴에서 스토리를 보스와의 조우로 자연스럽게 이끌어줘. 선택지 중 하나는 반드시 보스와 맞서는 것이어야 해."

    print(f"[AI] Calling story generation. Chapter={chapter}, Turn={state.get('turn_count')}, Choice={choice}")
    result = _call_ai(STORY_SYSTEM_PROMPT, user_content)
    if not result:
        print("[AI] API call returned None — using fallback")
        return _fallback_story(chapter, location)

    # 유효성 검증
    if "story" not in result or "choices" not in result:
        print(f"[AI] Invalid response structure: {result}")
        return _fallback_story(chapter, location)

    if not isinstance(result["choices"], list) or len(result["choices"]) < 2:
        print(f"[AI] Invalid choices: {result.get('choices')}")
        return _fallback_story(chapter, location)

    print(f"[AI] Success: {result['story'][:50]}...")
    return result


def _fallback_story(chapter: int, location: str) -> dict:
    """AI 응답 실패 시 폴백 스토리."""
    fallbacks = {
        1: {
            "story": "리아나는 안개 낀 마을 광장에서 이상한 빛을 발견했다. 빛은 마치 누군가를 부르는 것처럼 깜빡이고 있었다. 가슴이 두근두근 뛰기 시작했다.",
            "choices": ["빛을 따라간다", "마을 사람에게 묻는다", "조심히 지켜본다"],
            "tendency_deltas": [1, 0, -1],
            "item_reward": None,
        },
        2: {
            "story": "숲 입구에 도착한 리아나는 나뭇잎 사이로 새어 나오는 신비로운 빛을 보았다. 숲은 조용했지만, 어딘가에서 작은 목소리가 들리는 것 같았다.",
            "choices": ["목소리를 따라간다", "검을 꺼내 든다", "숲의 기운을 느낀다"],
            "tendency_deltas": [1, 0, -1],
            "item_reward": None,
        },
        3: {
            "story": "흑염의 성 앞에 선 리아나의 검이 환하게 빛나기 시작했다. 성 안에서 어둠의 기운이 밀려왔지만, 리아나는 두렵지 않았다.",
            "choices": ["정문으로 들어간다", "비밀 통로를 찾는다", "빛의 힘을 모은다"],
            "tendency_deltas": [1, 0, -1],
            "item_reward": None,
        },
    }
    return fallbacks.get(chapter, fallbacks[1])


# ─── 보스전 연출 ─────────────────────────────────────────────

BOSS_NARRATION_SYSTEM_PROMPT = """너는 초등학생 여자아이를 위한 판타지 게임의 전투 내레이터야.
주인공: 마검사 리아나

전투 결과 데이터를 받아서, 박진감 넘치는 전투 내레이션을 2~3문장으로 만들어줘.
쉬운 한국어로, 무섭지 않게, 하지만 긴장감 있게!

반드시 아래 형식의 JSON만 반환:
{
  "narration": "2~3문장의 전투 내레이션"
}"""


def generate_boss_intro(boss: dict) -> dict | None:
    """보스 등장 연출 텍스트 생성."""
    user_content = f"""보스 등장 장면을 만들어줘.
보스 이름: {boss['name']}
보스 설명: {boss['description']}
보스 특수 기술: {boss['special_skill']}

긴장감 있지만 무섭지 않게, 3~4문장으로."""

    result = _call_ai(
        BOSS_NARRATION_SYSTEM_PROMPT.replace("전투 내레이션을 2~3문장으로", "보스 등장 내레이션을 3~4문장으로"),
        user_content,
    )
    if result and "narration" in result:
        return result
    return {"narration": f"{boss['name']}이(가) 나타났다! {boss['description']} 리아나는 검을 꽉 쥐었다."}


def generate_boss_turn_narration(turn_result: dict, boss_name: str) -> dict | None:
    """보스전 턴 결과에 대한 연출 텍스트 생성."""
    user_content = f"""전투 상황:
- 리아나의 행동: {turn_result['player_action']}
- 리아나가 준 피해: {turn_result['player_damage_dealt']}
- 보스({boss_name})의 행동: {turn_result['boss_action']}
- 보스가 준 피해: {turn_result['boss_damage_dealt']}
- 리아나 기절 여부: {'기절!' if turn_result['stunned'] else '정상'}
- 아이템 사용: {turn_result.get('item_used', '없음')}"""

    if turn_result["boss_dead"]:
        user_content += "\n- [보스가 쓰러졌다! 승리 장면을 멋지게 묘사해줘!]"
    elif turn_result["game_over"]:
        user_content += "\n- [리아나가 쓰러졌다... 하지만 희망을 잃지 않는 톤으로.]"

    result = _call_ai(BOSS_NARRATION_SYSTEM_PROMPT, user_content)
    if result and "narration" in result:
        return result
    return _fallback_boss_narration(turn_result, boss_name)


def _fallback_boss_narration(turn_result: dict, boss_name: str) -> dict:
    """보스전 AI 응답 실패 시 폴백."""
    if turn_result["boss_dead"]:
        return {"narration": f"리아나의 마지막 일격이 {boss_name}을(를) 관통했다! 빛이 어둠을 물리쳤다!"}
    if turn_result["game_over"]:
        return {"narration": "리아나가 쓰러졌다... 하지만 포기하지 않아! 다시 일어설 시간이야!"}
    if turn_result["stunned"]:
        return {"narration": f"{boss_name}의 공격에 리아나가 잠시 움직일 수 없게 되었다! 하지만 곧 회복할 거야!"}
    return {"narration": f"리아나와 {boss_name}의 치열한 공방이 계속된다!"}


# ─── 엔딩 생성 ───────────────────────────────────────────────

ENDING_SYSTEM_PROMPT = """너는 초등학생 여자아이를 위한 판타지 게임의 스토리 작가야.
게임 클리어 엔딩을 만들어줘.

반드시 아래 형식의 JSON만 반환:
{
  "ending": "5~7문장의 감동적인 엔딩 스토리"
}"""


def generate_ending(state: dict) -> dict | None:
    """게임 클리어 엔딩 생성."""
    route = state["player"]["route"]
    user_content = f"""리아나가 최종 보스 '흑염의 마녀 모르가나'를 물리쳤어!
리아나의 성향: {route}
성향 수치: {state['player']['tendency']}

{route}에 맞는 엔딩을 만들어줘:
- "빛의 길": 희생과 용기로 세계를 구한 밝은 엔딩
- "균형의 길": 빛과 어둠의 조화를 찾은 지혜로운 엔딩
- "어둠의 길": 강한 힘으로 세계를 지배하지만 외로운 엔딩 (하지만 희망은 있게)"""

    result = _call_ai(ENDING_SYSTEM_PROMPT, user_content)
    if result and "ending" in result:
        return result
    return {
        "ending": "리아나의 검에서 환한 빛이 뿜어져 나왔다. 어둠이 걷히고 루멘드리아에 다시 빛이 돌아왔다. "
        "마을 사람들은 환호했고, 리아나는 하늘을 올려다보며 미소 지었다. "
        "이것은 끝이 아니라, 새로운 시작이었다."
    }
