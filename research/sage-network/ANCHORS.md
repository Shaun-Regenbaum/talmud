# The fixed points for dating

The text gives an order: who passes on whose teaching. To turn an order into
eras, a few names have to be pinned by hand, and everyone else is placed
relative to them. These are the pins, and the rule that chose them.

## The rule

**An anchor has to be a string that names one man.** Fame is not enough. The
most famous names in the Talmud are the worst anchors, because they are the
ones several men share, or that editions swap.

So a name is an anchor only if all four hold:

1. The string on the page points at one person, without needing context.
2. It is frequent enough to tie many others to it.
3. Nobody disputes when he lived.
4. Between them, the anchors cover both timelines and every generation.

## The anchors

| Timeline | Name as printed | Era code | Why he qualifies |
|---|---|---|---|
| Early teachers | הלל | zugim | One string, the start of the chain |
| | רבן יוחנן בן זכאי | tanna-1 | The full name is unique |
| | רבי עקיבא | tanna-2 | Unique string, very frequent |
| | רבי מאיר | tanna-4 | Unique string, very frequent |
| Babylonia | שמואל | amora-bavel-1 | Over 2,000 mentions; the prophet of the same name appears in verses, which the typing stage separates |
| | רב יהודה | amora-bavel-2 | In practice one man; tied to Shmuel 446 times |
| | אביי | amora-bavel-4 | Unique string, about 2,500 mentions |
| | רב פפא | amora-bavel-5 | Unique string |
| | רב אשי | amora-bavel-6 | Unique string |
| | מר בר רב אשי | amora-bavel-7 | Unique string |
| Land of Israel | רבי יוחנן | amora-ey-1 | Bare, it is one man; his namesakes carry a father's name |
| | ריש לקיש | amora-ey-1 | Unique string |
| | רבי אבהו | amora-ey-3 | Unique string |
| | רבי יונה | amora-ey-4 | Unique string; carries the Yerushalmi's later layers |

## Deliberately not anchors

| Name | Why not |
|---|---|
| רב, רבי | As strings they are also ordinary words ("much", a title). Each mention has to be typed first. |
| רבא, רבה | Rava and Rabbah are a generation apart and one letter apart. Two editions of Berakhot swap them at the same spot, in both Talmuds. |
| רבי אליעזר, רבי אלעזר | One letter apart; editions disagree on which is meant. |
| רבי יצחק, רבי אושעיא, רבי יונתן, רבי חייא | Each is shared by an early and a late man. Measured: our list says early teacher, yet the Bavli uses the later wording for רבי יצחק 265 times against 20. |
| רבן שמעון בן גמליאל, רבן גמליאל | Two men of each name, grandfather and grandson. |

## Tying the two timelines together

Babylonia and the Land of Israel ran side by side, so each is ordered on its
own. They are joined through the men who travelled between them and are quoted
in both: עולא, רב דימי, רבין, רבי זירא. These are ties, not anchors: they fix
how the two orders line up, not where either one starts.

## What would change this list

If the typing stage shows an anchor string is not one man after all, he comes
off the list. The anchors are inputs, so every dated result is recomputed with
each anchor left out in turn. A result that moves when one anchor is dropped is
reported as resting on that anchor.
