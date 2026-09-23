"""Render the checked examples and the revised relationship plan."""
from pathlib import Path
from html import escape
import json

PLAN = Path(__file__).resolve().parent
DATA_PATH = PLAN.parent / 'data/checkpoint/ontology-review-data.json'
DATA = json.loads(DATA_PATH.read_text())
esc = lambda x: escape(str(x), quote=True)
CASES = {c['id']: c for c in DATA['cases']}

LESSONS = [
    ('imma-shalom', 'Keep the person between the names.', 'Imma Shalom is Eliezer’s wife and Gamliel’s sister. The old pair keeps the two men and loses her. Save her two family claims.'),
    ('reversed-conversation', 'An alternate version can reverse the roles.', 'Menachot gives Hisda speaking to Hamnuna, or Hamnuna speaking to Hisda. Keep two complete versions of the exchange.'),
    ('woman-or-tractate', 'An alternate reading can change the kind of thing.', 'In Eruvin, one expression is read as a woman or as a tractate. Do not create an unconditional wife or marriage edge.'),
    ('question-withdrawn', 'A question is not the conclusion.', 'Bava Batra asks whether Rava disagrees with Hanina, then answers the question across the page break. Keep that change in the discussion.'),
    ('editorial-negation', 'A small editorial mark can change the ruling.', 'Sanhedrin prints “not” in parentheses. The English translation reads the ruling positively. Keep the marked Hebrew and the named interpretations.'),
    ('changing-teachers', 'A relationship can change over time.', 'Yose bar Avin leaves one teacher’s circle and comes before Rav Ashi. The next page helps identify the speaker. Keep the order and the full episode.'),
    ('hanan-grandson', 'Family words need context.', 'Hanan is described through his mother. Children call him “father.” That address does not make them his children.'),
    ('disciple-colleague', 'One phrase can support several claims.', 'Yirmeya bar Abba is described as a disciple-colleague and also speaks to Rav. Save the teaching role and the dialogue.'),
]
for cid, _, _ in LESSONS:
    assert cid in CASES

def source_link(c):
    work, address = c['ref'].rsplit(' ', 1)
    return 'https://www.sefaria.org/' + work.replace(' ', '_') + '.' + address.replace(':', '.')

def case_html(c):
    pairs = c['saved_pairs']
    labels = ', '.join(f"{p['a']} / {p['b']}: {p['kind'] or 'open'}" for p in pairs)
    label_html = esc(labels) if labels else 'No saved pair row in the selected passage or passages.'
    claim_rows = []
    for claim in c['claims']:
        qualifier = claim['branch'] or claim['status']
        claim_rows.append(
            '<div class="claim"><div class="claim-reading">'
            + f"<strong>{esc(claim['subject'])}</strong> <span>{esc(claim['relation'])} →</span> <strong>{esc(claim['object'])}</strong>"
            + f'<small>{esc(qualifier)}</small></div><blockquote class="hebrew" lang="he" dir="rtl">{esc(claim["quote"])}</blockquote></div>'
        )
    genre = c['genre']
    genre_label = genre.get('suggestion', genre.get('tag', 'unknown'))
    fixes = ' '.join(c['fixes'])
    uncertainty = ''.join(f'<li>{esc(x)}</li>' for x in c['uncertainty'])
    review_notes = ''.join(f'<li>{esc(x)}</li>' for x in c.get('review_notes', []))
    review_sources = ' · '.join(f'<a href="{esc(s["url"])}" target="_blank" rel="noopener">{esc(s["title"])} ↗</a>' for s in c.get('review_sources', []))
    review_html = f'<div class="uncertain"><strong>What the second reading corrected</strong><ul>{review_notes}</ul><p>{review_sources}</p></div>' if review_notes else ''
    editions = sorted({s.get('edition', s.get('hebrew_edition', 'edition not recorded')) for s in c['sources']})
    refs = ' · '.join(esc(s['ref']) for s in c['sources'])
    search_text = ' '.join([c['ref'], c['title'], fixes, *c['focus'], *(q['quote'] for q in c['claims'])])
    return f'''<details class="case" id="{esc(c['id'])}" data-search="{esc(search_text.lower())}">
<summary><span class="ref">{esc(c['ref'])}</span><strong>{esc(c['title'])}</strong></summary>
<div class="case-body"><p class="lesson">{esc(fixes)}</p>
<div class="meta">Proposed episode tag: {esc(genre_label)} · {len(c['sources'])} source segment(s) · {len(pairs)} saved pair row(s)</div>
<p class="saved"><strong>Saved labels:</strong> {label_html}</p>
<h3>Claims this reading would keep</h3>{''.join(claim_rows)}
<div class="uncertain"><strong>What stays open</strong><ul>{uncertainty}</ul></div>
{review_html}
<p class="meta">Read: {refs}. Edition(s): {esc('; '.join(editions))}.</p>
<a href="{esc(source_link(c))}" target="_blank" rel="noopener">Read source on Sefaria ↗</a>
</div></details>'''

css = (PLAN / 'relationship-ontology.css').read_text()

lesson_html = ''.join('<li><strong>' + esc(title) + '</strong><p>' + esc(text) + '</p><a class="tag" href="#' + cid + '">' + esc(CASES[cid]['ref']) + ' · see the reading</a></li>' for cid, title, text in LESSONS)
case_list = ''.join(case_html(c) for c in DATA['cases'])
counts = DATA['current_pair_table']
max_count = max(counts['labels'].values())
label_rows = ''.join(f'<tr><td>{esc(k)}<svg class="bar-chart" viewBox="0 0 300 6" aria-hidden="true"><rect width="{v/max_count*300:.3f}" height="6" fill="var(--green)"/></svg></td><td class="num">{v:,}</td></tr>' for k,v in counts['labels'].items())
crosscheck_rows = ''.join(f'<tr><td>{esc(c["ref"])}</td><td>{esc(c["correction"])}</td></tr>' for c in DATA.get('earlier_case_check', {}).get('cases', []))
assert DATA['new_case_count'] == 30 and DATA['primary_segment_count'] == 82
imma = CASES['imma-shalom']
family_quote = 'אימא שלום, דביתהו דרבי אליעזר, אחתיה דרבן גמליאל הואי.'
assert family_quote in imma['sources'][0]['hebrew']

page = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; img-src data:">
<title>Sage graph plan</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@500;600&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet"><style>@@CSS@@</style></head><body><main class="wrap">
<header><div class="topline"><span class="eyebrow">Sage graph study · 22 September 2026</span><button type="button" class="btn" id="theme" aria-label="Switch theme">Light / dark</button></div>
<h1>Keep every claim before deciding who is who.</h1>
<p>The new examples show what the next reader needs to save: people hidden inside descriptions, the roles they play, and the readings that remain open. Evidence packs then explain each proposed graph link.</p>
<nav aria-label="On this page"><a href="#example">One real example</a><a href="#changes">What changed</a><a href="#vocabulary">The relation types</a><a href="#packs">Evidence packs</a><a href="#cases">The new cases</a><a href="#next">The updated plan</a></nav></header>

<section id="example"><span class="eyebrow">Start with the text</span><h2>Imma Shalom is the person the old pair loses.</h2>
<blockquote class="source-quote" lang="he" dir="rtl">@@FAMILY_QUOTE@@<small dir="ltr">Bava Metzia 59b:10 · <a href="https://www.sefaria.org/Bava_Metzia.59b.10" target="_blank" rel="noopener">Read source ↗</a></small></blockquote>
<div class="compare">
<div class="panel"><div class="label">The saved pair</div>
<svg class="diagram" viewBox="0 0 420 250" role="img" aria-label="The saved pair connects Rabbi Eliezer and Rabban Gamliel with a generic family label.">
<path class="old-edge" d="M115 102 H305"/><rect class="node" x="23" y="68" width="164" height="62" rx="6"/><rect class="node" x="233" y="68" width="164" height="62" rx="6"/>
<text x="105" y="104" text-anchor="middle">Rabbi Eliezer</text><text x="315" y="104" text-anchor="middle">Rabban Gamliel</text><text class="sub" x="210" y="58" text-anchor="middle">family</text><text class="sub" x="210" y="181" text-anchor="middle">The woman connecting them is missing.</text></svg></div>
<div class="panel"><div class="label">What the passage states</div>
<svg class="diagram" viewBox="0 0 420 250" role="img" aria-label="Imma Shalom is described as the wife of Rabbi Eliezer and sister of Rabban Gamliel.">
<path class="edge" d="M210 87 V108 H100 V133 M100 158 V170 M210 108 H320 V133 M320 158 V170"/><rect class="node" x="130" y="28" width="160" height="58" rx="6"/><rect class="node" x="16" y="170" width="170" height="57" rx="6"/><rect class="node" x="234" y="170" width="170" height="57" rx="6"/>
<text x="210" y="62" text-anchor="middle">Imma Shalom</text><text class="verb" x="100" y="151" text-anchor="middle">wife of</text><text class="verb" x="320" y="151" text-anchor="middle">sister of</text><text x="101" y="205" text-anchor="middle">Rabbi Eliezer</text><text x="319" y="205" text-anchor="middle">Rabban Gamliel</text></svg></div></div>
<p>Keep her as a person mention and save both family claims. A later link between the two men can cite those claims. It must not count as fresh evidence.</p>
<div class="count-strip"><div><span class="count">@@NEW_CASES@@</span><span>additional cases read</span></div><div><span class="count">@@SEGMENTS@@</span><span>primary text segments covered</span></div><div><span class="count">@@OLD_CHECKS@@</span><span>earlier cases checked again</span></div></div>
<p>These cases were chosen to find failures. They do not measure the error rate of the whole study. The proposed readings still need human review before becoming a reference set.</p></section>

<section id="changes"><span class="eyebrow">What the examples changed</span><h2>The reader needs more than names and arrows.</h2><ol class="ruled">@@LESSONS@@</ol>
<div class="callout warn"><strong>The Yerushalmi case stays open.</strong><p>Guggenheimer identifies an earlier Rabbi Yirmeya. Ohr LaYesharim identifies a later one and changes the chain breaks. Our earlier date-based objection was too strong. Both the chain and the person identity must be reviewed together.</p><p><a href="https://www.sefaria.org/Jerusalem_Talmud_Berakhot.1.5.14?lang=bi" target="_blank" rel="noopener">Translation and footnote 256 ↗</a> · <a href="https://www.sefaria.org/Ohr_LaYesharim_on_Jerusalem_Talmud_Berakhot.1.5.14" target="_blank" rel="noopener">Ohr LaYesharim ↗</a></p></div></section>

<section id="vocabulary"><span class="eyebrow">The starting vocabulary</span><h2>Use a few families of relations, with precise roles.</h2>
<div class="scroll vocab"><table><thead><tr><th>Kind</th><th>What to save</th><th>What the example teaches us</th></tr></thead><tbody>
<tr><td>Family</td><td>Child, spouse, sibling, specific in-law or family path</td><td>Hanan is a child of Honi’s daughter. The unnamed mother matters.</td></tr>
<tr><td>Transmission</td><td>Reports in the name of; heard from; attributes to</td><td>Reporting a teaching does not by itself prove direct hearing.</td></tr>
<tr><td>Teaching</td><td>Student or teacher role, subtype and time</td><td>A disciple-colleague has a more specific role than “junior.”</td></tr>
<tr><td>Speech</td><td>Speaker, addressee, question, reply, objection</td><td>A question can address one person while discussing another’s teaching.</td></tr>
<tr><td>Views</td><td>A view held, explained, supported or opposed</td><td>A suggestion of disagreement may be answered and withdrawn.</td></tr>
<tr><td>Scenes</td><td>Event, participants, roles and exact action</td><td>A visit can contain a question, a reply and a healing action.</td></tr>
<tr><td>Time</td><td>What happened before, after or during what</td><td>Keep changes of teacher distinct from the date our source was fetched.</td></tr>
</tbody></table></div>
<p>A rare action can stay as an event with its original verb and supported roles. Add a new standard relation only when repeated examples call for it.</p>
<details class="support"><summary>Direction, identity and story tags</summary>
<p>Store each claim once. Show “father of” as the inverse of “child of.” A symmetric link such as spouse or sibling also needs only one record.</p>
<p>A mention is a phrase in one source. A local participant joins that episode’s names and pronouns. A historical person is a later identity decision. These three must not collapse into one record.</p>
<p>Give an episode a <strong>halachic, aggadic, mixed or unknown</strong> tag. Also keep whether it is a teaching chain, legal argument, ordinary story, dream or another form. Genre may help assess history after we test it; it does not prove a meeting.</p>
</details></section>

<section id="packs"><span class="eyebrow">What an evidence pack does</span><h2>Keep both routes and explain the decision.</h2>
<p>In Arakhin 13b:4, one report names Rav Huna directly. Another names Rav Zavdi transmitting from Rav Huna. Both credit the teaching to Rav Huna.</p>
<div class="branches"><div class="panel"><h3>Short report</h3><p>Rav Huna <span class="arrow">→ states →</span> the teaching</p></div><div class="panel"><h3>Longer report</h3><p>Rav Zavdi <span class="arrow">→ reports from →</span> Rav Huna</p></div></div>
<p><strong>These are two reported routes from one passage.</strong> They do not establish two independent witnesses. They also do not prove that only one route could have happened.</p>
<div class="panel pad"><dl>
<div class="record"><dt>Question</dt><dd>Which attribution does this passage give?</dd></div>
<div class="record"><dt>Evidence</dt><dd>The exact Hebrew, its edition, the two report forms and the teaching they share.</dd></div>
<div class="record"><dt>Reading decision</dt><dd>Keep both source-supported report forms. Put Zavdi’s transmission claim in the longer form.</dd></div>
<div class="record"><dt>Historical decision</dt><dd class="status">Not established by this passage alone.</dd></div>
<div class="record"><dt>What stays saved</dt><dd>The alternatives, dependencies, reason, uncertainty and each later revision.</dd></div>
</dl></div>
<p class="meta">Proposed representation of a real passage. This is not a stored historical graph decision. <a href="https://www.sefaria.org/Arakhin.13b.4" target="_blank" rel="noopener">Read the source ↗</a></p>
<details class="support"><summary>What every pack must record</summary><p>Keep supporting and opposing passages, exact source spans, edition differences, unresolved pronouns, shared source dependencies, search gaps and a short reason for the decision. Record the other identity and date decisions it assumes.</p><p>Provisional scores are allowed when clearly labelled. A score about reading the words is different from a score about person identity or historical truth. Do not make compatible edges compete for a total of 100%.</p><p>A changed source or identity decision should flag dependent conclusions for another review. Human corrections must survive reruns.</p></details></section>

<section id="cases"><span class="eyebrow">Read the examples</span><h2>Thirty additional cases are ready to inspect.</h2>
<p>Open a row to see its proposed claims and the Hebrew behind each one. The exact source snapshots, editions and hashes are saved in the <a href="../data/checkpoint/ontology-review-data.json">review data</a>.</p>
<label for="search">Find a passage, name or issue</label><input class="search" id="search" type="search" placeholder="Try: kinship, woman, question, Menachot">
<p class="meta" id="visible-count">30 cases shown</p>
@@CASES@@</section>

<section id="next"><span class="eyebrow">The updated plan</span><h2>Check a small passage reader before the full reread.</h2>
<div class="callout"><strong>Where the study is saved.</strong><p>DuckLake snapshot 3 on R2 holds 273,208 source passages, 57,857 earlier pair readings, these 30 detailed cases, the 42-passage pilot and the close reading of 38 difficult passages. All 29 tables matched when read back. The seven relation families are our accepted starting categories.</p><p>Every snapshot keeps the earlier ones unchanged. Evidence packs and accepted graph decisions come next. <a href="../lake/README.md">How to read and save the shared study</a> · <a href="../followup-v1/report.html">Open the close-reading report</a></p></div>
<ol class="stages">
<li><div><strong>Define the records.</strong><p>Mentions, local participants, claims, branches, packs and decisions need clear meanings. This gives the next reader a place to save each finding.</p></div></li>
<li><div><strong>Make a checked sample.</strong><p>Use these difficult examples and a separate random sample. Include passages with no old pair row so missing people can be found.</p></div></li>
<li><div><strong>Read whole episodes.</strong><p>Keep enough context to resolve pronouns and replies, including across a daf boundary. Save failures and unfinished passages visibly.</p></div></li>
<li><div><strong>Build packs and review decisions.</strong><p>Collect supporting and opposing evidence. Preserve choices that depend on each other. Measure mistakes before accepting links automatically.</p></div></li>
<li><div><strong>Reread the sources at scale.</strong><p>Resume safely, check every saved output, and keep the new run beside the old one.</p></div></li>
<li><div><strong>Resolve people, then add dates and biographies.</strong><p>Keep several candidates where needed. Outside sources become evidence in the pack. Every graph edge should open its sources and decision history.</p></div></li>
</ol>
<p><strong>Next implementation task:</strong> the record contract and a reviewed pilot set. This review updated the plan and reports; it has not rerun the full source collection or populated a new graph.</p>
<p><a href="relationship-ontology.md">Read the complete written plan</a> · <a href="../data/checkpoint/relation-cases-report.html">Open the earlier ten-case report</a></p>
<details class="support"><summary>How this fits the existing systems</summary><p>Talmud and Tanach already share text addresses, anchors, typed artifacts and protection for human corrections. Use those. Add claim, branch, pack and decision records, with a revision history.</p><p>Reuse Prophex’s evidence-pack pattern: sources first, reasons attached, missing evidence visible. Map the meanings to <a href="https://snapdrgn.net/cookbook.html">SNAP:DRGN</a> for ancient person records, <a href="https://www.w3.org/TR/prov-o/">PROV-O</a> for provenance, and <a href="https://cidoc-crm.org/crminf">CRMinf</a> for premises and conclusions. These are proposed mappings, not a claim that conformance is already built.</p></details>
</section>

<section id="checks"><span class="eyebrow">What was checked</span><h2>The review changed the plan, not the accuracy score.</h2>
<div class="scroll"><table><thead><tr><th>Review</th><th>What it found</th><th>What stays open</th></tr></thead><tbody>
<tr><td>12 new argument and attribution cases</td><td>Nested speech, alternatives, unresolved negation and questions later answered</td><td>Editorial signs and the scope of some later replies</td></tr>
<tr><td>18 new story and family cases</td><td>Missing women, compound family paths, changing roles and figurative kinship</td><td>Some pronouns and whether distant passages name the same person</td></tr>
<tr><td>Independent rereading of 3 new cases</td><td>Supported the main fixes; added Yad Ramah evidence and narrower claims</td><td>The marked Hebrew is still preserved; the extra reading does not erase it</td></tr>
<tr><td>6 earlier cases checked again</td><td>Found nested alternatives, missing teacher claims and the two Yirmeya identities</td><td>No new historical identity or event probability was established</td></tr>
</tbody></table></div>
<details class="support"><summary>Corrections to the six earlier examples</summary><div class="scroll"><table><thead><tr><th>Passage</th><th>Correction or qualification</th></tr></thead><tbody>@@CROSSCHECKS@@</tbody></table></div></details>
<details class="support"><summary>The current labels and their counts</summary><p>@@PAIR_ROWS@@ nearby-pair rows use @@PATTERN_COUNT@@ wording patterns. The top 100 patterns cover @@TOP100@@ rows (@@TOP100_PERCENT@@%). The top 500 cover @@TOP500@@ rows (@@TOP500_PERCENT@@%). These are saved labels, not verified relationships.</p><div class="scroll"><table><thead><tr><th>Saved label</th><th class="num">Rows</th></tr></thead><tbody>@@LABEL_ROWS@@</tbody></table></div></details>
<div class="callout"><strong>Source checks passed.</strong><p>The quoted claims were checked against the saved Hebrew, with offsets checked where supplied. The source text hashes match. The new focal cases do not repeat the earlier ten. This verifies the saved evidence, not every proposed interpretation.</p></div>
</section>
<footer class="footer"><p>Sources: local Hebrew snapshots used by the study; Sefaria Hebrew and named translations; the commentaries linked in the case review files. The examples were selected to expose different failures. No prevalence estimate or calibrated historical probability is claimed. The saved review data includes editions, licences, source links and remaining questions.</p></footer>
</main><script>
const root=document.documentElement;
document.getElementById('theme').addEventListener('click',function(){const dark=root.dataset.theme==='dark'||(!root.dataset.theme&&matchMedia('(prefers-color-scheme: dark)').matches);root.dataset.theme=dark?'light':'dark';});
const cases=Array.from(document.querySelectorAll('details.case'));
cases.forEach(function(el){el.addEventListener('toggle',function(){if(el.open&&!root.dataset.printing)cases.forEach(function(other){if(other!==el)other.open=false;});});});
document.getElementById('search').addEventListener('input',function(){const q=this.value.trim().toLowerCase();let n=0;cases.forEach(function(el){const show=!q||el.dataset.search.includes(q);el.hidden=!show;if(show)n++;});document.getElementById('visible-count').textContent=n+' cases shown';});
function revealHash(){const el=document.getElementById(location.hash.slice(1));if(el&&el.matches('details.case')){document.getElementById('search').value='';cases.forEach(function(c){c.hidden=false;});document.getElementById('visible-count').textContent=cases.length+' cases shown';el.open=true;}}
window.addEventListener('hashchange',revealHash);revealHash();
let printState=[];window.addEventListener('beforeprint',function(){root.dataset.printing='true';printState=Array.from(document.querySelectorAll('details')).map(function(el){const state=[el,el.open];el.open=true;return state;});});window.addEventListener('afterprint',function(){printState.forEach(function(pair){pair[0].open=pair[1];});setTimeout(function(){delete root.dataset.printing;},0);});
</script></body></html>'''
values = {'CSS':css, 'FAMILY_QUOTE':esc(family_quote), 'NEW_CASES':DATA['new_case_count'], 'SEGMENTS':DATA['primary_segment_count'], 'OLD_CHECKS':len(DATA.get('earlier_case_check', {}).get('cases', [])), 'LESSONS':lesson_html, 'CASES':case_list, 'CROSSCHECKS':crosscheck_rows, 'LABEL_ROWS':label_rows, 'PAIR_ROWS':f'{counts["rows"]:,}', 'PATTERN_COUNT':f'{counts["distinct_patterns"]:,}', 'TOP100':f'{counts["top_100_rows"]:,}', 'TOP500':f'{counts["top_500_rows"]:,}', 'TOP100_PERCENT':round(counts['top_100_rows']/counts['rows']*100), 'TOP500_PERCENT':round(counts['top_500_rows']/counts['rows']*100)}
for k,v in values.items():
    page=page.replace('@@'+k+'@@',str(v))
assert '@@' not in page
out=PLAN/'relationship-ontology.html'
out.write_text(page)
print(out)
