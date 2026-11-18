import { useState } from "react";
import { Share, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chips } from "@/components/Chips";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { loadSetup, saveSetup, type Setup } from "@/features/manage/api";
import { CURRENCIES, DAY_CHOICES, parseAmount, parseDays, setupProblems, type SetupForm, type SetupProblems } from "@/features/manage/logic";
import { SampleNote } from "@/features/sample/SampleNote";
import { database } from "@/lib/database";
import { joinLink } from "@/lib/env";
import { days, formatPrice } from "@/lib/format";
import { useGoBack } from "@/lib/useGoBack";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/** Price and payment: what VIP costs, how members pay the mentor, the broker offer, and the join link. */
export default function SetupScreen() {
  const { space } = useSpace();
  const setup = useLoad(() => loadSetup(database, space.id), `setup:${space.id}`);

  return (
    <Screen header={<BackHeader title="Price and payment" backLabel="Back to Manage" fallback="/manage" />}>
      {setup.loading ? (
        <Loading />
      ) : setup.error || !setup.data ? (
        <Trouble detail={setup.error} onRetry={setup.reload} />
      ) : (
        <SetupFormView spaceId={space.id} setup={setup.data} />
      )}
    </Screen>
  );
}

function SetupFormView({ spaceId, setup }: { spaceId: string; setup: Setup }) {
  const theme = useTheme();
  const goBack = useGoBack("/manage");
  const [form, setForm] = useState<SetupForm>(setup.form);
  const [problems, setProblems] = useState<SetupProblems>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof SetupForm) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setProblems((current) => ({ ...current, [field]: undefined }));
    setError(null);
  };

  const save = async () => {
    const found = setupProblems(form);
    if (Object.keys(found).length > 0) {
      setProblems(found);
      setError("Check the boxes marked above.");
      return;
    }
    setSaving(true);
    setError(null);
    const problem = await saveSetup(database, spaceId, form);
    setSaving(false);
    if (problem) setError(problem);
    else goBack();
  };

  // What a visitor will read on the join page, as the mentor types.
  const cents = parseAmount(form.price);
  const length = parseDays(form.vipDays);
  const preview =
    form.price.trim() === ""
      ? "No price is shown on your join page."
      : cents !== null && length !== null && /^[A-Z]{3,5}$/.test(form.currency)
        ? `Your join page will say: ${formatPrice(cents, form.currency)} for ${days(length)}`
        : null;
  const link = joinLink(setup.slug);

  return (
    <>
      <Card radius={28} style={styles.card}>
        <Heading title="Your join link" detail="Share it wherever your audience is. People who open it can join." />
        <AppText size={15} line={22} weight="semibold" selectable>
          {link}
        </AppText>
        <Button label="Share link" kind="ghost" size="medium" onPress={() => Share.share({ message: link })} />
        <SampleNote text="this link is a stand-in. A real one opens your join page on the web, where people join and pay." />
        <TextField
          label="One line about your space"
          value={form.tagline}
          onChangeText={set("tagline")}
          error={problems.tagline}
          hint="Shown under your space's name on the join page."
          placeholder="London session, every weekday"
          maxLength={80}
        />
      </Card>

      <Card radius={28} style={styles.card}>
        <Heading title="VIP price" />
        <TextField
          label="Price"
          value={form.price}
          onChangeText={set("price")}
          error={problems.price}
          hint="Leave empty to show no price."
          placeholder="25000"
          inputMode="decimal"
          keyboardType="decimal-pad"
        />
        <View style={styles.group}>
          <Chips label="Currency" options={CURRENCIES.map((value) => ({ value, label: value }))} value={form.currency} onChange={set("currency")} />
          <TextField
            label="Currency"
            value={form.currency}
            onChangeText={(text) => set("currency")(text.toUpperCase().replace(/[^A-Z]/g, ""))}
            error={problems.currency}
            hint="Pick one above, or type another."
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={5}
          />
        </View>
        <View style={styles.group}>
          <Chips
            label="How long VIP lasts"
            options={DAY_CHOICES.map((value) => ({ value: String(value), label: days(value) }))}
            value={form.vipDays}
            onChange={set("vipDays")}
          />
          <TextField
            label="Days of VIP for one payment"
            value={form.vipDays}
            onChangeText={set("vipDays")}
            error={problems.vipDays}
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
        {preview ? (
          <AppText size={13} line={18} color={theme.text2}>
            {preview}
          </AppText>
        ) : null}
      </Card>

      <Card radius={28} style={styles.card}>
        <Heading
          title="How members pay you"
          detail="Members pay you directly, by bank transfer or USDT, and send proof. You approve it under Requests. Floor never touches the money. Only people who have joined see these details."
        />
        <TextField
          label="Payment details"
          value={form.instructions}
          onChangeText={set("instructions")}
          error={problems.instructions}
          hint="Your bank account, your USDT wallet address and network, or anything else a member needs to pay you."
          placeholder={"Bank: Example Bank\nAccount: 0123456789\nName: Kings FX"}
          multiline
          maxLength={1000}
        />
        <TextField
          label="Payment link"
          value={form.paymentLink}
          onChangeText={set("paymentLink")}
          error={problems.paymentLink}
          hint="Optional. A page where members can pay you."
          placeholder="https://"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          keyboardType="url"
        />
      </Card>

      <Card radius={28} style={styles.card}>
        <Heading
          title="Free VIP with your broker"
          detail="Members who open an account through your link and send proof get VIP free. Leave the link empty to switch this off."
        />
        <TextField
          label="Broker's name"
          value={form.brokerName}
          onChangeText={set("brokerName")}
          error={problems.brokerName}
          maxLength={40}
          autoCorrect={false}
        />
        <TextField
          label="Your broker link"
          value={form.brokerLink}
          onChangeText={set("brokerLink")}
          error={problems.brokerLink}
          placeholder="https://"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          keyboardType="url"
        />
        <TextField
          label="Days of VIP for a broker account"
          value={form.brokerDays}
          onChangeText={set("brokerDays")}
          error={problems.brokerDays}
          inputMode="numeric"
          keyboardType="number-pad"
          maxLength={4}
        />
      </Card>

      <View style={styles.finish}>
        <Button label="Save" busy={saving} onPress={save} />
        <ErrorLine text={error} />
      </View>
    </>
  );
}

function Heading({ title, detail }: { title: string; detail?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.heading}>
      <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
        {title}
      </AppText>
      {detail ? (
        <AppText size={13} line={18} color={theme.text2}>
          {detail}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, padding: 22 },
  heading: { gap: 2 },
  group: { gap: 10 },
  finish: { gap: 8, marginTop: 4 },
});
