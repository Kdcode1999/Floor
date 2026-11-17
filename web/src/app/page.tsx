import { Card } from "@/components/ui";
import { themes } from "@/theme/themes";
import { themeVars } from "@/theme/vars";

/** Floor's own front page. Short on purpose: people arrive on a mentor's join link, not here. */
export default function HomePage() {
  return (
    <main className="space" style={themeVars(themes.night)}>
      <div className="column">
        <h1 className="h1" style={{ paddingTop: 44 }}>
          Floor
        </h1>
        <p className="body">One home for a trading mentor&apos;s community.</p>
        <Card>
          <h2 className="h2">Joining a mentor?</h2>
          <p className="body">Open the join link they gave you. It takes you to their space.</p>
        </Card>
        <Card>
          <h2 className="h2">Running a community?</h2>
          <p className="body">
            Get the Floor app, sign in with your email and start your space. Your members get posts, lessons,
            groups and live sessions in one place, and they pay you directly.
          </p>
        </Card>
        <p className="small center">
          Floor does not check or vouch for what a mentor claims. Trading can lose money.
        </p>
      </div>
    </main>
  );
}
