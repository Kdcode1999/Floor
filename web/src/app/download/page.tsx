import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { Card } from "@/components/ui";
import { APP_URL } from "@/lib/env";
import { androidRelease } from "@/server/android";
import { themes } from "@/theme/themes";
import { themeVars } from "@/theme/vars";

export const metadata: Metadata = { title: "Get Floor" };

/** Where people get Floor on their phone: the Android app to download, and the iPhone web app. */
export default function DownloadPage() {
  return (
    <main className="space" style={themeVars(themes.night)}>
      <div className="column">
        <h1 className="h1" style={{ paddingTop: 44 }}>
          Get Floor
        </h1>

        <Suspense
          fallback={
            <Card>
              <h2 className="h2">Android</h2>
              <p className="body">One moment…</p>
            </Card>
          }
        >
          <Android />
        </Suspense>

        <Card>
          <h2 className="h2">iPhone</h2>
          {APP_URL ? (
            <>
              <a className="btn btn-ghost" href={APP_URL}>
                Open Floor
              </a>
              <ol className="body steps">
                <li>Open Floor in Safari and sign in with your email.</li>
                <li>Tap Share, then Add to Home Screen.</li>
                <li>
                  Open Floor from your Home Screen. It runs full screen, and you
                  can turn on alerts there.
                </li>
              </ol>
            </>
          ) : (
            <p className="body">
              Floor for iPhone is almost ready. Check back soon.
            </p>
          )}
        </Card>
      </div>
    </main>
  );
}

/** The Android card, read when the page is asked for, so a new release shows without a new build. */
async function Android() {
  await connection();
  const release = androidRelease();
  return (
    <Card>
      <h2 className="h2">Android</h2>
      {release ? (
        <>
          <a className="btn btn-primary" href={release.url} download>
            Download Floor for Android
          </a>
          <p className="small">
            Version {release.versionName}
            {release.notes ? `. ${release.notes}` : "."}
          </p>
          <ol className="body steps">
            <li>Tap the button above. Your phone downloads the app.</li>
            <li>
              Open the download. If your phone asks, allow installing apps from
              your browser: Floor is not in the Play Store, so your phone checks
              with you first.
            </li>
            <li>Tap Install, then Open. Sign in with your email.</li>
          </ol>
          <p className="small">
            Floor tells you inside the app when a new version is ready.
          </p>
        </>
      ) : (
        <p className="body">
          The Android app is almost ready. Check back soon.
        </p>
      )}
    </Card>
  );
}
