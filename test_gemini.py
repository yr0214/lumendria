import os
from dotenv import load_dotenv
load_dotenv()

import google.generativeai as genai

try:
    genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))
    model = genai.GenerativeModel('gemini-2.5-flash')
    print('모델 생성 성공')

    prompt = '''다음 JSON 형식으로만 응답해주세요. 다른 텍스트를 추가하지 마세요:

{"message": "hello", "status": "success"}'''
    response = model.generate_content(prompt)
    print('API 호출 성공')
    print('응답:', repr(response.text))

    # 마크다운 코드 블록 제거
    content = response.text
    if content.startswith('```') and '```' in content:
        start = content.find('```json\n') if '```json\n' in content else content.find('```\n')
        if start != -1:
            start += content[start:].find('\n') + 1
            end = content.rfind('```')
            if end > start:
                content = content[start:end].strip()
                print('코드 블록 제거 후:', repr(content))

    # JSON 파싱 테스트
    import json
    try:
        result = json.loads(content.strip())
        print('JSON 파싱 성공:', result)
    except json.JSONDecodeError as e:
        print('JSON 파싱 실패:', e)

except Exception as e:
    print('오류:', e)
    import traceback
    traceback.print_exc()