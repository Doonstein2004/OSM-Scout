const { withMainActivity } = require('@expo/config-plugins');

module.exports = function withEdgeToEdge(config) {
  return withMainActivity(config, (config) => {
    const { language } = config.modResults;
    let contents = config.modResults.contents;

    if (language !== 'kotlin') {
      return config;
    }

    // Skip if already applied
    if (contents.includes('WindowCompat.setDecorFitsSystemWindows')) {
      return config;
    }

    // Add imports after the package declaration block
    if (!contents.includes('import android.os.Bundle')) {
      contents = contents.replace(
        /(import com\.facebook\.react\.ReactActivity)/,
        'import android.os.Bundle\nimport androidx.core.view.WindowCompat\n$1'
      );
    } else if (!contents.includes('import androidx.core.view.WindowCompat')) {
      contents = contents.replace(
        /(import android\.os\.Bundle)/,
        '$1\nimport androidx.core.view.WindowCompat'
      );
    }

    // Inject onCreate before the first override fun
    contents = contents.replace(
      /(class MainActivity[^{]*\{)/,
      `$1\n\n  override fun onCreate(savedInstanceState: Bundle?) {\n    WindowCompat.setDecorFitsSystemWindows(window, false)\n    super.onCreate(savedInstanceState)\n  }`
    );

    config.modResults.contents = contents;
    return config;
  });
};
