// Datei: functions/api/recipes.ts
export interface Env { DB: D1Database; }

function isNonEmptyString(x: unknown) { return typeof x === 'string' && x.trim().length > 0; }
function safeJSON(val: unknown) { return JSON.stringify(val ?? null); }

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB
    .prepare(`SELECT id,title,category,subcategory,servings,prep,total,ingredients_json,steps_json,created_at
              FROM recipes ORDER BY created_at DESC`)
    .all();

  return new Response(JSON.stringify(results), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const body = await request.json();
    const title = String(body.title || '').trim();
    const category = String(body.category || '').trim();
    const subcategory = (body.subcategory ?? '').toString().trim();
    const servings = Math.max(1, parseInt(body.servings ?? '1', 10));
    const prep = String(body.prep || '').trim();
    const total = String(body.total || '').trim();
    const ingredients: string[] = Array.isArray(body.ingredients) ? body.ingredients.map(String) : [];
    const steps: string[] = Array.isArray(body.steps) ? body.steps.map(String) : [];

    if (!isNonEmptyString(title) || !isNonEmptyString(category) || !isNonEmptyString(prep) || !isNonEmptyString(total) || !ingredients.length || !steps.length) {
      return new Response(JSON.stringify({ error: "Felder unvollständig" }), { status: 400, headers: { "content-type": "application/json" } });
    }

    const slug = (s: string) => s.toLowerCase()
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
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "content-type": "application/json" } });
  }
};
