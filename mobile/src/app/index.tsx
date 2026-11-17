import { StyleSheet, Text, View } from "react-native";

import { themes } from "@/theme/themes";

// Placeholder until the app shell lands. It only proves the project runs and the theme file loads.
const theme = themes.night;

export default function Index() {
  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Text style={[styles.name, { color: theme.text }]}>Floor</Text>
      <Text style={[styles.note, { color: theme.text2 }]}>Foundation build. Screens come next.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 24,
  },
  name: {
    fontSize: 34,
    fontWeight: "600",
    letterSpacing: -0.5,
  },
  note: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
});
