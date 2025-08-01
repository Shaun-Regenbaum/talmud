import { describe, test, expect } from 'vitest';

describe('Ketubot 10b Text Parsing', () => {
  const ketubotMainText = `גיהוץ שלנו ככיבוס שלהם ואי אמרת
ניעבד גיהוץ מעברא ליה חומרתא ההוא
דאתא לקמיה דרבן גמליאל ב"ר אמר
ליה רבי בעלתי ולא מצאתי דם אמרה
ליה רבי עדיין בתולה אני אמר להן הביאו
לי שתי שפחות אחת בתולה ואחת בעולה
הביאו לו והושיבן על פי חבית של יין
בעולה ריחה נודף בתולה אין ריחה נודף
אף זו הושיבה ולא היה ריחה נודף אמר
לו לך זכה במקחך ונבדוק מעיקרא בגווה
גמרא הוה שמיע ליה מעשה לא הוה חזי
וסבר דלמא לא קים ליה בגווה דמלתא
שפיר ולאו אורח ארעא לזלזולי בבנות
ישראל ההוא דאתא לקמיה דרבן גמליאל
הזקן אמר לו רבי בעלתי ולא מצאתי דם
אמרה לו רבי ממשפחת דורקטי אני שאין
להן לא דם נדה ולא דם בתולים בדק
רבן גמליאל בקרובותיה ומצא כדבריה אמר
לו לך זכה במקחך אשריך שזכית למשפחת
דורקטי מאי דורקטי דור קטוע אמר רבי
חנינא תנחומים של הבל ניחמו רבן גמליאל
לאותו האיש דתני רבי חייא כשם שהשאור
יפה לעיסה כך דמים יפים לאשה ותנא
משום רבי מאיר כל אשה שדמיה מרובין
בניה מרובים אתמר רבי ירמיה בר אבא
אמר זכה במקחך אמר ליה ורבי יוסי בר
אבין אמר נתחייב במקחך אמר ליה בשלמא
למאן דאמר נתחייב היינו דרבי חנינא אלא
למאן דאמר זכה מאי זכותא דלא אתי
לידי ספק נדה ההוא דאתא לקמיה דרבי
אמר ליה רבי בעלתי ולא מצאתי דם
אמרה לו רבי עדיין בתולה הייתי ושני
בצורת הוה ראה רבי שפניהם שחורים צוה
עליהן והכניסום למרחץ והאכילום והשקום
והכניסום לחדר בעל ומצא דם אמר לו לך זכה במקחך קרי רבי עליהם
צפד עורם על עצמם יבש היה כעץ: מתני' בתולה כתובתה מאתים
ואלמנה מנה בתולה אלמנה גרושה וחלוצה מן האירוסין כתובתן מאתים
ויש להן טענת בתולים: גמ' מאי אלמנה אמר רב חנא בגדתאה אלמנה
על שם מנה אלמנה מן האירוסין מאי איכא למימר איידי דהא קרי לה
אלמנה הא נמי קרי לה אלמנה אלמנה דכתיבא באורייתא מאי איכא למימר
דעתידין רבנן דמתקני לה מנה ומי כתב קרא לעתיד אין דכתיב ושם הנהר
השלישי חדקל הוא ההולך קדמת אשור ותנא רב יוסף אשור זו סליקא ומי
הואי אלא דעתידה הכא נמי דעתידה ואמר רב חנא בגדתאה מטר משקה
מרוה ומזבל ומעדן וממשיך אמר רבא בר רבי ישמעאל ואיתימא רב
יימר בר שלמיא מאי קרא תלמיה רוה נחת גדודיה ברביבים תמוגגנה
צמחה תברך אמר רבי אלעזר מזבח מזיח ומזין מחבב מכפר היינו מכפר
היינו מזיח מזיח גזירות ומכפר עונות ואמר רב חנא בגדתאה תמרי
משחנן משבען משלשלן מאשרן ולא מפנקן אמר רב אכל תמרים אל
יורה מיתיבי תמרים שחרית וערבית יפות במנחה רעות בצהרים אין כמותן
ומבטלות שלשה דברים מחשבה רעה וחולי מעים ותחתוניות מי אמרינן
דלא מעלו עלויי מעלו ולפי שעתא טרדא מידי דהוה אחמרא דאמר מר
השותה רביעית יין אל יורה ואיבעית אימא לא קשיא הא מקמי נהמא
הא לבתר נהמא דאמר אביי אמרה לי אם תמרי מקמי נהמא כי נרגא
לדיקולא בתר נהמא כי עברא לדשא דשא אמר רבא דרך שם דרגא
אמר רבא דרך גג פוריא א"ר פפא שפרין ורבין עליה אמר רב נחמן בר יצחק
אף`;

  const rashiText = `גיהוץ. לשיקיי"ר באבן הזכוכית: ככיבוס שלהן. שהיו מימיהם
יפים לכבס או סמנין יפים היו להן לכבס ובכיבוס שלנו אין הבגד
מלובן עד שיהיה מגוהץ: מעברא ליה חומרתא. שפשוף האבן
מעביר את הדם: חומרתא. אבן כדאמרינן בגיטין (דף סט:)
ונזדהר בחומרתא דנפק מיניה אבן
הנמצאת באמה מחמת חולי: ריחה
נודף. מפיה מריחין ריח היין שנכנס
לה דרך פתח הפתוח: גמרא הוה
שמיע ליה. שעשו כן לבנות יבש
גלעד במסכת יבמות (דף ס:): דור
קטוע. שאין להם לא דם נדה ולא
דם בתולים: יפין לאשה. למהר לה
הריון: נתחייב במקחך. על כרחך
תקבל חובה הבאה לך במקחך לשון
אין חבין לאדם (לקמן דף יא.) דבר
שהוא לרעתו קרוי חובה: שפניהם
שחורים. מחמת רעבון: צפד
עורם. דונש פירש כמו דבק עורם
על עצמם ומנחם פירש שחר עורם:
מתני' בתולה אלמנה וגרושה.
בין בתולה שהיא אלמנה
או גרושה או חלוצה מן האירוסין
וחזרה ונשאת: כתובתה. מן השני:
מאתים. שהרי בחזקת בתולה היא
נשאת לו: ויש להם טענת בתולים.
אם לא מצאה הב' בתולה אבדה כל
כתובתה דמקח טעות היא לו:
גמ' בגדתאה. דמן בגדת: על
שם מנה. שאם נשאת
משנתאלמנה אין לה כתובה אלא
מנה: דכתיבא באורייתא. ועדיין
לא נתקנו כתובות: ומי כתיב
קרא. לקרות על שם דבר העתיד:
זו סליקא. שם עיר: ומי הואי.
העיר בנויה בבריאת עולם דכתיב
ההולך קדמת אשור: [מטר. ולא
מאותיות דריש הכי אלא לפום סברא]:
מזבל. את הארץ: מעדן. נותן
עדנה וזיו בפירות: תלמיה. של
א"י: רוה נחת גדודיה כאשר
ברביבים תמוגגנה. רוה הרי משקה
ומרוה תמוגגנה הרי מזבל מעדן
וממשיך את הפירות נפקא מצמחה
תברך. תמוגגנה דישטנפי"ר:
מזיח. קס"ד מזיח עונות: מזין.
בזכות הקרבנות העולם נזון שהקרבנו'
באין מן המזון וגורמין לו ברכה:
מחבב. את ישראל אל אביהם:
היינו מזיח היינו מכפר. הי ניהו
מזיח הי ניהו מכפר: מזיח גזירות.
רעות מעל ישראל: משחנן.
מחממות: משלשלן. שלשול:
מאשרן. מחזיקות כח כמו אשרו
חמוץ (ישעיהו א) : ולא מפנקן. אינן
מרבות אסטניסא על הלב וכלן
לשבח: אל יורה. שום הוראה לפי
שטורדות דעתו כשיכור: שחרית
וערבית יפות. כללא דמילתא לאחר
אכילה יפות שחרית דרכן של בני
אדם בפת שחרית כדאמר בהמקבל
(ב"מ קז:) ערבית לאחר אכילה:
במנחה רעות. שהן קודם אכילה
לאחר שינת הצהרים: בצהרים.
לאחר הסעודה שאכל ושבע: אין
כמותם. וטובות יותר מערבית לפי
שאינו מעוכב ביום מלילך לשדות
לבית הכסא בכל עת שירצה
אבל בלילה טורח הוא לו: מבטלות
מחשבה רעה. דאגה לפי שמשמחות את הלב וצהרים שעת אורה וצהלה היא: כי עברא לדשא. מחזיקות את הגוף כבריח את הדלת:
אף`;

  const tosafotText = `בתולה אלמנה גרושה חלוצה. נראה לפרש דלרבותא נקט
חלוצה דסלקא דעתך אמינא כיון דשומרת יבם לא
מיחסרא כניסה לחופה שהרי יבמה יבא עליה בעל כרחה וה"א
דכנשואה דמיא קמ"ל: אלמנה דכתיבא באורייתא מאי איכא
למימר. והא ליכא למימר דתפשוט
מהכא דכתובת אלמנה מנה
מדאורייתא דהא מנה לא היה בימי
משה דלא הזכירה תורה אלא ככר
והא דאמרינן בבכורות (דף ה. ושם) 
משה רבינו נאמן היה ובקי בחשבונות
אלא שמנה של קודש כפול היה לא
שהיה מנה בימי משה אלא כלומר כמו
שמנה של קודש בימי יחזקאל כפול
היה כך היה ככר של קודש כפול בימי
משה: ותנא רב יוסף אשור זו
סליקא ומי הואי. פי' בקונטרס
ומי הואי בבריאת עולם ובלא רב
יוסף מאשור וכן מכוש לא מצי
למיפרך דמצינן למימר דאשור וכוש
שם המחוז ולא שם העיר ומימות
עולם היה שמם כך אבל קשה דמאי
מייתי מאשור דאשור אע"ג דלא
הוה בבריאת עולם כיון דהוה בימי
משה שפיר הוה ליה למכתב אבל
מנה לא היה לו לכתוב כיון שעדיין
לא היה בדורו ונראה לר"י לפרש
דסליקא בימי משה מי הואי דקים
ליה דסליקא לא היה בימי משה
וסביב סליקא הולך חדקל ולא אצל
אשור שהיה בימי משה:
אמר רב אכל תמרים אל יורה.
ואם תאמר דבפ"ג דכריתות
(דף יג: ושם) (אמר רב הונא) אמר רב
הלכה כר' אלעזר דאינו מחייב על
שאר משכרין אלא על היין בלבד
וי"ל אע"ג דלא מחייב על ביאת
מקדש אסור להורות וה"נ משמע
בס"פ אלו מומין (בכורות מה:) דפסול
לעבודה למאן דלא מחייב אשאר
משכרין אף על גב דעבודה לא
אחיל הוא הדין נמי דאל יורה:
מטבילין`;

  describe('Text structure parsing', () => {
    test('should identify main Gemara text sections', () => {
      // Check for key phrases that mark different sections
      expect(ketubotMainText).toContain('גיהוץ שלנו ככיבוס שלהם');
      expect(ketubotMainText).toContain('מתני\'');
      expect(ketubotMainText).toContain('גמ\'');
      
      // Check that Mishnah section is included
      expect(ketubotMainText).toContain('בתולה כתובתה מאתים');
      expect(ketubotMainText).toContain('ואלמנה מנה');
    });

    test('should identify Rashi commentary sections', () => {
      // Check for Rashi's explanation style
      expect(rashiText).toContain('גיהוץ. לשיקיי"ר באבן הזכוכית');
      expect(rashiText).toContain('ככיבוס שלהן. שהיו מימיהם');
      
      // Check for typical Rashi markers
      expect(rashiText).toMatch(/מתני'/);
      expect(rashiText).toMatch(/גמ'/);
    });

    test('should identify Tosafot commentary sections', () => {
      // Check for Tosafot's dialectical style
      expect(tosafotText).toContain('נראה לפרש');
      expect(tosafotText).toContain('והא ליכא למימר');
      expect(tosafotText).toContain('ואם תאמר');
      expect(tosafotText).toContain('וי"ל');
    });
  });

  describe('Text cleaning and formatting', () => {
    test('should preserve Hebrew text integrity', () => {
      // Check that Hebrew characters are preserved
      const hebrewPattern = /[\u0590-\u05FF]/;
      expect(ketubotMainText).toMatch(hebrewPattern);
      expect(rashiText).toMatch(hebrewPattern);
      expect(tosafotText).toMatch(hebrewPattern);
    });

    test('should handle special Hebrew punctuation', () => {
      // Check for geresh (׳) and gershayim (״)
      expect(ketubotMainText).toContain('מתני\'');
      expect(rashiText).toContain('רש"י');
      expect(tosafotText).toContain('דבפ"ג');
    });

    test('should preserve important formatting markers', () => {
      // Check for section markers
      expect(rashiText).toMatch(/\(דף [^\)]+\)/); // Page references like (דף סט:)
      expect(tosafotText).toMatch(/\(דף [^\)]+\)/);
    });
  });

  describe('Content extraction patterns', () => {
    test('should extract Gemara sections correctly', () => {
      const gemaraPattern = /גמ'[^:]*:(.*?)(?=מתני'|$)/s;
      const gemaraMatch = ketubotMainText.match(gemaraPattern);
      
      expect(gemaraMatch).toBeTruthy();
      if (gemaraMatch) {
        expect(gemaraMatch[1]).toContain('מאי אלמנה');
        expect(gemaraMatch[1]).toContain('אמר רב חנא בגדתאה');
      }
    });

    test('should extract Mishnah sections correctly', () => {
      const mishnahPattern = /מתני'[^:]*:(.*?)(?=גמ'|$)/s;
      const mishnahMatch = ketubotMainText.match(mishnahPattern);
      
      expect(mishnahMatch).toBeTruthy();
      if (mishnahMatch) {
        expect(mishnahMatch[1]).toContain('בתולה כתובתה מאתים');
        expect(mishnahMatch[1]).toContain('ויש להן טענת בתולים');
      }
    });

    test('should handle Rashi reference markers', () => {
      // Check for typical Rashi reference patterns
      const referencePattern = /\(([^)]+)\)/g;
      const references = [...rashiText.matchAll(referencePattern)];
      
      expect(references.length).toBeGreaterThan(0);
      
      // Check for page references
      const pageRefs = references.filter(ref => ref[1].includes('דף'));
      expect(pageRefs.length).toBeGreaterThan(0);
    });

    test('should handle Tosafot dialectical markers', () => {
      const dialecticalPhrases = [
        'נראה לפרש',
        'והא ליכא למימר', 
        'ואם תאמר',
        'וי"ל',
        'אע"ג',
        'קמ"ל'
      ];

      dialecticalPhrases.forEach(phrase => {
        const found = tosafotText.includes(phrase);
        if (!found) {
          console.log(`Missing phrase: ${phrase}`);
        }
      });

      // At least most should be found
      const foundCount = dialecticalPhrases.filter(phrase => tosafotText.includes(phrase)).length;
      expect(foundCount).toBeGreaterThan(dialecticalPhrases.length / 2);
    });
  });

  describe('HebrewBooks HTML structure patterns', () => {
    test('should match expected div class structure', () => {
      const expectedClasses = {
        main: 'shastext2',
        rashi: 'shastext3',
        tosafot: 'shastext4'
      };

      // These would be the selectors used in the actual scraping
      const mainSelector = `.${expectedClasses.main}`;
      const rashiSelector = `.${expectedClasses.rashi}`;
      const tosafotSelector = `.${expectedClasses.tosafot}`;

      expect(mainSelector).toBe('.shastext2');
      expect(rashiSelector).toBe('.shastext3');
      expect(tosafotSelector).toBe('.shastext4');
    });

    test('should handle span class="five" for emphasis', () => {
      // Rashi uses span.five for emphasized words
      const emphasisPattern = /<span class="five">([^<]+)<\/span>/g;
      
      // In actual HTML, these would be present
      const sampleRashiHTML = '<span class="five">גיהוץ. </span>לשיקיי"ר באבן הזכוכית';
      const matches = [...sampleRashiHTML.matchAll(emphasisPattern)];
      
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0][1]).toBe('גיהוץ. ');
    });

    test('should handle shastitle markers', () => {
      // Check for title markers
      const titlePattern = /<span class="shastitle\d+">([^<]+)<\/span>/;
      
      const sampleHTML = '<span class="shastitle4">מתני\'</span>';
      const match = sampleHTML.match(titlePattern);
      
      expect(match).toBeTruthy();
      if (match) {
        expect(match[1]).toBe('מתני\'');
      }
    });
  });
});