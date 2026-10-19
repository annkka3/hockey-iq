#!/usr/bin/env python3
"""Сборка контента: tools/source → data/content.json.

Проверяет каждую карточку и падает с понятной ошибкой, если что-то не так:
  — обязательные поля, известные колода/фаза/принцип, уникальные id;
  — все игроки и шайба на льду (с учётом скруглённых углов), игроки не стоят друг на друге;
  — у каждого варианта ответа есть вердикт и объяснение (своё или из контекста);
  — ровно одно лучшее решение (в каждом контексте, если они есть);
  — зоны ответа на «тап» не пересекаются;
  — ходы ссылаются на существующих игроков.
Запуск: python3 tools/build_content.py   (опция --strict превращает предупреждения в ошибки)
"""
import json, math, sys, glob, os, re, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'source')
OUT = os.path.join(ROOT, 'data', 'content.json')
SW = os.path.join(ROOT, 'sw.js')

L, W, R = 60.0, 30.0, 8.5
VERDICTS = {'best', 'ok', 'bad'}
ROLES = {'C', 'LW', 'RW', 'LD', 'RD', 'G', 'F', 'D'}

errors, warnings = [], []
err = lambda cid, m: errors.append(f'{cid}: {m}')
warn = lambda cid, m: warnings.append(f'{cid}: {m}')


def on_ice(x, y, m=0.4):
    if not (-W / 2 + m <= x <= W / 2 - m and m <= y <= L - m):
        return False
    cx = -W / 2 + R if x < -W / 2 + R else (W / 2 - R if x > W / 2 - R else None)
    cy = R if y < R else (L - R if y > L - R else None)
    if cx is not None and cy is not None and math.hypot(x - cx, y - cy) > R - m:
        return False
    return True


def main():
    content = json.load(open(os.path.join(SRC, 'content.json'), encoding='utf-8'))
    decks = {d['id'] for d in content['decks']}
    phases = {p['id'] for p in content['phases']}
    principles = {p['id'] for p in content['principles']}
    cards, seen = [], set()
    for path in sorted(glob.glob(os.path.join(SRC, 'decks', '*.json'))):
        for c in json.load(open(path, encoding='utf-8')):
            cid = c.get('id', '?')
            if cid in seen: err(cid, 'повтор id')
            seen.add(cid)
            for f in ('version', 'deck', 'phase', 'principle', 'title', 'question', 'us', 'options'):
                if f not in c: err(cid, f'нет поля {f}')
            if c.get('deck') not in decks: err(cid, f'неизвестная колода {c.get("deck")}')
            if c.get('phase') not in phases: err(cid, f'неизвестная фаза {c.get("phase")}')
            if c.get('principle') not in principles: err(cid, f'неизвестный принцип {c.get("principle")}')
            q = c.get('question', {})
            if q.get('kind') not in ('choice', 'tap'): err(cid, 'question.kind должен быть choice или tap')
            if not q.get('text'): err(cid, 'нет текста вопроса')

            ents = {}
            mes = 0
            for team in ('us', 'them'):
                for e in c.get(team, []):
                    if e['id'] in ents: err(cid, f'повтор игрока {e["id"]}')
                    if e.get('role') not in ROLES: err(cid, f'{e["id"]}: неизвестная роль {e.get("role")}')
                    ents[e['id']] = e
                    mes += 1 if e.get('me') else 0
                    for (x, y) in [(e['x'], e['y'])] + ([tuple(e['from'])] if e.get('from') else []):
                        if not on_ice(x, y): err(cid, f'{e["id"]} вне льда ({x}, {y})')
            if mes != 1: err(cid, f'должен быть ровно один «Я», а их {mes}')
            ids = list(ents)
            for i in range(len(ids)):
                for j in range(i + 1, len(ids)):
                    a, b = ents[ids[i]], ents[ids[j]]
                    d = math.hypot(a['x'] - b['x'], a['y'] - b['y'])
                    if d < 1.5: warn(cid, f'{ids[i]} и {ids[j]} почти друг на друге ({d:.1f} м)')
            if c.get('puck') and not on_ice(c['puck']['x'], c['puck']['y'], 0.2):
                err(cid, 'шайба вне льда')
            ents['puck'] = c.get('puck')

            opts = c.get('options', [])
            oids = [o['id'] for o in opts]
            if len(set(oids)) != len(oids): err(cid, 'повтор id варианта')
            if len(opts) < 2: err(cid, 'меньше двух вариантов')
            variants = c.get('variants') or []
            for o in opts:
                if o.get('verdict') not in VERDICTS: err(cid, f'вариант {o["id"]}: вердикт {o.get("verdict")}')
                if q.get('kind') == 'choice' and not o.get('label'): err(cid, f'вариант {o["id"]}: нет текста кнопки')
                if q.get('kind') == 'tap':
                    z = o.get('zone')
                    if not z: err(cid, f'вариант {o["id"]}: нет зоны')
                    elif not on_ice(z['x'], z['y']): err(cid, f'вариант {o["id"]}: зона вне льда')
                has_own = bool(o.get('explain'))
                in_all_variants = bool(variants) and all((v.get('explain') or {}).get(o['id']) for v in variants)
                if not has_own and not in_all_variants:
                    err(cid, f'вариант {o["id"]}: нет объяснения')
                for mv in o.get('moves', []):
                    if mv['who'] not in ents or ents[mv['who']] is None: err(cid, f'ход: нет игрока {mv["who"]}')
                    if not on_ice(*mv['to'], 0.2): err(cid, f'ход {mv["who"]} уводит за борт {mv["to"]}')
            if q.get('kind') == 'tap':
                zs = [o['zone'] for o in opts if o.get('zone')]
                for i in range(len(zs)):
                    for j in range(i + 1, len(zs)):
                        a, b = zs[i], zs[j]
                        if math.hypot(a['x'] - b['x'], a['y'] - b['y']) < a['r'] + b['r']:
                            err(cid, f'зоны {oids[i]} и {oids[j]} пересекаются')
            if variants:
                for v in variants:
                    vd = v.get('verdicts', {})
                    if set(vd) != set(oids): err(cid, f'контекст {v.get("key")}: вердикты не на все варианты')
                    if list(vd.values()).count('best') != 1: err(cid, f'контекст {v.get("key")}: лучших решений не одно')
                    if not re.match(r'^(plan|score|strength|clock):[a-z-]+$', v.get('key', '')): err(cid, f'плохой ключ контекста {v.get("key")}')
            elif [o.get('verdict') for o in opts].count('best') != 1:
                err(cid, 'лучших решений не одно')
            if not c.get('source'): warn(cid, 'нет источника')
            c.setdefault('status', 'draft')
            cards.append(c)

    order = {d['id']: i for i, d in enumerate(content['decks'])}
    cards.sort(key=lambda c: (c.get('difficulty', 2), order.get(c['deck'], 99)))
    for w in warnings: print('  внимание:', w)
    if errors or ('--strict' in sys.argv and warnings):
        for e in errors: print('  ОШИБКА:', e)
        print(f'Сборка остановлена: {len(errors)} ошибок.')
        sys.exit(1)

    out = {'version': max(c['version'] for c in cards) if cards else 0, 'built': None, **content, 'cards': cards}
    stamp = hashlib.md5(json.dumps(cards, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:8]
    out['built'] = stamp
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    by = {}
    for c in cards: by[c['deck']] = by.get(c['deck'], 0) + 1
    print(f'Готово: {len(cards)} карточек ' + ', '.join(f'{k} {v}' for k, v in by.items()) + f' → data/content.json')


if __name__ == '__main__':
    main()
