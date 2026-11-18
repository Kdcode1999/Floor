import { connection } from "next/server";

import { androidRelease } from "@/server/android";

/** The current Android release, which the app checks when it opens. Anyone may ask. */
export async function GET() {
  // Read when asked, so a new release is offered without a new build.
  await connection();
  const release = androidRelease();
  return Response.json(release ?? { versionCode: 0 }, {
    status: release ? 200 : 404,
    headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
}
