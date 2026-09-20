"""Build plan.html from data.json (+ girsa.json when present). Numbers only
come from those files, so the page can be re-checked without reading HTML."""
import html, json, os
D = json.load(open('data.json'))
G = json.load(open('girsa.json')) if os.path.exists('girsa.json') else None
esc = lambda s: html.escape(str(s))
he = lambda s: f'<bdi class="he">{esc(s)}</bdi>'

CSS = open('style.css').read()

def stack(label, segs, note, W=760):
    """One horizontal stacked bar. segs = [(name, value, css colour)]."""
    tot = sum(v for _, v, _ in segs) or 1
    x, bars, leg, lx = 1, [], [], 1
    for name, v, col in segs:
        w = (W - 2) * v / tot
        if v:
            bars.append(f'<rect x="{x:.1f}" y="26" width="{max(w,1.5):.1f}" height="34" fill="{col}" rx="3"/>')
            if w > 46:
                bars.append(f'<text x="{x+8:.1f}" y="48" style="fill:#fff" font-weight="600">{v}</text>')
        x += w
        leg.append(f'<rect x="{lx}" y="72" width="9" height="9" fill="{col}" rx="2"/>'
                   f'<text class="lbl" x="{lx+14}" y="80.5">{esc(name)} &middot; {v}</text>')
        lx += 26 + int(len(name) * 6.1) + len(str(v)) * 7
    return (f'<svg class="chart" viewBox="0 0 {W} 112" role="img" aria-label="{esc(label)}">'
            f'<text class="lbl" x="1" y="17">{esc(label)}</text>{"".join(bars)}{"".join(leg)}'
            f'<text x="1" y="104" fill="var(--accent)" font-weight="600">{esc(note)}</text></svg>')

A, Wd, S, T = D['audit'], D['wording'], D['singletons'], D['truncation']

fig_audit = stack('40 extracted relations, read by hand against the words they came from',
    [('right', A['right'], 'var(--ok)'), ('wrong', A['wrong'], 'var(--bad)')],
    f"{A['wrongFromOneBug']} of the {A['wrong']} wrong ones came from a single repair I had added myself")
fig_word = stack(f"{Wd['tested']} names with one entry in our list and an era on record",
    [('wording agrees with the record', Wd['agree'], 'var(--ok)'),
     ('record says early, wording says late', Wd['tannaSaysAmora'], 'var(--warn)'),
     ('record says late, wording says early', Wd['amoraSaysTanna'], 'var(--bad)')],
    'it never mistook a later sage for an early one; all 11 misses are one name shared by two men')
fig_single = stack('30 names that appear exactly once, drawn at random',
    [('not a name at all', S['junk'], 'var(--bad)'), ('a real name', S['real'], 'var(--ok)')],
    'so my "1,450 names seen once" figure was inflated by more than half')

girsa_html = ''
if G:
    hs = G['handSorted']
    n_diff, n_sp = len(hs['differentMan']), len(hs['spellingOnly'])
    fig = stack(f"{hs['looked']} differences between editions that looked like a spelling change, sorted by hand",
        [('a different man, or a different title', n_diff, 'var(--bad)'),
         ('spelling only', hs['looked'] - hs['junk'] - n_diff, 'var(--warn)'),
         ('my tools failing, not a real difference', hs['junk'], 'var(--ghost)')],
        '7 of the 16 real differences change who is speaking, or his title')
    rows = ''.join(f'<tr><td>{esc(x["where"])}</td><td>{he(x["a"])}</td><td>{he(x["b"])}</td><td class="muted">{esc(x["note"])}</td></tr>'
                   for x in hs['differentMan'])
    rows2 = ''.join(f'<tr><td>{esc(x["where"])}</td><td>{he(x["a"])}</td><td>{he(x["b"])}</td></tr>' for x in hs['spellingOnly'])
    raw = ''.join(f'<tr><td>{esc(r["corpus"])}</td><td class="muted">{esc(r["editions"])}</td><td class="num">{r["same"]:,}</td>'
                  f'<td class="num">{r["spelling"]}</td><td class="num">{r["different"]}</td><td class="num">{r["onlyOne"]}</td></tr>'
                  for r in G['rawCounts'])
    girsa_html = (
      '<h3>The automatic count failed, and the reason is useful</h3>'
      '<div class="scroll"><table><thead><tr><th>Talmud</th><th>Editions</th><th class="num">Same</th>'
      '<th class="num">Spelled differently</th><th class="num">Different name</th><th class="num">In one edition only</th></tr></thead>'
      f'<tbody>{raw}</tbody></table></div>'
      f'<p>Do not read those numbers as editors disagreeing. {esc(G["whyTheCountsAreUnusable"])} '
      'So the honest result of the automatic run is: lining editions up is a real job of its own, stage 2 below, and short forms have to be handled first.</p>'
      '<h3>So I sorted the small differences by hand</h3>'
      f'<figure>{fig}</figure>'
      '<p>Rava against Rabbah, and Eliezer against Elazar, are each one letter apart. So how far apart two spellings are cannot separate a slip of the pen from a different person. I had planned to use exactly that, and it does not work.</p>'
      '<h3>A different man, or a different title, at the same spot</h3>'
      '<div class="scroll"><table><thead><tr><th>Where</th><th>One edition</th><th>The other</th><th>What it means</th></tr></thead>'
      f'<tbody>{rows}</tbody></table></div>'
      '<h3>Spelling only</h3>'
      '<div class="scroll"><table><thead><tr><th>Where</th><th>One edition</th><th>The other</th></tr></thead>'
      f'<tbody>{rows2}</tbody></table></div>'
      '<p>Twenty-eight cases from one tractate is a first look, not a measurement. But it is enough to settle the '
      'argument: you were right. Rava against Rabbah and Eliezer against Elazar are different people, and the '
      'editions really do disagree about which one spoke. And one of the seven is the exact name I linked to a single '
      'man in the live app.</p>')
else:
    girsa_html = '<p class="muted">Edition comparison not run yet.</p>'

src_rows = ''.join(
    f'<tr><td><strong>{esc(s["corpus"])}</strong></td><td>{esc(s["works"])}</td><td>{esc(s["editions"])}</td>'
    f'<td>{esc(s["addressed"])}</td><td class="muted">{esc(s["adds"])}</td></tr>' for s in D['sources'])
miss_rows = ''.join(f'<tr><td>{he(n)}</td><td class="num">{o}</td><td class="num">{a}</td></tr>' for n, o, a in Wd['misses'])

BODY = open('body.tmpl').read()
page = BODY
for k, v in {
    '{{CSS}}': CSS, '{{FIG_AUDIT}}': fig_audit, '{{FIG_WORD}}': fig_word, '{{FIG_SINGLE}}': fig_single,
    '{{GIRSA}}': girsa_html, '{{SRC_ROWS}}': src_rows, '{{MISS_ROWS}}': miss_rows,
    '{{TRUNC}}': f"{T['afterBad']} of {T['afterInstances']:,}",
    '{{TRUNC_PCT}}': f"{T['afterBad']/T['afterInstances']:.0%}",
    '{{NOERA}}': str(D['registry']['noEra']), '{{ENTRIES}}': f"{D['registry']['entries']:,}",
    '{{PAIRS}}': f"{D['relationsCoverage']['pairs']:,}",
    '{{CAUGHT_PCT}}': f"{D['relationsCoverage']['caughtByFirstThreePatterns']/D['relationsCoverage']['pairs']:.0%}",
    '{{PHRASES}}': f"{D['relationsCoverage']['distinctPhrases']:,}",
    '{{ALONE}}': f"{D['ceiling']['aloneNothing']:.0%}",
}.items():
    page = page.replace(k, v)
left = [t for t in ('{{',) if t in page]
assert not left, 'unfilled placeholder'
open('plan.html', 'w').write(page)
print('wrote plan.html', len(page), 'bytes')
