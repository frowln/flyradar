#!/usr/bin/env python3
"""Generate SkyAtlas_Client_Pitch.docx with professional McKinsey-style formatting."""

from docx import Document
from docx.shared import Pt, Cm, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import copy

# ── colour palette ────────────────────────────────────────────────────────────
DARK_NAVY   = RGBColor(0x10, 0x1B, 0x2E)   # headings, hero bg
ACCENT_BLUE = RGBColor(0x1A, 0x6C, 0xF5)   # sub-headings, accents
LIGHT_GREY  = RGBColor(0xF4, 0xF6, 0xFA)   # table header fill
MID_GREY    = RGBColor(0x6B, 0x72, 0x80)   # body secondary text
WHITE       = RGBColor(0xFF, 0xFF, 0xFF)
BLACK       = RGBColor(0x0D, 0x0D, 0x0D)

HEX = {
    DARK_NAVY:   '101B2E',
    ACCENT_BLUE: '1A6CF5',
    LIGHT_GREY:  'F4F6FA',
    MID_GREY:    '6B7280',
    WHITE:       'FFFFFF',
    BLACK:       '0D0D0D',
}


def set_cell_bg(cell, rgb: RGBColor):
    """Set cell background colour via XML shading."""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    hex_color = HEX.get(rgb, 'FFFFFF')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_color)
    tcPr.append(shd)


def set_cell_border(cell, border_style='single', size=4, color='BFCCE0'):
    """Add bottom border to a table cell."""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for side in ('top', 'left', 'bottom', 'right'):
        border = OxmlElement(f'w:{side}')
        border.set(qn('w:val'), border_style)
        border.set(qn('w:sz'), str(size))
        border.set(qn('w:space'), '0')
        border.set(qn('w:color'), color)
        tcBorders.append(border)
    tcPr.append(tcBorders)


def remove_table_borders(table):
    """Remove all borders from a table."""
    tbl = table._tbl
    tblPr = tbl.find(qn('w:tblPr'))
    if tblPr is None:
        tblPr = OxmlElement('w:tblPr')
        tbl.insert(0, tblPr)
    tblBorders = OxmlElement('w:tblBorders')
    for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        b = OxmlElement(f'w:{side}')
        b.set(qn('w:val'), 'none')
        tblBorders.append(b)
    tblPr.append(tblBorders)


def para_spacing(para, before=0, after=0):
    pPr = para._p.get_or_add_pPr()
    spacing = OxmlElement('w:spacing')
    spacing.set(qn('w:before'), str(before))
    spacing.set(qn('w:after'), str(after))
    pPr.append(spacing)


def add_run(para, text, bold=False, italic=False, size=11,
            color=BLACK, font_name='Calibri'):
    run = para.add_run(text)
    run.bold = bold
    run.italic = italic
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.font.name = font_name
    return run


def add_heading_para(doc, text, level=1):
    """Custom section heading with left accent bar effect."""
    para = doc.add_paragraph()
    para.alignment = WD_ALIGN_PARAGRAPH.LEFT
    para_spacing(para, before=240, after=80)

    if level == 1:
        run = add_run(para, text, bold=True, size=14, color=DARK_NAVY)
    else:
        run = add_run(para, text, bold=True, size=12, color=ACCENT_BLUE)
    return para


def add_body(doc, text, size=11, color=BLACK, before=0, after=120, align=WD_ALIGN_PARAGRAPH.LEFT):
    para = doc.add_paragraph()
    para.alignment = align
    para_spacing(para, before=before, after=after)
    add_run(para, text, size=size, color=color)
    return para


def add_bullet(doc, text, size=11):
    """Simple bullet point."""
    para = doc.add_paragraph(style='List Bullet')
    para_spacing(para, before=40, after=40)
    run = para.add_run(text)
    run.font.size = Pt(size)
    run.font.name = 'Calibri'
    run.font.color.rgb = BLACK
    return para


def add_data_table(doc, headers, rows, col_widths=None):
    """Styled data table: dark header, alternating light rows."""
    n_cols = len(headers)
    table = doc.add_table(rows=1 + len(rows), cols=n_cols)
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    remove_table_borders(table)

    # header row
    hdr_row = table.rows[0]
    for i, h in enumerate(headers):
        cell = hdr_row.cells[i]
        set_cell_bg(cell, DARK_NAVY)
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        para = cell.paragraphs[0]
        para.alignment = WD_ALIGN_PARAGRAPH.LEFT
        para_spacing(para, before=80, after=80)
        add_run(para, h, bold=True, size=10, color=WHITE)

    # data rows
    for r_idx, row_data in enumerate(rows):
        row = table.rows[r_idx + 1]
        fill = LIGHT_GREY if r_idx % 2 == 0 else WHITE
        for c_idx, cell_text in enumerate(row_data):
            cell = row.cells[c_idx]
            set_cell_bg(cell, fill)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            para = cell.paragraphs[0]
            para.alignment = WD_ALIGN_PARAGRAPH.LEFT
            para_spacing(para, before=60, after=60)
            bold = (c_idx == 0)
            add_run(para, cell_text, bold=bold, size=10, color=BLACK)

    # column widths
    if col_widths:
        for row in table.rows:
            for i, cell in enumerate(row.cells):
                cell.width = Cm(col_widths[i])

    # spacer after table
    doc.add_paragraph()
    return table


def add_divider(doc):
    """Thin horizontal rule via paragraph bottom border."""
    para = doc.add_paragraph()
    para_spacing(para, before=120, after=120)
    pPr = para._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '4')
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), 'C8D4E8')
    pBdr.append(bottom)
    pPr.append(pBdr)
    return para


# ══════════════════════════════════════════════════════════════════════════════
# BUILD DOCUMENT
# ══════════════════════════════════════════════════════════════════════════════

doc = Document()

# ── page margins ──────────────────────────────────────────────────────────────
section = doc.sections[0]
section.top_margin    = Cm(2.0)
section.bottom_margin = Cm(2.0)
section.left_margin   = Cm(2.5)
section.right_margin  = Cm(2.5)

# ── HERO BLOCK ────────────────────────────────────────────────────────────────
# Title
title_para = doc.add_paragraph()
title_para.alignment = WD_ALIGN_PARAGRAPH.LEFT
para_spacing(title_para, before=0, after=40)
add_run(title_para, 'SkyAtlas', bold=True, size=38, color=DARK_NAVY, font_name='Calibri')

# Sub-tagline
sub_para = doc.add_paragraph()
sub_para.alignment = WD_ALIGN_PARAGRAPH.LEFT
para_spacing(sub_para, before=0, after=120)
add_run(sub_para, 'Новый стандарт воздушных путешествий', bold=False, size=16, color=ACCENT_BLUE)

# One-liner
one_para = doc.add_paragraph()
one_para.alignment = WD_ALIGN_PARAGRAPH.LEFT
para_spacing(one_para, before=0, after=40)
add_run(one_para, 'Первое в мире приложение, которое превращает каждый полёт в интерактивное путешествие — без интернета.', bold=True, size=12, color=DARK_NAVY)

add_divider(doc)

# ── ПРОБЛЕМА ──────────────────────────────────────────────────────────────────
add_heading_para(doc, 'Проблема', level=1)

add_body(doc,
    'Каждый год 4.7 миллиарда человек садятся в самолёт. Средний рейс длится 3.5 часа. '
    'Это 16.5 миллиардов часов в год — потерянного времени в воздухе.',
    before=0, after=100)

bullets_problem = [
    'Пассажиры смотрят вниз и не знают, что за горы справа и какой город мерцает огнями внизу',
    'Wi-Fi на борту есть только у 30% рейсов в мире — и стоит $15–30 за перелёт',
    '73% авиапассажиров называют скуку в полёте главным раздражителем',
    'Ни одно существующее приложение не работает офлайн и при этом даёт контент о земле под самолётом',
    'Авиакомпании тратят миллиарды на кресла и питание — проблема мёртвого времени не решена',
]
for b in bullets_problem:
    add_bullet(doc, b)

add_divider(doc)

# ── РЕШЕНИЕ ───────────────────────────────────────────────────────────────────
add_heading_para(doc, 'Решение', level=1)

add_body(doc,
    'Перед полётом вы добавляете рейс в приложение. SkyAtlas автоматически загружает всё необходимое: '
    'карту маршрута, информацию о каждом городе, горе, озере и достопримечательности вдоль пути. '
    'Интернет больше не нужен.',
    before=0, after=100)

add_body(doc,
    'В самолёте — открываете и видите в реальном времени, где именно находится ваш борт. '
    'Справа проплывают Альпы — приложение рассказывает о каждой вершине. Под вами Вена — '
    'и вы уже читаете, почему здесь построили знаменитый оперный театр.',
    before=0, after=100)

add_body(doc,
    'Каждое место, которое вы пролетели, остаётся в личной коллекции. Страны, города, горные хребты, моря — '
    'всё копится как цифровой дневник путешественника. Есть достижения: «Пересёк экватор», '
    '«Облетел 20 стран», «Ночной перелёт над Сибирью». Каждый рейс прожит, а не просто пережит.',
    before=0, after=0)

add_divider(doc)

# ── РЫНОК ─────────────────────────────────────────────────────────────────────
add_heading_para(doc, 'Рынок', level=1)

add_data_table(doc,
    headers=['Сегмент', 'Показатель'],
    rows=[
        ['Глобальный рынок travel-приложений (2024)', '$11.4 млрд'],
        ['Прогноз рынка к 2030', '$26+ млрд'],
        ['Авиапассажиров в год (2024)', '4.7 млрд'],
        ['Прогноз авиапассажиров к 2030', '7.8 млрд'],
        ['Регулярных авиапассажиров (3+ рейсов/год)', '500+ млн'],
    ],
    col_widths=[11, 5.5]
)

add_body(doc,
    'Целевой пользователь: путешественник 25–55 лет, летает 3–8 раз в год, готов платить '
    'за качественный опыт. Уже пользуется подписками и premium-сервисами.',
    before=0, after=0)

add_divider(doc)

# ── КАК ЗАРАБАТЫВАЕМ ──────────────────────────────────────────────────────────
add_heading_para(doc, 'Как зарабатываем', level=1)

add_heading_para(doc, 'Прямая монетизация', level=2)

add_data_table(doc,
    headers=['Продукт', 'Цена', 'Для кого'],
    rows=[
        ['Один рейс', '$1.99', 'Попробовать без обязательств'],
        ['Годовая подписка', '$19.99/год', 'Кто летает регулярно'],
        ['Навсегда', '$49.99', 'Лояльная аудитория'],
    ],
    col_widths=[6, 3, 7.5]
)

add_heading_para(doc, 'B2B и партнёрства', level=2)

bullets_b2b = [
    'Корпоративные лицензии для авиакомпаний — white-label интеграция в бортовые развлекательные системы',
    'Партнёрства с travel-страховщиками, отельными сетями, туроператорами',
    'Нативная реклама и контент о точках прилёта',
]
for b in bullets_b2b:
    add_bullet(doc, b)

add_heading_para(doc, 'Прогноз выручки', level=2)

add_data_table(doc,
    headers=['Сценарий', 'Пользователей (год 1)', 'ARR'],
    rows=[
        ['Консервативный', '50 000', '~$350 тыс.'],
        ['Оптимистичный', '200 000', '~$1.4 млн'],
    ],
    col_widths=[5.5, 5.5, 5.5]
)

add_body(doc,
    'При конверсии 0.01% от 500 млн регулярных пассажиров — 50 000 платящих пользователей уже в первый год.',
    before=0, after=0)

add_divider(doc)

# ── УДЕРЖАНИЕ ─────────────────────────────────────────────────────────────────
add_heading_para(doc, 'Почему пользователи не уйдут', level=1)

add_body(doc,
    'SkyAtlas строит личную историю каждого пользователя. Коллекция стран накапливается годами. '
    'Удалить приложение — значит потерять цифровой дневник путешественника. '
    'Тот же механизм удержания, что у Duolingo со стриками или у Instagram с архивом фото.',
    before=0, after=100)

add_body(doc,
    'Достижения создают повод вернуться на каждый новый рейс. Карта мира, которую вы постепенно '
    '«закрашиваете» — это визуальный прогресс, который хочется продолжать. '
    'Пользователи делятся коллекциями, рекомендуют приложение.',
    before=0, after=100)

add_body(doc,
    'Каждый новый полёт делает приложение ценнее именно для этого пользователя. '
    'Это персонализация, которую невозможно скопировать.',
    before=0, after=0)

add_divider(doc)

# ── КОНКУРЕНТЫ ────────────────────────────────────────────────────────────────
add_heading_para(doc, 'Конкурентов нет', level=1)

add_body(doc,
    'FlightRadar24 показывает где летит самолёт — только онлайн, без контента о земле. '
    'Google Maps и Wikipedia не работают в самолёте. Бортовые системы показывают карту маршрута — '
    'без единого слова о том, что под крылом.',
    before=0, after=100)

add_body(doc,
    'Никто не совместил три вещи одновременно: работа без интернета + живой географический контент + '
    'геймификация путешествий. Эта ниша пустая. И она огромная.',
    bold_parts=False, before=0, after=0)

add_divider(doc)

# ── ПОЧЕМУ СЕЙЧАС ─────────────────────────────────────────────────────────────
add_heading_para(doc, 'Почему сейчас', level=1)

bullets_why = [
    'Авиация восстановилась после COVID и бьёт рекорды: к 2030 году в воздухе будет на 3 млрд пассажиров больше',
    'Экономика впечатлений: люди тратят больше на опыт, чем на вещи — рынок experience-сервисов растёт быстрее ритейла',
    'AI позволяет генерировать персонализированный контент для миллиардов географических объектов в масштабе',
    'Смартфон есть у каждого пассажира. App Store и Google Play — готовая инфраструктура распространения',
]
for b in bullets_why:
    add_bullet(doc, b)

add_divider(doc)

# ── ДОРОЖНАЯ КАРТА ────────────────────────────────────────────────────────────
add_heading_para(doc, 'Дорожная карта', level=1)

add_data_table(doc,
    headers=['Период', 'Этап'],
    rows=[
        ['Месяцы 1–3',   'Запуск первой версии, первые пользователи, сбор обратной связи'],
        ['Месяцы 4–6',   'Публичный запуск в App Store и Google Play, маркетинговая кампания'],
        ['Месяцы 7–9',   'Переговоры и первые партнёрства с авиакомпаниями'],
        ['Месяцы 10–12', 'Выход на $350–400 тыс. ARR, подготовка к следующему раунду'],
    ],
    col_widths=[4, 12.5]
)

add_divider(doc)

# ── ЧТО НУЖНО ─────────────────────────────────────────────────────────────────
add_heading_para(doc, 'Что нужно для запуска', level=1)

add_body(doc,
    'Для реализации первого этапа необходимо $XXX тыс.',
    bold_parts=False, before=0, after=100)

add_body(doc,
    'Средства покрывают: финальную разработку и тестирование, выход в App Store и Google Play, '
    'первичное наполнение контентом, маркетинг на старте и операционные расходы на 12 месяцев.',
    before=0, after=100)

add_body(doc,
    'Мы не ищем просто деньги. Мы ищем партнёра, который понимает: рынок пустой, '
    'момент правильный, и продукт уже существует.',
    before=0, after=0)

add_divider(doc)

# ── FOOTER ────────────────────────────────────────────────────────────────────
footer_para = doc.add_paragraph()
footer_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
para_spacing(footer_para, before=80, after=0)
add_run(footer_para,
    'SkyAtlas — потому что каждый рейс должен быть частью истории, а не дырой в календаре.',
    italic=True, size=11, color=MID_GREY)

# ── SAVE ──────────────────────────────────────────────────────────────────────
out_path = '/Users/damirkasimov/Desktop/flyradar/docs/SkyAtlas_Client_Pitch.docx'
doc.save(out_path)
print(f'Saved: {out_path}')
