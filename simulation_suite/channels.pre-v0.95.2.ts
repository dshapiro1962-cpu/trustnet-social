// ============================================================================
// Channel senders — WhatsApp (Meta Cloud API) and Email (Resend)
// Each returns { ok, error } so callers can record per-recipient send status.
// ============================================================================

export interface SendResult {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// WhatsApp — template message via Meta Cloud API
// ---------------------------------------------------------------------------
export async function sendWhatsApp(
  toPhone: string, // E.164, e.g. +972501234567
  templateName: string,
  bodyParams: string[],
): Promise<SendResult> {
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID");
  const token = Deno.env.get("WHATSAPP_TOKEN");
  if (!phoneId || !token) return { ok: false, error: "whatsapp_not_configured" };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toPhone,
          type: "template",
          template: {
            name: templateName,
            language: { code: "en" },
            components: [
              {
                type: "body",
                parameters: bodyParams.map((t) => ({ type: "text", text: t })),
              },
            ],
          },
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, error: `whatsapp_${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `whatsapp_exception: ${String(e).slice(0, 200)}` };
  }
}

// ---------------------------------------------------------------------------
// Email — via Resend
// ---------------------------------------------------------------------------
export async function sendEmail(
  toEmail: string,
  subject: string,
  html: string,
): Promise<SendResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "Trustnet <queries@mail.trustnet.com>";
  if (!apiKey) return { ok: false, error: "email_not_configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: toEmail, subject, html }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, error: `email_${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `email_exception: ${String(e).slice(0, 200)}` };
  }
}

// ---------------------------------------------------------------------------
// Email HTML builder for a query notification
// ---------------------------------------------------------------------------
export function queryEmailHtml(opts: {
  requesterName: string;
  queryText: string;
  responseUrl: string;
  circleName: string;
}): string {
  const { requesterName, queryText, responseUrl, circleName } = opts;
  return `<!doctype html><html><body style="margin:0;background:#f2f6f3;font-family:-apple-system,Segoe UI,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="background:#0d2b1f;border-radius:12px 12px 0 0;padding:20px 24px;">
      <span style="color:#fff;font-weight:800;font-size:18px;">Trustnet</span>
    </div>
    <div style="background:#fff;border-radius:0 0 12px 12px;padding:28px 24px;">
      <p style="color:#1c2420;font-size:15px;margin:0 0 16px;">
        <b>${escapeHtml(requesterName)}</b> is asking their
        <b>${escapeHtml(circleName)}</b> circle:
      </p>
      <div style="background:#f2f6f3;border-left:3px solid #217a4b;border-radius:6px;
                  padding:14px 16px;font-style:italic;color:#3d4f46;font-size:15px;margin-bottom:24px;">
        "${escapeHtml(queryText)}"
      </div>
      <a href="${escapeHtml(responseUrl)}"
         style="display:inline-block;background:#217a4b;color:#fff;text-decoration:none;
                font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;">
        Share a recommendation →
      </a>
      <p style="color:#7a9086;font-size:12px;margin-top:24px;line-height:1.6;">
        ${escapeHtml(requesterName)} trusts your taste. This takes 30 seconds and
        helps them out. This link expires in 72 hours.
      </p>
    </div>
    <p style="color:#a8bdaf;font-size:11px;text-align:center;margin-top:16px;">
      Trustnet — recommendations from people you trust
    </p>
  </div></body></html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
