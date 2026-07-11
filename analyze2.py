import json
D = json.load(open(r'C:\Users\User\Desktop\lumendria\scenario_v3.json', 'r', encoding='utf-8'))
N = D['nodes']
print('=== Choices without "next" ===')
for k, n in N.items():
    for ci, c in enumerate(n.get('choices', [])):
        if not c.get('next'):
            print(f'  Node "{k}" choice {ci} has no "next"')
print()
print('=== Nodes without "text" ===')
for k, n in N.items():
    if not n.get('text'):
        print(f'  Node "{k}" has no "text"')
print()
print('=== Non-ending nodes with 0 choices ===')
for k, n in N.items():
    if not n.get('ending') and len(n.get('choices', [])) == 0:
        print(f'  Node "{k}" is not ending but has 0 choices')
print()
print('=== Nodes with direct "next" (not in choices) ===')
for k, n in N.items():
    if n.get('next'):
        print(f'  Node "{k}" -> next="{n.get("next")}"')
print()
print('=== Nodes with hidden flag ===')
for k, n in N.items():
    if n.get('hidden'):
        print(f'  Node "{k}" hidden={n.get("hidden")}')
print()
print('=== Nodes with images ===')
for k, n in N.items():
    imgs = n.get('images', [])
    if imgs:
        print(f'  Node "{k}": {imgs}')
print()
