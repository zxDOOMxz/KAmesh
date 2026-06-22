const {
  withAppBuildGradle,
  withDangerousMod,
  AndroidConfig,
} = require('expo/config-plugins');
const path = require('path');
const fs = require('fs');

const AAPT_BLOCK = `    aaptOptions {
        additionalParameters "--auto-add-overlay"
    }
    androidResources {
        additionalParameters "--auto-add-overlay"
    }`;

function withAndroidAaptOverlay(config) {
  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      return config;
    }

    if (config.modResults.contents.includes('auto-add-overlay')) {
      return config;
    }

    config.modResults.contents = config.modResults.contents.replace(
      /(\s*android\s*\{)/,
      `$1\n${AAPT_BLOCK}`
    );
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    (config) => {
      const resValuesDir = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/res/values'
      );
      const attrsPath = path.join(resValuesDir, 'attrs.xml');

      if (!fs.existsSync(resValuesDir)) {
        fs.mkdirSync(resValuesDir, { recursive: true });
      }

      if (!fs.existsSync(attrsPath)) {
        fs.writeFileSync(
          attrsPath,
          `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <attr name="actionBarSize" format="dimension" />
</resources>
`
        );
      }

      return config;
    },
  ]);

  return config;
}

module.exports = withAndroidAaptOverlay;
