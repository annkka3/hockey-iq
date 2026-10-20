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


def check_steps(cid, steps, ents, depth=0):
    for st in steps:
        if 'pause' in st:
            p = st['pause']
            if not p.get('question'): err(cid, 'пауза без вопроса')
            opts = p.get('options', [])
            if len(opts) < 2: err(cid, 'в паузе меньше двух вариантов')
            if not any(o.get('correct') for o in opts): err(cid, 'в паузе нет верного варианта')
            for o in opts:
                if not o.get('label') or not o.get('explain'): err(cid, 'вариант паузы без текста или объяснения')
                if o.get('then'): check_steps(cid, o['then'], ents, depth + 1)
        else:
            for mv in st.get('moves', []):
                if mv['who'] not in ents: err(cid, f'ход: нет игрока {mv["who"]}')
                elif not on_ice(*mv['to'], 0.2): err(cid, f'ход {mv["who"]} за бортом {mv["to"]}')


def build_plays(principles, phases):
    plays, seen = [], set()
    for path in sorted(glob.glob(os.path.join(SRC, 'plays', '*.json'))):
        for p in json.load(open(path, encoding='utf-8')):
            pid = p.get('id', '?')
            if pid in seen: err(pid, 'повтор id розыгрыша')
            seen.add(pid)
            for f in ('title', 'line', 'principle', 'steps', 'us'):
                if f not in p: err(pid, f'нет поля {f}')
            if p.get('principle') not in principles: err(pid, f'неизвестный принцип {p.get("principle")}')
            if p.get('kind', 'film') not in ('film', 'branch'): err(pid, 'kind: film или branch')
            ents = {e['id']: e for e in p.get('us', []) + p.get('them', [])}
            for e in ents.values():
                if not on_ice(e['x'], e['y']): err(pid, f'{e["id"]} вне льда')
            if p.get('puck'): ents['puck'] = p['puck']
            check_steps(pid, p.get('steps', []), ents)
            plays.append(p)
    return plays


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
            rd = c.get('read')
            if rd:
                # «Смотри → Предскажи → Действуй»: вопрос на чтение, затем показ продолжения, затем решение
                if not rd.get('text'): err(cid, 'read: нет вопроса')
                ro = rd.get('options', [])
                if not 2 <= len(ro) <= 3: err(cid, 'read: нужно 2–3 варианта')
                if sum(1 for o in ro if o.get('correct')) != 1: err(cid, 'read: верный вариант должен быть ровно один')
                if len({o.get('id') for o in ro}) != len(ro): err(cid, 'read: повтор id варианта')
                for o in ro:
                    if not o.get('label') or not o.get('explain'): err(cid, 'read: вариант без текста или объяснения')
                if not rd.get('reveal'): err(cid, 'read: нет reveal — продолжения, которое показываем после прогноза')
                me_id = next((e['id'] for e in c.get('us', []) if e.get('me')), None)
                for mv in rd.get('reveal', []):
                    if mv['who'] not in ents or ents[mv['who']] is None: err(cid, f'read: ход несуществующего {mv["who"]}')
                    elif not on_ice(*mv['to'], 0.2): err(cid, f'read: ход {mv["who"]} за борт {mv["to"]}')
                    if mv['who'] == me_id: warn(cid, 'read: в продолжении двигается сам «Я» — решение должен принять он')
            if not c.get('source'): warn(cid, 'нет источника')
            c.setdefault('status', 'draft')
            cards.append(c)

    # программа «Центр U15»: каждая ситуация отнесена к одному из пяти блоков (tools/source/program.json)
    prog_path = os.path.join(SRC, 'program.json')
    if os.path.exists(prog_path):
        prog = json.load(open(prog_path, encoding='utf-8'))
        tracks = {t['id'] for t in prog['tracks']}
        content['program'] = {'tracks': prog['tracks']}
        for c in cards:
            t = prog['cards'].get(c['id'])
            if t is None: warn(c['id'], 'не отнесена к блоку программы U15')
            elif t not in tracks: err(c['id'], f'неизвестный блок программы {t}')
            else: c['track'] = t
        for cid in prog['cards']:
            if cid not in seen: warn(cid, 'в program.json есть id, которого нет среди карточек')
    order = {d['id']: i for i, d in enumerate(content['decks'])}
    cards.sort(key=lambda c: (c.get('difficulty', 2), order.get(c['deck'], 99)))
    # сначала все виды содержания, потом общая проверка — ошибки в розыгрышах тоже останавливают запись
    plays = build_plays(principles, phases)
    for w in warnings: print('  внимание:', w)
    if errors or ('--strict' in sys.argv and warnings):
        for e in errors: print('  ОШИБКА:', e)
        print(f'Сборка остановлена: {len(errors)} ошибок.')
        sys.exit(1)

    scans_path = os.path.join(SRC, 'scans.json')
    scans = json.load(open(scans_path, encoding='utf-8')) if os.path.exists(scans_path) else []
    out = {'scans': scans, 'plays': plays, 'version': max(c['version'] for c in cards) if cards else 0, 'built': None, **content, 'cards': cards}
    stamp = hashlib.md5(json.dumps(cards, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:8]
    out['built'] = stamp
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    by = {}
    for c in cards: by[c['deck']] = by.get(c['deck'], 0) + 1
    print(f'Розыгрышей: {len(out["plays"])}')
    print(f'Готово: {len(cards)} карточек ' + ', '.join(f'{k} {v}' for k, v in by.items()) + f' → data/content.json')


if __name__ == '__main__':
    main()
