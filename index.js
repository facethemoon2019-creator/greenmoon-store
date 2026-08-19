const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-allow-methods': 'POST, OPTIONS',
  },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') return json({ ok: true, aiConfigured: !!env.OPENAI_API_KEY });

    if (url.pathname === '/api/ai') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'Content-Type, Authorization',
        'access-control-allow-methods': 'POST, OPTIONS',
      }});
      if (request.method !== 'POST') return json({ error: 'استخدم POST لهذا المسار.' }, 405);
      if (!env.OPENAI_API_KEY) return json({ error: 'لم يتم ضبط مفتاح OpenAI في Cloudflare بعد.' }, 503);

      let body;
      try { body = await request.json(); }
      catch { return json({ error: 'بيانات الطلب غير صالحة.' }, 400); }

      const question = String(body.question || '').trim();
      const context = String(body.context || '').trim();
      const products = Array.isArray(body.products) ? body.products.slice(0, 80) : [];
      const packages = Array.isArray(body.packages) ? body.packages.slice(0, 40) : [];
      if (!question) return json({ error: 'اكتب سؤالك الأول.' }, 400);

      const catalog = JSON.stringify({ products, packages });
      const instructions = `أنت مساعد المبيعات الرسمي لمتجر Green Moon Plants and Flowers في مصر.\nأجب باللهجة المصرية بشكل ودود ومختصر وعملي.\nمهم جدًا: لا تخترع منتجًا أو سعرًا أو عرضًا غير موجود في الكتالوج المرسل. لو المعلومة غير موجودة قل إنك محتاج من العميل تحديدها أو تواصل مع Green Moon.\nساعد العميل في اختيار النباتات والباكدجات حسب المكان والميزانية، واذكر السعر فقط إذا كان موجودًا.\nالكتالوج الحالي: ${catalog}\nالسياق: ${context}`;

      const upstream = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-5.6',
          instructions,
          input: question,
          store: false,
        }),
      });

      if (!upstream.ok) {
        let detail = 'تعذر الاتصال بخدمة الذكاء الاصطناعي.';
        try {
          const e = await upstream.json();
          detail = e?.error?.message || detail;
        } catch {}
        return json({ error: detail }, upstream.status >= 500 ? 502 : upstream.status);
      }

      const data = await upstream.json();
      const answer = data.output_text || data.output?.flatMap(x => x.content || []).map(x => x.text || '').filter(Boolean).join('\n') || '';
      if (!answer) return json({ error: 'وصل رد فارغ من المساعد.' }, 502);
      return json({ answer });
    }

    return env.ASSETS.fetch(request);
  },
};
