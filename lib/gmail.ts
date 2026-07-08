import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN,
});

export const gmail = google.gmail({ version: "v1", auth: oauth2Client });

export const GMAIL_USER = process.env.GMAIL_USER!;

export function buildRawEmail(params: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): string {
  const lines = [
    `From: DTECNOC <${GMAIL_USER}>`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
  ];
  if (params.replyTo) lines.push(`Reply-To: ${params.replyTo}`);
  lines.push("", params.html);
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

export async function sendGmail(params: {
  to: string;
  subject: string;
  html: string;
  threadId?: string;
}): Promise<{ messageId: string; threadId: string }> {
  const raw = buildRawEmail({ to: params.to, subject: params.subject, html: params.html });

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      ...(params.threadId ? { threadId: params.threadId } : {}),
    },
  });

  return {
    messageId: res.data.id!,
    threadId: res.data.threadId!,
  };
}

type GmailPart = { mimeType?: string | null; body?: { data?: string | null } | null; parts?: GmailPart[] | null };

export function extractBodyFromPayload(payload: GmailPart): string {
  // Direct body (non-multipart)
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  // Recurse into nested parts
  for (const part of payload.parts ?? []) {
    const found = extractBodyFromPayload(part);
    if (found) return found;
  }
  // Fallback: bare body data (some simple emails)
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  return "";
}

/**
 * Quita el texto citado de una respuesta de correo (la respuesta va arriba; debajo
 * queda el original citado con ">" y una línea de atribución "El <fecha>, X escribió:").
 * Devuelve solo el texto que el proveedor escribió.
 */
export function stripQuotedReply(body: string): string {
  const kept: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (line.trimStart().startsWith(">")) break; // inicio del bloque citado
    kept.push(line);
  }
  // Quitar líneas de atribución al final (pueden venir envueltas en 2 líneas)
  while (kept.length) {
    const last = kept[kept.length - 1].trim();
    if (
      last === "" ||
      /escribi[oó]:$/i.test(last) ||
      /wrote:$/i.test(last) ||
      /^(El|On)\s.+\d/.test(last)
    ) {
      kept.pop();
    } else break;
  }
  return kept.join("\n").trim();
}

export async function getEmailBody(messageId: string): Promise<string> {
  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  return extractBodyFromPayload((msg.data.payload ?? {}) as GmailPart);
}

export async function getMessagesByThread(threadId: string) {
  const thread = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });
  return thread.data.messages ?? [];
}

export async function registerGmailWatch(): Promise<{ historyId: string; expiration: string }> {
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: process.env.GMAIL_PUBSUB_TOPIC!,
      labelIds: ["INBOX"],
      labelFilterBehavior: "INCLUDE",
    },
  });
  return {
    historyId: res.data.historyId!,
    expiration: res.data.expiration!,
  };
}
