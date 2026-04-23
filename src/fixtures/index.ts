import avodahZarah2a from './avodah-zarah-2a.json';
import bavaKamma2a from './bava-kamma-2a.json';
import bavaMetzia2a from './bava-metzia-2a.json';
import berakhot2a from './berakhot-2a.json';
import berakhot2b from './berakhot-2b.json';
import berakhot3a from './berakhot-3a.json';
import berakhot55a from './berakhot-55a.json';
import eruvin2a from './eruvin-2a.json';
import eruvin2b from './eruvin-2b.json';
import ketubot2a from './ketubot-2a.json';
import kiddushin2a from './kiddushin-2a.json';
import menachot2a from './menachot-2a.json';
import pesachim2a from './pesachim-2a.json';
import sanhedrin2a from './sanhedrin-2a.json';
import shabbat2a from './shabbat-2a.json';
import sukkah2a from './sukkah-2a.json';
import yevamot2a from './yevamot-2a.json';
import type { TalmudPageData } from '../lib/sefref';

type Amud = 'a' | 'b';

export interface Fixture {
  id: string;
  label: string;
  hint: string;
  tractate: string;
  page: string;
  amud: Amud;
  hebrewBooksUrl: string;
  data: TalmudPageData;
}

const hb = (mesechta: number, daf: string) =>
  `https://hebrewbooks.org/shas.aspx?mesechta=${mesechta}&daf=${daf}&format=pdf`;

export const fixtures: Fixture[] = [
  // === Common shapes (stairs, double-extend) ===
  { id: 'berakhot-2a', label: 'Berakhot 2a',    hint: 'Double-Wrap · big first word',
    tractate: 'Berakhot', page: '2a', amud: 'a', hebrewBooksUrl: hb(1, '2'),
    data: berakhot2a as TalmudPageData },

  { id: 'berakhot-2b', label: 'Berakhot 2b',    hint: 'balanced',
    tractate: 'Berakhot', page: '2b', amud: 'b', hebrewBooksUrl: hb(1, '2b'),
    data: berakhot2b as TalmudPageData },

  { id: 'berakhot-3a', label: 'Berakhot 3a',    hint: 'balanced',
    tractate: 'Berakhot', page: '3a', amud: 'a', hebrewBooksUrl: hb(1, '3'),
    data: berakhot3a as TalmudPageData },

  { id: 'pesachim-2a', label: 'Pesachim 2a',    hint: 'Double-Wrap',
    tractate: 'Pesachim', page: '2a', amud: 'a', hebrewBooksUrl: hb(4, '2'),
    data: pesachim2a as TalmudPageData },

  { id: 'ketubot-2a', label: 'Ketubot 2a',      hint: 'Double-Wrap · long Tosafot',
    tractate: 'Ketubot', page: '2a', amud: 'a', hebrewBooksUrl: hb(15, '2'),
    data: ketubot2a as TalmudPageData },

  { id: 'eruvin-2a', label: 'Eruvin 2a',        hint: 'Double-Wrap',
    tractate: 'Eruvin', page: '2a', amud: 'a', hebrewBooksUrl: hb(3, '2'),
    data: eruvin2a as TalmudPageData },

  { id: 'sukkah-2a', label: 'Sukkah 2a',        hint: 'Double-Wrap',
    tractate: 'Sukkah', page: '2a', amud: 'a', hebrewBooksUrl: hb(7, '2'),
    data: sukkah2a as TalmudPageData },

  { id: 'sanhedrin-2a', label: 'Sanhedrin 2a',  hint: 'Stairs · long Rashi',
    tractate: 'Sanhedrin', page: '2a', amud: 'a', hebrewBooksUrl: hb(24, '2'),
    data: sanhedrin2a as TalmudPageData },

  { id: 'kiddushin-2a', label: 'Kiddushin 2a',  hint: 'long Tosafot',
    tractate: 'Kiddushin', page: '2a', amud: 'a', hebrewBooksUrl: hb(20, '2'),
    data: kiddushin2a as TalmudPageData },

  { id: 'bava-kamma-2a', label: 'Bava Kamma 2a', hint: 'Double-Wrap',
    tractate: 'Bava Kamma', page: '2a', amud: 'a', hebrewBooksUrl: hb(21, '2'),
    data: bavaKamma2a as TalmudPageData },

  { id: 'bava-metzia-2a', label: 'Bava Metzia 2a', hint: 'balanced',
    tractate: 'Bava Metzia', page: '2a', amud: 'a', hebrewBooksUrl: hb(22, '2'),
    data: bavaMetzia2a as TalmudPageData },

  { id: 'avodah-zarah-2a', label: 'Avodah Zarah 2a', hint: 'Double-Wrap · long Tosafot',
    tractate: 'Avodah Zarah', page: '2a', amud: 'a', hebrewBooksUrl: hb(27, '2'),
    data: avodahZarah2a as TalmudPageData },

  { id: 'menachot-2a', label: 'Menachot 2a',    hint: 'long Tosafot',
    tractate: 'Menachot', page: '2a', amud: 'a', hebrewBooksUrl: hb(30, '2'),
    data: menachot2a as TalmudPageData },

  // === Extreme Double-Wrap ===
  { id: 'shabbat-2a', label: 'Shabbat 2a',      hint: 'Extreme Double-Wrap · tiny main, huge Tosafot',
    tractate: 'Shabbat', page: '2a', amud: 'a', hebrewBooksUrl: hb(2, '2'),
    data: shabbat2a as TalmudPageData },

  // === Edge cases: short commentary triggering exception ===
  { id: 'yevamot-2a', label: 'Yevamot 2a',      hint: 'Exception=1 candidate · Rashi only 178 chars',
    tractate: 'Yevamot', page: '2a', amud: 'a', hebrewBooksUrl: hb(14, '2'),
    data: yevamot2a as TalmudPageData },

  { id: 'berakhot-55a', label: 'Berakhot 55a',  hint: 'Exception=2 candidate · Tosafot only 184 chars',
    tractate: 'Berakhot', page: '55a', amud: 'a', hebrewBooksUrl: hb(1, '109'),
    data: berakhot55a as TalmudPageData },

  { id: 'eruvin-2b', label: 'Eruvin 2b',        hint: 'Double-exception · both short (Rashi 75, Tosafot 199)',
    tractate: 'Eruvin', page: '2b', amud: 'b', hebrewBooksUrl: hb(3, '2b'),
    data: eruvin2b as TalmudPageData },
];

export const fixtureById = Object.fromEntries(fixtures.map((f) => [f.id, f]));
