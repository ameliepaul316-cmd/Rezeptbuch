// Datei: functions/api/recipes.ts
export interface Env { DB: D1Database; }

/* ===================== Helfer & Konstanten ===================== */
const CATEGORIES = [
  'Frühstück',
  'Hauptspeise',
  'Bakery',
  'Snacks & Desserts',
  'Drinks'
] as const;
type Category = typeof CATEGORIES[number];

const SUBCATS: Record<Category, string[]> = {
  'Frühstück': ['Brot & Aufstriche', 'Sonstiges'],
  'Hauptspeise': [
    'Burger, Wraps & Bowls',
    'Vegetarische Gerichte',     
    'Suppen & Eintöpfe',
    'Pasta & Nudeln',
    'Pizza',
    'Reis & Getreidegerichte',
    'Internationale Küche & Currys',
    'Snacks, Beilage & Fingerfood',
    'Basics & Saucen',
    'Curry-Paste'
  ],
  'Bakery': ['Kuchen & Torten', 'Plätzchen & Kleingebäck', 'Sonstiges Gebäck'],
  'Snacks & Desserts': [],
  'Drinks': ['Alkoholische Getränke', 'Nicht-alkoholische Getränke']
};

function isNonEmptyString(x: unknown) {
  return typeof x === 'string' && x.trim().length > 0;
}
function safeJSON(val: unknown) { return JSON.stringify(val ?? null); }

/** String → safe trimmed string */
function s(val: unknown) { return String(val ?? '').trim(); }

/** Liste aus Strings: trimmen & Leeres raus */
function stringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.map(v => s(v)).filter(Boolean);
}

/** Prüfen, ob Kategorie/Subkategorie zulässig sind */
function validateCatSub(cat: string, sub: string) {
  const validCat = CATEGORIES.includes(cat as Category);
  if (!validCat) return false;
  const allowedSubs = SUBCATS[cat as Category] || [];
  // Sub ist optional, aber falls vorhanden, muss es in der Liste der jeweiligen Kategorie sein
  if (sub && allowedSubs.length) {
    return allowedSubs.includes(sub);
  }
  return true;
}

/* ===================== GET ===================== */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  // Sortierung:
  // 1) Kategorie in fester Reihenfolge
  // 2) Subkategorie custom (nur wo fest definiert, sonst alphabetisch)
  // 3) Titel alphabetisch
  const { results } = await env.DB
    .prepare(`
      SELECT
        id, title, category, subcategory, servings, prep, total,
        ingredients_json, steps_json, created_at
      FROM recipes
      ORDER BY
        CASE category
          WHEN 'Frühstück'         THEN 1
          WHEN 'Hauptspeise'       THEN 2
          WHEN 'Bakery'            THEN 3
          WHEN 'Snacks & Desserts' THEN 4
          WHEN 'Drinks'            THEN 5
          ELSE 6
        END ASC,
        -- Subcat-Order je Kategorie:
        CASE category
          WHEN 'Frühstück' THEN
            CASE subcategory
              WHEN 'Brot & Aufstriche'        THEN 1
              WHEN 'Sonstiges'                 THEN 2
              ELSE 99
            END
          WHEN 'Drinks' THEN
            CASE subcategory
              WHEN 'Alkoholische Getränke'     THEN 1
              WHEN 'Nicht-alkoholische Getränke' THEN 2
              ELSE 99
            END
          ELSE 99
        END ASC,
        subcategory COLLATE NOCASE ASC,
        title COLLATE NOCASE ASC
    `)
    .all();

  return new Response(JSON.stringify(results), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
};

/* ===================== POST ===================== */
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const body = await request.json();
    const title = s(body.title);
    const category = s(body.category);
    const subcategory = s(body.subcategory);
    const servings = Math.max(1, parseInt(String(body.servings ?? '1'), 10) || 1);
    const prep = s(body.prep);
    const total = s(body.total);
    const ingredients = stringArray(body.ingredients);
    const steps = stringArray(body.steps);

    if (!isNonEmptyString(title) || !isNonEmptyString(category) || !isNonEmptyString(prep) || !isNonEmptyString(total) || !ingredients.length || !steps.length) {
      return new Response(JSON.stringify({ error: "Felder unvollständig" }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });
    }
    if (!validateCatSub(category, subcategory)) {
      return new Response(JSON.stringify({ error: "Kategorie/Unterkategorie ungültig" }), { status: 422, headers: { "content-type": "application/json; charset=utf-8" } });
    }

    const slug = (txt: string) => txt.toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
      .slice(0,64) || 'rezept';

    const id = `${slug(title)}-${Date.now()}`;
    const created_at = Date.now();

    await env.DB.prepare(
      `INSERT INTO recipes (id,title,category,subcategory,servings,prep,total,ingredients_json,steps_json,created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`
    )
    .bind(
      id, title, category, subcategory, servings, prep, total,
      safeJSON(ingredients), safeJSON(steps), created_at
    )
    .run();

    return new Response(JSON.stringify({ ok: true, id }), {
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });
  }
};

/* ===================== PUT ===================== */
export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: "id fehlt" }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });

    const body = await request.json();
    const title = s(body.title);
    const category = s(body.category);
    const subcategory = s(body.subcategory);
    const servings = Math.max(1, parseInt(String(body.servings ?? '1'), 10) || 1);
    const prep = s(body.prep);
    const total = s(body.total);
    const ingredients = stringArray(body.ingredients);
    const steps = stringArray(body.steps);

    if (!title || !category || !prep || !total || !ingredients.length || !steps.length) {
      return new Response(JSON.stringify({ error: "Felder unvollständig" }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });
    }
    if (!validateCatSub(category, subcategory)) {
      return new Response(JSON.stringify({ error: "Kategorie/Unterkategorie ungültig" }), { status: 422, headers: { "content-type": "application/json; charset=utf-8" } });
    }

    const { success } = await env.DB.prepare(
      `UPDATE recipes
       SET title=?2, category=?3, subcategory=?4, servings=?5, prep=?6, total=?7,
           ingredients_json=?8, steps_json=?9
       WHERE id=?1`
    ).bind(
      id, title, category, subcategory, servings, prep, total,
      safeJSON(ingredients), safeJSON(steps)
    ).run();

    if (!success) {
      return new Response(JSON.stringify({ error: "Update fehlgeschlagen" }), { status: 500, headers: { "content-type": "application/json; charset=utf-8" } });
    }

    return new Response(JSON.stringify({ ok: true, id }), {
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });
  }
};

/* ===================== DELETE ===================== */
export const onRequestDelete: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: "id fehlt" }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });

  const { success } = await env.DB.prepare(`DELETE FROM recipes WHERE id=?1`).bind(id).run();
  if (!success) return new Response(JSON.stringify({ error: "Löschen fehlgeschlagen" }), { status: 500, headers: { "content-type": "application/json; charset=utf-8" } });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
};
