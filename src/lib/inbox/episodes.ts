/**
 * "Kutish epizodi" — mijozning javob talab qiladigan birinchi xabaridan
 * xodimning mazmunli javobigacha bo'lgan oraliq. Ham joriy kutish taymeri,
 * ham hisobotdagi javob tezligi shu yagona funksiyadan hisoblanadi.
 */
export type EpisodeMessage = {
  id: string;
  direction: string;
  authorType: string;
  authorUserId: string | null;
  kind: string;
  needsReply: boolean;
  sentAt: Date;
  deletedAt: Date | null;
  deliveryStatus: string | null;
};

export type Episode = {
  startAt: Date;
  startMessageId: string;
  customerMessages: number;
  endAt: Date | null;
  outcome: "OPEN" | "REPLIED" | "CLOSED_NO_REPLY";
  replyMessageId: string | null;
  responderUserId: string | null;
  responderKnown: boolean;
};

export function isSubstantiveStaffReply(m: EpisodeMessage): boolean {
  return (
    m.direction === "OUT" &&
    (m.authorType === "STAFF_PANEL" || m.authorType === "EXTERNAL_UNKNOWN") &&
    m.kind !== "REACTION" &&
    !m.deletedAt &&
    (m.deliveryStatus === null || m.deliveryStatus === "SENT")
  );
}

export function buildEpisodes(messages: EpisodeMessage[], closeTimes: Date[]): Episode[] {
  type Item = { at: number; msg?: EpisodeMessage; close?: true };
  const items: Item[] = [
    ...messages.map((msg) => ({ at: msg.sentAt.getTime(), msg })),
    ...closeTimes.map((d) => ({ at: d.getTime(), close: true as const })),
  ].sort((a, b) => a.at - b.at);

  const episodes: Episode[] = [];
  let open: Episode | null = null;
  for (const item of items) {
    if (item.close) {
      if (open) {
        open.endAt = new Date(item.at);
        open.outcome = "CLOSED_NO_REPLY";
        open = null;
      }
      continue;
    }
    const m = item.msg!;
    if (m.direction === "IN") {
      if (m.deletedAt || !m.needsReply) continue;
      if (open) {
        open.customerMessages += 1; // ketma-ket xabarlar taymerni nolga tushirmaydi
      } else {
        open = {
          startAt: m.sentAt,
          startMessageId: m.id,
          customerMessages: 1,
          endAt: null,
          outcome: "OPEN",
          replyMessageId: null,
          responderUserId: null,
          responderKnown: false,
        };
        episodes.push(open);
      }
    } else if (open && isSubstantiveStaffReply(m)) {
      open.endAt = m.sentAt;
      open.outcome = "REPLIED";
      open.replyMessageId = m.id;
      open.responderUserId = m.authorType === "STAFF_PANEL" ? m.authorUserId : null;
      open.responderKnown = m.authorType === "STAFF_PANEL" && !!m.authorUserId;
      open = null;
    }
  }
  return episodes;
}
