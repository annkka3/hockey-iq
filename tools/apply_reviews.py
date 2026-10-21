#!/usr/bin/env python3
"""Перенос отзывов родителя или тренера в исходники карточек.

Файл отзывов скачивается в приложении: «Для родителей» → «Проверка ситуаций» → «Скачать отзывы (JSON)».
Формат: {"reviews": {"<id>": {"status": "reviewed" | "needs-fix" | "draft", "verdict": "ok" | "no" | "other", "note": "…"}}}.

Что делает:
  — в tools/source/decks/*.json ставит карточке "status" и "review" (вердикт, комментарий, дата переноса);
  — для ситуаций LAB (lab-NN) пишет то же в tools/source/lab/lab-notes.json — importer переносит статус в колоду;
  — печатает, что изменилось; карточки с needs-fix после сборки не попадают в тренировки ни у кого.
После переноса: python3 tools/import_lab.py && python3 tools/build_content.py --strict

Запуск: python3 tools/apply_reviews.py путь/к/hockey-iq-reviews-ГГГГ-ММ-ДД.json [--dry-run]
"""
import json, os, re, sys, glob, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DECKS = os.path.join(ROOT, 'tools', 'source', 'decks')
NOTES = os.path.join(ROOT, 'tools', 'source', 'lab', 'lab-notes.json')
STATUSES = {'draft', 'reviewed', 'needs-fix'}


def indent_of(text):
    m = re.search(r'^[\[{]\n( +)', text)
    return len(m.group(1)) if m else 1


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry-run' in sys.argv
    if not args:
        print(__doc__); sys.exit(1)
    data = json.load(open(args[0], encoding='utf-8'))
    reviews = data.get('reviews', data)
    stamp = datetime.date.today().isoformat()
    done, missing = [], set(reviews)

    def apply(target, r):
        st = r.get('status', 'draft')
        if st not in STATUSES: raise SystemExit(f'неизвестный статус {st}')
        target['status'] = st
        target['review'] = {'verdict': r.get('verdict'), 'note': r.get('note', ''), 'applied': stamp}

    for path in sorted(glob.glob(os.path.join(DECKS, '*.json'))):
        if path.endswith('lab.json'): continue  # LAB собирается из lab-notes
        text = open(path, encoding='utf-8').read()
        cards = json.loads(text)
        changed = False
        for c in cards:
            r = reviews.get(c['id'])
            if r:
                apply(c, r); changed = True; missing.discard(c['id']); done.append((c['id'], r.get('status'), r.get('note', '')))
        if changed and not dry:
            open(path, 'w', encoding='utf-8').write(json.dumps(cards, ensure_ascii=False, indent=indent_of(text)) + ('\n' if text.endswith('\n') else ''))

    ntext = open(NOTES, encoding='utf-8').read()
    notes = json.loads(ntext)
    nch = False
    for cid in list(missing):
        if cid.startswith('lab-') and cid in notes:
            apply(notes[cid], reviews[cid]); nch = True; missing.discard(cid); done.append((cid, reviews[cid].get('status'), reviews[cid].get('note', '')))
    if nch and not dry:
        open(NOTES, 'w', encoding='utf-8').write(json.dumps(notes, ensure_ascii=False, indent=indent_of(ntext)) + ('\n' if ntext.endswith('\n') else ''))

    for cid, st, note in done: print(f'  {cid}: {st}' + (f' — {note}' if note else ''))
    for cid in sorted(missing): print(f'  не найдена карточка {cid}')
    print(f'{"Проверка (без записи)" if dry else "Перенесено"}: {len(done)}. Дальше: python3 tools/import_lab.py && python3 tools/build_content.py --strict')


if __name__ == '__main__':
    main()
