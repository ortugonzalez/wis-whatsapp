import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({error:"legacy_send_disabled",hint:"Usá /api/v1/messages con consentimiento, aprobación e Idempotency-Key."},{status:410});
}
