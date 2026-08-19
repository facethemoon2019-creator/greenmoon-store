const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "Content-Type, Authorization",
    "access-control-allow-methods": "POST, OPTIONS"
  }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        aiConfigured: !!env.AI
      });
    }

    // AI endpoint
    if (url.pathname === "/api/ai") {

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "Content-Type, Authorization",
            "access-control-allow-methods": "POST, OPTIONS"
          }
        });
      }

      if (request.method !== "POST") {
        return json({ error: "استخدم POST فقط." }, 405);
      }

      if (!env.AI) {
        return json({
          error: "Workers AI غير مربوط بالـ Worker."
        }, 503);
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          error: "بيانات الطلب غير صحيحة."
        }, 400);
      }

      const question = String(body.question || "").trim();
      const context = String(body.context || "").trim();

      const products = Array.isArray(body.products)
        ? body.products.slice(0, 80)
        : [];

      const packages = Array.isArray(body.packages)
        ? body.packages.slice(0, 40)
        : [];

      if (!question) {
        return json({
          error: "اكتب سؤالك الأول."
        }, 400);
      }

      const catalog = JSON.stringify({
        products,
        packages
      });

      const instructions = `
أنت مساعد المبيعات الرسمي لشركة Green Moon Plants and Flowers في مصر.

مهمتك مساعدة العميل في اختيار النباتات والعروض المناسبة له بطريقة ودودة واحترافية وبالعامية المصرية.

قواعد مهمة:
- اعتمد على المنتجات والعروض الموجودة في الكتالوج فقط.
- لا تخترع أسعارًا أو منتجات أو خصومات غير موجودة.
- لو العميل ذكر ميزانية، اقترح له أفضل اختيار متاح داخل الميزانية.
- لو احتاج العميل أكثر من اختيار، اعرض له الاختيارات بوضوح.
- اجعل الرد مختصرًا وسهل القراءة.
- لا تقل إنك نموذج ذكاء اصطناعي.
- لا تطلب من العميل الذهاب لموقع آخر.
- لو المعلومات غير كافية، اسأل العميل سؤالًا بسيطًا يساعدك على تحديد الاختيار.

الكتالوج:
${catalog}

معلومات إضافية:
${context}
`;

      let result;

      try {
        result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast",ı
          {
            messages: [
              {
                role: "system",
                content: instructions
              },
              {
                role: "user",
                content: question
              }
            ],
            max_tokens: 500
          }
        );
      } catch (error) {
        return json({
          error: "حصل خطأ أثناء تشغيل المساعد.",
          detail: String(error?.message || error)
        }, 502);
      }

      const answer =
        result?.response ||
        result?.result?.response ||
        "";

      if (!answer) {
        return json({
          error: "المساعد لم يرجع ردًا."
        }, 502);
      }

      return json({
        answer: String(answer)
      });
    }

    // Static website
    return env.ASSETS.fetch(request);
  }
};
