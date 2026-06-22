const { withAppBuildGradle } = require('expo/config-plugins');

function withAndroidAaptOverlay(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      return config;
    }

    if (config.modResults.contents.includes('aaptOptions')) {
      return config;
    }

    config.modResults.contents = config.modResults.contents.replace(
      'androidResources {',
      `aaptOptions {
        additionalParameters "--auto-add-overlay"
    }
    androidResources {`
    );
    return config;
  });
}

module.exports = withAndroidAaptOverlay;
