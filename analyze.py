import json, sys, os
from collections import deque

with open(r'C:\Users\User\Desktop\lumendria\scenario_v3.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

nodes = data['nodes']
all_node_keys = set(nodes.keys())
start_node = data['start']

print(f'Total nodes: {len(all_node_keys)}')
print()

# Check 1
print('=== CHECK 1: Invalid next references ===')
edges = []
invalid_nexts = []
for node_key, node in nodes.items():
    for ci, choice in enumerate(node.get('choices', [])):
        nxt = choice.get('next')
        if nxt:
            edges.append((node_key, nxt))
            if nxt not in all_node_keys:
                invalid_nexts.append((node_key, nxt, ci))
                print(f'  INVALID: choice {ci} in "{node_key}" -> "{nxt}"')
    nxt = node.get('next')
    if nxt:
        edges.append((node_key, nxt))
        if nxt not in all_node_keys:
            invalid_nexts.append((node_key, nxt, -1))
            print(f'  INVALID: node "{node_key}" -> "{nxt}"')
if not invalid_nexts:
    print('  All valid.')
print()

# Check 2 & 4
print('=== CHECK 2 & 4: Endings & Unreachable ===')
ending_nodes = {k for k, v in nodes.items() if v.get('ending') == True}
print(f'Ending nodes ({len(ending_nodes)}): {sorted(ending_nodes)}')
reachable = set()
q = deque([start_node])
reachable.add(start_node)
while q:
    cur = q.popleft()
    node = nodes.get(cur)
    if node is None: continue
    for choice in node.get('choices', []):
        nxt = choice.get('next')
        if nxt and nxt not in reachable:
            reachable.add(nxt); q.append(nxt)
    nxt = node.get('next')
    if nxt and nxt not in reachable:
        reachable.add(nxt); q.append(nxt)
unreachable = all_node_keys - reachable
print(f'Reachable: {len(reachable)}, Unreachable: {len(unreachable)}')
for u in sorted(unreachable):
    print(f'  UNREACHABLE: "{u}"')
for e in sorted(ending_nodes):
    status = 'REACHABLE' if e in reachable else 'UNREACHABLE ENDING'
    print(f'  {status}: "{e}"')
print()

# Check 3
print('=== CHECK 3: Orphan nodes ===')
referenced = {'start'}
for (frm, to) in edges:
    referenced.add(to)
orphans = all_node_keys - referenced
for o in sorted(orphans):
    print(f'  ORPHAN: "{o}" defined but never referenced by any "next"')
if not orphans: print('  None.')
print()

# Check 5
print('=== CHECK 5: Image references ===')
img_dir = r'C:\Users\User\Desktop\lumendria\images'
actual = set(os.listdir(img_dir)) if os.path.isdir(img_dir) else set()
print(f'Actual image files ({len(actual)}): {sorted(actual)}')
referenced_images = set()
missing = []
for node_key, node in nodes.items():
    for img in (node.get('images', []) if isinstance(node.get('images', []), list) else [node.get('images', '')]):
        if img:
            fname = os.path.basename(img)
            referenced_images.add(fname)
            if fname not in actual:
                missing.append((node_key, img))
for nk, ip in missing:
    print(f'  MISSING: "{ip}" in "{nk}"')
if not missing:
    print('  All images found.')
unref = actual - referenced_images
if unref:
    print(f'  Unreferenced files: {sorted(unref)}')
print()

# Check 6 & 7
print('=== CHECK 6 & 7: Conditions & Effects ===')
init = data.get('initial_state', {})
init_keys = set(init.keys())
cond_keys = set()
eff_keys = set()
for node_key, node in nodes.items():
    for choice in node.get('choices', []):
        for c in [choice.get('conditions', {}), choice.get('condition', {})]:
            if isinstance(c, dict):
                for k in c: cond_keys.add(k)
        for c in [choice.get('effects', {})]:
            if isinstance(c, dict):
                for k in c: eff_keys.add(k)
    for c in [node.get('effects', {})]:
        if isinstance(c, dict):
            for k in c: eff_keys.add(k)

trace = {'hasSword', 'hasRelic', 'knowsTruth', 'sawSecret', 'corrupted', 'killedVillager'}
print(f'Init keys: {sorted(init_keys)}')
print(f'Condition keys: {sorted(cond_keys)}')
print(f'Effect keys: {sorted(eff_keys)}')
print(f'TRACE_DEFS: {sorted(trace)}')

for k in sorted(cond_keys):
    if k not in init_keys:
        print(f'  COND uses "{k}" not in init_state')
    else:
        print(f'  OK cond "{k}" in init_state')
for k in sorted(eff_keys):
    if k not in init_keys:
        print(f'  EFF sets "{k}" not in init_state')
    else:
        print(f'  OK eff "{k}" in init_state')

unrec = (cond_keys | eff_keys) - init_keys - trace
if unrec: print(f'  UNRECOGNIZED: {sorted(unrec)}')

# usedRelic
print()
print('=== ADDITIONAL: usedRelic ===')
print(f'  init.usedRelic = {init.get("usedRelic")} ({type(init.get("usedRelic")).__name__})')
for nk, node in nodes.items():
    for ci, ch in enumerate(node.get('choices', [])):
        if 'usedRelic' in ch.get('effects', {}):
            print(f'  Choice {ci} in "{nk}" sets usedRelic to "{ch["effects"]["usedRelic"]}"')
    if 'usedRelic' in node.get('effects', {}):
        print(f'  Node "{nk}" sets usedRelic to "{node["effects"]["usedRelic"]}"')
print(f'  Condition usedRelic >= 2 in throne choice 2')

# playerMotive
print()
print('=== ADDITIONAL: playerMotive ===')
pm_used = False
for nk, node in nodes.items():
    for ch in node.get('choices', []):
        if 'playerMotive' in ch.get('conditions', {}): pm_used = True
        if 'playerMotive' in ch.get('effects', {}): pm_used = True
    if 'playerMotive' in node.get('effects', {}): pm_used = True
if not pm_used:
    print('  WARNING: "playerMotive" in init_state but NEVER used!')

print()
print('=== DONE ===')
