/**
 * Normalize Argentine phone input to E.164 (+54…).
 * Accepts local (03469… / 3469…), national mobile (9…), or already international.
 * WhatsApp AR mobiles typically use +549 + 10-digit national number.
 */
export function normalizeArE164(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) digits = digits.slice(2);

  if (digits.startsWith("54")) {
    // already country-coded
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
    // Local trunk 0 + area(2–4) + 15 + subscriber → drop 15 (e.g. 01115… → 11…).
    const local15 = digits.match(/^(\d{2,4})15(\d{6,8})$/);
    if (local15) digits = `${local15[1]}${local15[2]}`;
    digits = ensureArMobileCountry(digits);
  } else if (digits.startsWith("9") && digits.length >= 11) {
    digits = `54${digits}`;
  } else {
    digits = ensureArMobileCountry(digits);
  }

  // Insert mobile 9 after 54 when missing (54 + 10 national digits).
  if (digits.startsWith("54") && !digits.startsWith("549") && digits.length === 12) {
    digits = `549${digits.slice(2)}`;
  }

  // WA AR mobiles are +549 + 10-digit national (reject landline / bad trunk parses).
  if (!/^549\d{10}$/.test(digits)) return null;
  return `+${digits}`;
}

function ensureArMobileCountry(national: string): string {
  // 10-digit national (area+number) → assume mobile for WA
  if (/^\d{10}$/.test(national)) return `549${national}`;
  // already has leading 9 + 10 digits
  if (/^9\d{10}$/.test(national)) return `54${national}`;
  return `54${national}`;
}

export function e164ToWaChatId(e164: string): string {
  const digits = e164.replace(/^\+/, "");
  return `${digits}@s.whatsapp.net`;
}
