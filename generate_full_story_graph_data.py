import json
from pathlib import Path

path = Path('scenario_v3.json')
text = path.read_text(encoding='utf-8')
data = json.loads(text)
nodes_data = data['nodes']
start = data['start']

seen = set()
queue = [(start, 0)]
nodes = []
edges = []
level_order = {start: 0}
visit_order = {}
next_order = 1

while queue:
    node_id, depth = queue.pop(0)
    if node_id in seen:
        continue
    seen.add(node_id)
    node = nodes_data.get(node_id)
    if not node:
        continue
    if node_id not in visit_order:
        visit_order[node_id] = next_order
        next_order += 1
    label = node.get('text', '').split('\n')[0]
    nodes.append({
        'id': node_id,
        'label': f'L{depth} #{visit_order[node_id]} {node_id}\\n{label[:70]}',
        'title': node.get('text', ''),
        'shape': 'box',
        'level': depth,
        'order': visit_order[node_id],
        'ending': node.get('ending', False) or node.get('hidden', False)
    })
    for choice in node.get('choices', []):
        nxt = choice.get('next')
        if nxt:
            edges.append({'from': node_id, 'to': nxt})
            if nxt not in visit_order:
                visit_order[nxt] = next_order
                next_order += 1
            if nxt not in seen:
                queue.append((nxt, depth + 1))

max_non_ending_level = max((n['level'] for n in nodes if not n['ending']), default=0)
for node in nodes:
    if node['ending']:
        node['level'] = max_non_ending_level + 1
        node['label'] = f'L{node["level"]} #{node["order"]} {node["id"]}\\n{node["label"].split("\\n",1)[1]}'

out = Path('story_graph_data.js')
out.write_text('window.storyGraphData = ' + json.dumps({'nodes': nodes, 'edges': edges}, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8')
print(f'Created story_graph_data.js with {len(nodes)} nodes and {len(edges)} edges')
