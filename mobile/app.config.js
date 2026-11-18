// Everything about the app is in app.json. This file adds one thing app.json cannot say:
// "use google-services.json if it is there". Android alerts need that file (docs/SETUP.md),
// and a build with the setting but without the file fails, so the setting is only added
// once the file exists.

const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  // On Expo's build servers the file can also arrive as a file variable of this name.
  const file = process.env.GOOGLE_SERVICES_JSON || path.join(__dirname, "google-services.json");
  if (!fs.existsSync(file)) return config;
  return { ...config, android: { ...config.android, googleServicesFile: file } };
};
