# Your task

You are marking lone titles (רב, רבי, ר', מר) in Hebrew and Aramaic passages. This is careful reading work. Read each
passage yourself. Do NOT write a script, regex or heuristic to label them, and do not call any API.

You were given a batch number NNN (three digits). Everything is in this folder.

1. Read `HOW-TO-MARK.md` first and follow it exactly.
2. Read `batch-NNN.txt`. Each line is `number<TAB>passage`; the word to judge is wrapped in ⟦ ⟧. There are up to 400 lines.
   Read it in chunks of 100 lines (Read with offset and limit) so nothing is skipped.
3. For every line decide: kind (alone, cut, master or word), sure (true/false), and for `cut` the full name.
4. Write your answers to `labels-NNN.jsonl`, one JSON object per line, exactly:
   {"n":"000","kind":"cut","name":"רבי ראובן","sure":true}
   {"n":"001","kind":"alone","sure":true}
   Write the first 100, then append the rest as you go (for example with a Bash heredoc `cat >> file`), so work is saved.
   Every number in the batch must appear exactly once.

Do not open any `map-*.json` file, or any file besides this one, the guide and your batch.

When done, reply with one line: how many lines you labelled, and how many you marked sure=false.
