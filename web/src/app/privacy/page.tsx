import type { Metadata } from "next";

import { Card } from "@/components/ui";
import { themes } from "@/theme/themes";
import { themeVars } from "@/theme/vars";

export const metadata: Metadata = { title: "Privacy" };

/** Placeholder until the launch pages are written. See docs/STATUS.md, Launch. */
export default function PrivacyPage() {
  return (
    <main className="space" style={themeVars(themes.night)}>
      <div className="column">
        <h1 className="h1" style={{ paddingTop: 44 }}>
          Privacy
        </h1>
        <Card>
          <p className="body">The privacy policy is being written and will be here before Floor opens to the public.</p>
        </Card>
      </div>
    </main>
  );
}
