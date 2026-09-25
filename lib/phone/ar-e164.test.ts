import { normalizeArE164 } from "@/lib/phone/ar-e164";

function assertEq(actual: string | null, expected: string | null, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

assertEq(normalizeArE164("+54 9 3469 692672"), "+5493469692672", "intl spaced");
assertEq(normalizeArE164("5493469692672"), "+5493469692672", "digits intl");
assertEq(normalizeArE164("03469692672"), "+5493469692672", "local 0");
assertEq(normalizeArE164("3469692672"), "+5493469692672", "10 national");
assertEq(normalizeArE164("0111534567890"), "+5491134567890", "local 0+11+15");
assertEq(normalizeArE164("01115 3456-7890"), "+5491134567890", "local spaced 15");
assertEq(normalizeArE164("93469692672"), "+5493469692672", "national 9+10");
assertEq(normalizeArE164("abc"), null, "garbage");
assertEq(normalizeArE164("123"), null, "too short");
assertEq(normalizeArE164("54111534567890"), null, "reject non-mobile 54");

console.log("ar-e164 ok");
