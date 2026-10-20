#!/usr/bin/env python3
"""Импорт ситуаций и миссий из HOCKEY IQ LAB 4.0 (tools/source/lab/lab-v4.json) в формат Hockey IQ.

Берётся только содержание: расстановки 5 × 5, вопросы, варианты, разборы, «куда смотреть», «на льду».
Графика архива не переносится. Координаты пересчитываются по ориентирам площадки:
в архиве x 0..100 вдоль (линия ворот 11,67, синие 30,7 и 69,3, центр 50,3), y 0..100 поперёк;
у нас y 0..60 вдоль (линия ворот 4, синие 22,86 / 37,14), x −15..15 поперёк.

Тексты, которых в архиве нет (объяснения неверных вариантов, принцип), берутся из
tools/source/lab/lab-notes.json, если файл есть; иначе ставятся черновые значения и карточка помечается.
Выход: tools/source/decks/lab.json и tools/source/plays/missions.json.
Запуск: python3 tools/import_lab.py
"""
import json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'source', 'lab', 'lab-v4.json')
NOTES = os.path.join(ROOT, 'tools', 'source', 'lab', 'lab-notes.json')
OUT_CARDS = os.path.join(ROOT, 'tools', 'source', 'decks', 'lab.json')
OUT_PLAYS = os.path.join(ROOT, 'tools', 'source', 'plays', 'missions.json')

A = [0, 11.67, 30.7, 50.3, 69.3, 88.3, 100]
B = [0, 4, 22.86, 30, 37.14, 56, 60]
W, L, R = 30.0, 60.0, 8.5


def along(x):
    for i in range(1, len(A)):
        if x <= A[i] or i == len(A) - 1:
            t = (x - A[i - 1]) / (A[i] - A[i - 1])
            return B[i - 1] + t * (B[i] - B[i - 1])


def across(y):
    return (35 + 3.65 * y - 220) / 432 * 30


def inside(x, y, m=0.9):
    x = max(-W / 2 + m, min(W / 2 - m, x))
    y = max(m, min(L - m, y))
    cx = -W / 2 + R if x < -W / 2 + R else (W / 2 - R if x > W / 2 - R else None)
    cy = R if y < R else (L - R if y > L - R else None)
    if cx is not None and cy is not None:
        d = math.hypot(x - cx, y - cy)
        if d > R - m:
            k = (R - m) / d
            x, y = cx + (x - cx) * k, cy + (y - cy) * k
    return round(x, 1), round(y, 1)


def pt(p):
    return inside(across(p[1]), along(p[0]))


ROLE_US = {'Ц': 'C', 'ЛН': 'LW', 'ПН': 'RW', 'ЛЗ': 'LD', 'ПЗ': 'RD', 'ВР': 'G'}
ROLE_THEM = {'Ц': 'F', 'ЛН': 'F', 'ПН': 'F', 'ЛЗ': 'D', 'ПЗ': 'D', 'ВР': 'G'}


def team(players):
    us, them = [], []
    for side, x, y, role in players:
        px, py = pt([x, y])
        if role == 'ВР':
            py = 4.9 if side == 'b' else 55.1
            px = max(-0.9, min(0.9, px * 0.15))
        if side == 'b':
            e = {'id': ROLE_US[role], 'role': ROLE_US[role], 'x': px, 'y': py}
            if role == 'Ц': e['me'] = True
            us.append(e)
        else:
            e = {'id': 'o' + ROLE_US[role], 'role': ROLE_THEM[role], 'x': px, 'y': py}
            them.append(e)
    # разводим фишки, стоящие друг на друге
    allp = us + them
    for _ in range(30):
        moved = False
        for i in range(len(allp)):
            for j in range(i + 1, len(allp)):
                a, b = allp[i], allp[j]
                d = math.hypot(a['x'] - b['x'], a['y'] - b['y'])
                if d < 1.6:
                    dx, dy = (b['x'] - a['x'], b['y'] - a['y']) if d > 0.01 else (1, 0)
                    n = math.hypot(dx, dy)
                    push = (1.65 - d) / 2
                    if b['role'] != 'G': b['x'], b['y'] = inside(b['x'] + dx / n * push, b['y'] + dy / n * push)
                    if a['role'] != 'G': a['x'], a['y'] = inside(a['x'] - dx / n * push, a['y'] - dy / n * push)
                    moved = True
        if not moved: break
    return us, them


TOPIC = {
    'Выход из зоны': 'breakout', 'Нейтральная зона': 'nz', 'Позиционная атака': 'oz', 'Бросок и добивание': 'oz',
    'Вход в атаку': 'entry', 'Оборона центра': 'dz', 'Форчек и возврат': 'nz', 'Вбрасывания и численное': 'faceoff',
}


def window(ys):
    lo, hi = min(ys), max(ys)
    mid = (lo + hi) / 2
    span = max(30, hi - lo + 8)
    y0 = max(0, mid - span / 2)
    y1 = min(60, y0 + span)
    y0 = max(0, y1 - span)
    return [round(y0, 1), round(y1, 1)]


def main():
    data = json.load(open(SRC, encoding='utf-8'))
    notes = json.load(open(NOTES, encoding='utf-8')) if os.path.exists(NOTES) else {}
    cards = []
    for i, s in enumerate(data['scenarios'], 1):
        cid = f'lab-{i:02d}'
        n = notes.get(cid, {})
        us, them = team(s['players'])
        # численность: заметки могут убрать игроков (например, сделать настоящее меньшинство 4 × 5)
        us = [e for e in us if e['id'] not in n.get('remove_us', [])]
        them = [e for e in them if e['id'] not in n.get('remove_them', [])]
        me = next(e for e in us if e.get('me'))
        puck = pt(s['puck'])
        has_puck = math.hypot(puck[0] - me['x'], puck[1] - me['y']) < 2.2
        path = [pt(p) for p in s.get('path', [])][1:]
        options = []
        for k, label in enumerate(s['options']):
            good = k == s['correct']
            oid = 'abc'[k]
            o = {'id': oid, 'label': n.get('labels', {}).get(oid, label),
                 'verdict': 'best' if good else n.get('verdicts', {}).get(oid, 'bad'),
                 'explain': n.get('best_explain', s['why']) if good else n.get('explain', {}).get(oid, 'Не лучший выбор. ' + s['why'])}
            if good and path:
                o['moves'] = [{'who': 'C', 'to': list(p), 'carry': has_puck} for p in path]
            options.append(o)
        topic = s.get('topic', '')
        deck = 'faceoff' if topic.startswith('Вбрасывания') else ('with-puck' if has_puck else 'no-puck')
        if n.get('deck'): deck = n['deck']
        ys = [me['y'], puck[1]] + [p[1] for p in path]
        card = {
            'id': cid, 'version': 1, 'deck': deck, 'phase': n.get('phase', TOPIC.get(topic, 'oz')),
            'principle': n.get('principle', 'support-triangle'), 'difficulty': s.get('level', 2),
            'title': s['title'], 'view': window(ys),
            'story': s['story'],
            'question': {'kind': 'choice', 'text': n.get('question', s['question'])},
            'us': us, 'them': them, 'puck': {'x': puck[0], 'y': puck[1]},
            'options': options, 'cue': s.get('cue'), 'ice': s.get('ice'),
            **({'read': n['read']} if n.get('read') else {}),
            'source': {'basis': 'HOCKEY IQ LAB 4.0 — ' + topic}, 'status': 'draft', 'origin': 'lab',
        }
        cards.append(card)
    json.dump(cards, open(OUT_CARDS, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    plays = []
    mnotes = notes.get('missions', {})
    for mi, m in enumerate(data['epiData'], 1):
        pid = f'mission-{mi}'
        nodes = m['nodes']

        def steps_for(key, depth=0):
            nd = nodes[key]
            us, them = team(nd['players'])
            px, py = pt(nd['puck'])
            st = [{'frame': {'us': us, 'them': them, 'puck': {'x': px, 'y': py}}, 'caption': nd['story']}]
            opts = []
            for c in nd.get('choices', []):
                mv = []
                if c.get('move'): mv.append({'who': 'C', 'to': list(pt(c['move']))})
                if c.get('puckTo'): mv.append({'who': 'puck', 'to': list(pt(c['puckTo'])), 'kind': 'pass', 'with': True})
                then = [{'moves': mv, 'caption': c['feedback']}] if mv else []
                if c.get('next') and depth < 3: then += steps_for(c['next'], depth + 1)
                opts.append({'label': c['text'], 'correct': bool(c.get('good')), 'explain': c['feedback'], 'then': then})
            if opts:
                st.append({'pause': {'question': nd['q'], 'cue': nd.get('cue'), 'ice': nd.get('ice'), 'options': opts}})
            return st

        start = nodes['start']
        us, them = team(start['players'])
        px, py = pt(start['puck'])
        steps = steps_for('start')
        steps[0] = {'caption': start['story']}  # первый кадр — исходная расстановка
        plays.append({
            'id': pid, 'kind': 'branch', 'mission': True, 'title': m['name'], 'line': m['subtitle'],
            'takeaway': mnotes.get(pid, {}).get('takeaway', ''), 'principle': mnotes.get(pid, {}).get('principle', 'support-triangle'),
            'phase': mnotes.get(pid, {}).get('phase', 'oz'), 'view': 'full', 'us': us, 'them': them, 'puck': {'x': px, 'y': py},
            'steps': steps, 'source': {'basis': 'HOCKEY IQ LAB 4.0 — миссия «' + m['name'] + '»'},
        })
    json.dump(plays, open(OUT_PLAYS, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    scans = data.get('scans', [])
    out = []
    for s in scans:
        out.append({'friends': [{'label': f[2], 'x': pt(f)[0], 'y': pt(f)[1]} for f in s['friends']],
                    'foes': [{'x': pt(f)[0], 'y': pt(f)[1]} for f in s['foes']], 'answer': s['answer']})
    json.dump(out, open(os.path.join(ROOT, 'tools', 'source', 'scans.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'Ситуаций: {len(cards)}, миссий: {len(plays)}, расстановок «Открытый игрок»: {len(out)}')


if __name__ == '__main__':
    main()
