"""Which texts this study reads, and why each one is in.

Hebrew and Aramaic only. No translation is used at any point, because a
translator has already resolved the ambiguities this study measures.

Works are listed by Sefaria category and discovered from Sefaria's own index
(01_fetch.py), so a tractate cannot be left out by a typo in a hand-typed list.
Editions are likewise discovered per work: every Hebrew edition Sefaria holds
is taken, because a second edition of the same passage shows where editors
disagreed about who was meant.
"""

# (corpus label, Sefaria category path, title filter, why it is here)
CORPORA = [
    ('mishnah', ['Mishnah'], None,
     'The early teachers, by definition: anyone named here is from the Mishnah period. '
     'One edition follows the Kaufmann manuscript, a truly separate witness.'),
    ('tosefta', ['Tosefta'], None,
     'More early teachers, many of them absent from the Mishnah.'),
    ('midrash-halakhah', ['Midrash', 'Halakhah'], None,
     'Early teachers arguing from verses; fixes the early end of the order.'),
    ('bavli', ['Talmud', 'Bavli'], None,
     'The main body: Babylonian sages, and Land of Israel sages as Babylonia heard them.'),
    ('yerushalmi', ['Talmud', 'Yerushalmi'], None,
     'Land of Israel sages in their own spelling, and people who appear nowhere else.'),
    ('midrash-aggadah', ['Midrash', 'Aggadah'], None,
     'Story and sermon; many Land of Israel sages who are thin in the Bavli.'),
    ('minor-tractates', ['Talmud', 'Bavli', 'Minor Tractates'], None,
     'Avot deRabbi Natan, Semachot, Soferim and the rest: more early teachers, in their own setting.'),
]

# Sub-categories that are commentary on a corpus rather than the corpus itself.
SKIP_CATEGORIES = {
    'Commentary', 'Rishonim on Talmud', 'Acharonim on Talmud', 'Modern Commentary on Talmud',
    'Rishonim on Mishnah', 'Acharonim on Mishnah', 'Modern Commentary on Mishnah',
    'Guides',
}

# A title is commentary or apparatus, not the work itself.
COMMENTARY_TITLE = (' on ', 'Haggahot', "Gra's", 'footnotes', 'Notes and Corrections', 'Kisse Rahamim',
                    'Nachalat Yaakov', 'Binyan Yehoshua', 'Rishon LeTzion', 'New Nuschah', 'Mesorat HaShas')

# Left out on purpose. Each of these would corrupt the counts rather than add to
# them, and the reason is recorded so the choice can be argued with.
EXCLUDE = {
    'Legends of the Jews': 'a twentieth-century retelling, in English',
    'Ein Yaakov': "an anthology of the Talmud's own stories; every passage would be counted twice",
    'Ein Yaakov (Glick Edition)': "an anthology of the Talmud's own stories; every passage would be counted twice",
    'Yalkut Shimoni on Torah': 'a medieval anthology of earlier midrash; counts its sources twice',
    'Yalkut Shimoni on Nach': 'a medieval anthology of earlier midrash; counts its sources twice',
    'Otzar Midrashim': 'a modern anthology',
    'Midrash Yelamdenu, Selections from Yalkut Talmud Torah': 'selections lifted from an anthology',
    'Midrash Lekach Tov': 'an eleventh-century work that reworks earlier sources',
    'Midrash Sekhel Tov': 'a twelfth-century work that reworks earlier sources',
    'Bereshit Rabbati': 'an eleventh-century work that reworks earlier sources',
    'Midrash Aggadah': 'a medieval compilation',
    'Sefer HaYashar (midrash)': 'a medieval narrative, not rabbinic-period material',
}

# Late, but kept: they name sages and are not anthologies. Marked so any result
# can be recomputed without them.
LATE = {'Shemot Rabbah', 'Bamidbar Rabbah', 'Devarim Rabbah', 'Pirkei DeRabbi Eliezer', 'Pesikta Rabbati',
        'Midrash Tehillim', 'Midrash Mishlei', 'Midrash Shmuel', 'Tanna DeBei Eliyahu Rabbah',
        'Tanna DeBei Eliyahu Zuta', 'Seder Olam Zutta', 'Aggadat Bereshit'}

# The Tosefta appears as two works per tractate: the Vilna text and Lieberman's
# edition. They are two witnesses of one work.
WITNESS_SUFFIX = ' (Lieberman)'


# Real works whose titles merely look like commentary ("X on Y").
KEEP = {'Midrash Tannaim on Deuteronomy', 'Sifrei Aggadah on Esther'}


def wanted(title):
    if title in KEEP:
        return True
    if title in EXCLUDE or any(title.startswith(k + ' on ') for k in ('Midrash Lekach Tov',)):
        return False
    return not any(k in title for k in COMMENTARY_TITLE)

