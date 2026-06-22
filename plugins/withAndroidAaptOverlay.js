const { withAppBuildGradle } = require('expo/config-plugins');

const AAPT_BLOCK = `    aaptOptions {
        additionalParameters "--auto-add-overlay"
    }
    androidResources {
        additionalParameters "--auto-add-overlay"
    }`;

function withAndroidAaptOverlay(config) {
  return withAppBuildGradle(config, (config) => {
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
}

module.exports = withAndroidAaptOverlay;
