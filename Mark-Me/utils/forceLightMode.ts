import { Appearance, Text, TextInput, StatusBar as RNStatusBar } from "react-native";

export function forceLightMode() {
  // Always light mode
  Appearance.setColorScheme?.("light");

  // Default text color (dark on white)
  const TextAny = Text as any;
  if (TextAny.defaultProps == null) {
    TextAny.defaultProps = {};
  }
  TextAny.defaultProps.style = [{ color: "#000" }, TextAny.defaultProps.style];

  // Default TextInput styles
  const TextInputAny = TextInput as any;
  if (TextInputAny.defaultProps == null) {
    TextInputAny.defaultProps = {};
  }
  TextInputAny.defaultProps.placeholderTextColor = "#666";
  TextInputAny.defaultProps.style = [
    { color: "#000", backgroundColor: "#fff" },
    TextInputAny.defaultProps.style,
  ];

  // Force light status bar
  RNStatusBar.setBarStyle("dark-content", true);
}
