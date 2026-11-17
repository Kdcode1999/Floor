import type { Metadata } from "next";
import { Suspense } from "react";

import { Card } from "@/components/ui";
import { getSpace } from "@/features/join/getSpace";
import { JoinFlow } from "@/features/join/JoinFlow";
import { priceLine } from "@/features/join/logic";
import { backendConfigured } from "@/lib/env";
import { themeFor, themes } from "@/theme/themes";
import { themeVars } from "@/theme/vars";

// What a chat app shows when a mentor shares their join link.
export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const space = await getSpace(slug);
  if (!space) return { title: "Space not found" };
  const description = space.tagline ?? `Join ${space.name} on Floor.`;
  return {
    title: space.name,
    description,
    openGraph: { title: `${space.name} on Floor`, description, type: "website" },
  };
}

/** A space's join page: `/kings-fx`. */
export default function JoinPage({ params }: PageProps<"/[slug]">) {
  return (
    <Suspense fallback={<Shell />}>
      <Join params={params} />
    </Suspense>
  );
}

async function Join({ params }: Pick<PageProps<"/[slug]">, "params">) {
  const { slug } = await params;
  const space = await getSpace(slug);

  if (!space) {
    return (
      <Shell>
        <Card>
          <h1 className="h2">This space isn&apos;t available</h1>
          <p className="body">
            {backendConfigured
              ? "Check the link with whoever sent it to you."
              : "This copy of Floor is not connected to its database yet."}
          </p>
        </Card>
      </Shell>
    );
  }

  return (
    <main className="space" style={themeVars(themeFor(space.theme))}>
      <div className="column">
        <JoinFlow space={space} price={priceLine(space)} />
      </div>
    </main>
  );
}

/** The page's frame in Floor's own look, for the moment before the space is known and when there is none. */
function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <main className="space" style={themeVars(themes.night)}>
      <div className="column">
        <p className="small strong" style={{ paddingTop: 44 }}>
          Floor
        </p>
        {children}
      </div>
    </main>
  );
}
