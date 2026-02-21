#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function safeRequire(name) {
  try {
    return require(name);
  } catch (err) {
    return null;
  }
}

const xcode = safeRequire('xcode');

const args = parseArgs(process.argv.slice(2));

if (!args.name || !args['bundle-id']) {
  printUsage();
  process.exit(1);
}

const appName = args.name;
const bundleId = args['bundle-id'];
const slug = args.slug || toKebab(appName);
const scheme = args.scheme || slug;
const androidPackage = args['android-package'] || bundleId;
const groupId = args['group-id'] || `group.${bundleId}`;
const npmName = args['npm-name'] || slug;
const widgetPackage = `${androidPackage}.widget`;

const root = path.resolve(__dirname, '..');
const updated = [];

updateJson('app.json', (data) => {
  if (!data.expo) data.expo = {};
  data.expo.name = appName;
  data.expo.slug = slug;
  data.expo.scheme = scheme;

  data.expo.ios = data.expo.ios || {};
  data.expo.ios.bundleIdentifier = bundleId;
  data.expo.ios.entitlements = data.expo.ios.entitlements || {};
  data.expo.ios.entitlements['com.apple.security.application-groups'] = [groupId];

  data.expo.android = data.expo.android || {};
  data.expo.android.package = androidPackage;
});

updateJson('package.json', (data) => {
  data.name = npmName;
});

replaceInFile('widgets/ios/MyGardenWidget.swift', (text) =>
  text
    .replace(/widgetAppName = ".*?"/, `widgetAppName = "${appName}"`)
    .replace(/widgetAppScheme = ".*?"/, `widgetAppScheme = "${scheme}"`)
    .replace(/widgetAppGroupId = ".*?"/, `widgetAppGroupId = "${groupId}"`)
);

replaceInFile('modules/widget-bridge/ios/WidgetBridge.swift', (text) =>
  text.replace(/suiteName:\s*".*?"/, `suiteName: "${groupId}"`)
);

replaceInFileIfExists('ios/MyGarden/WidgetBridge.swift', (text) =>
  text.replace(/suiteName:\s*".*?"/, `suiteName: "${groupId}"`)
);

replaceInFileIfExists('ios/MyGardenWidget/MyGardenWidget.swift', (text) =>
  text
    .replace(/widgetAppName = ".*?"/, `widgetAppName = "${appName}"`)
    .replace(/widgetAppScheme = ".*?"/, `widgetAppScheme = "${scheme}"`)
    .replace(/widgetAppGroupId = ".*?"/, `widgetAppGroupId = "${groupId}"`)
);

replaceInFileIfExists('ios/MyGarden/Info.plist', (text) =>
  text
    .replace(
      /<key>CFBundleDisplayName<\/key>\s*<string>.*?<\/string>/s,
      `<key>CFBundleDisplayName</key>\n    <string>${escapeXml(appName)}</string>`
    )
    .replace(/<string>my-garden<\/string>/g, `<string>${scheme}</string>`)
    .replace(/<string>com\.mygarden\.app<\/string>/g, `<string>${bundleId}</string>`)
);

replaceInFileIfExists('ios/MyGardenWidget/MyGardenWidget-Info.plist', (text) =>
  text.replace(
    /<key>CFBundleDisplayName<\/key>\s*<string>.*?<\/string>/s,
    `<key>CFBundleDisplayName</key>\n    <string>${escapeXml(appName)}Widget</string>`
  )
);

replaceInFileIfExists('ios/MyGarden/MyGarden.entitlements', (text) =>
  text.replace(/<string>group\.[^<]+<\/string>/g, `<string>${groupId}</string>`)
);

replaceInFileIfExists('ios/MyGardenWidget/MyGardenWidget.entitlements', (text) =>
  text.replace(/<string>group\.[^<]+<\/string>/g, `<string>${groupId}</string>`)
);

updateIosXcodeProject(bundleId);

replaceInFile('widgets/android/PlantWidgetProvider.kt', (text) =>
  text
    .replace(/package\s+com\.mygarden\.app\.widget/g, `package ${widgetPackage}`)
    .replace(/com\.mygarden\.app\.widget/g, widgetPackage)
    .replace(/com\.mygarden\.app\./g, `${androidPackage}.`)
);

replaceInFile('modules/widget-bridge/android/WidgetBridgeModule.kt', (text) =>
  text
    .replace(/package\s+com\.mygarden\.app\.widget/g, `package ${widgetPackage}`)
    .replace(/com\.mygarden\.app\.widget/g, widgetPackage)
);

replaceInFile('modules/widget-bridge/android/WidgetBridgePackage.kt', (text) =>
  text
    .replace(/package\s+com\.mygarden\.app\.widget/g, `package ${widgetPackage}`)
    .replace(/com\.mygarden\.app\.widget/g, widgetPackage)
);

replaceInFile('widgets/android/res/values/strings.xml', (text) =>
  text.replace(
    /<string name="app_name">.*?<\/string>/,
    `<string name="app_name">${escapeXml(appName)}</string>`
  )
);

replaceInFileIfExists('android/app/src/main/res/values/strings.xml', (text) =>
  text.replace(
    /<string name="app_name">.*?<\/string>/,
    `<string name="app_name">${escapeXml(appName)}</string>`
  )
);

replaceInFileIfExists('android/app/src/main/AndroidManifest.xml', (text) =>
  text.replace(/android:scheme="my-garden"/g, `android:scheme="${scheme}"`)
);

replaceInFileIfExists('android/app/build.gradle', (text) =>
  text
    .replace(/namespace\s+'[^']+'/g, `namespace '${androidPackage}'`)
    .replace(/applicationId\s+'[^']+'/g, `applicationId '${androidPackage}'`)
);

updateAndroidPackage(androidPackage);

replaceInFile('app/index.tsx', (text) => text.replace(/Richfarm/g, appName));
replaceInFile('components/ui/LoadingScreen.tsx', (text) => text.replace(/Richfarm/g, appName));

console.log('Updated files:');
for (const file of updated) {
  console.log(`- ${file}`);
}

function updateJson(relPath, updater) {
  const fullPath = path.join(root, relPath);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const data = JSON.parse(raw);
  updater(data);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n');
  updated.push(relPath);
}

function replaceInFile(relPath, replacer) {
  const fullPath = path.join(root, relPath);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const next = replacer(raw);
  if (next !== raw) {
    fs.writeFileSync(fullPath, next);
    updated.push(relPath);
  }
}

function replaceInFileIfExists(relPath, replacer) {
  const fullPath = path.join(root, relPath);
  if (!fs.existsSync(fullPath)) return;
  const raw = fs.readFileSync(fullPath, 'utf8');
  const next = replacer(raw);
  if (next !== raw) {
    fs.writeFileSync(fullPath, next);
    updated.push(relPath);
  }
}

function updateIosXcodeProject(newBundleId) {
  if (!xcode) return;
  const projectPath = path.join(root, 'ios/MyGarden.xcodeproj/project.pbxproj');
  if (!fs.existsSync(projectPath)) return;

  const project = xcode.project(projectPath);
  project.parseSync();
  project.updateBuildProperty('PRODUCT_BUNDLE_IDENTIFIER', newBundleId, null, 'MyGarden');
  const widgetTargets = ['MyGardenWidget', '"MyGardenWidget"'];
  for (const target of widgetTargets) {
    project.updateBuildProperty('PRODUCT_BUNDLE_IDENTIFIER', `${newBundleId}.widget`, null, target);
    project.updateBuildProperty('CODE_SIGN_ENTITLEMENTS', 'MyGardenWidget/MyGardenWidget.entitlements', null, target);
    project.updateBuildProperty('SWIFT_VERSION', '5.0', null, target);
    project.updateBuildProperty('IPHONEOS_DEPLOYMENT_TARGET', '15.1', null, target);
    project.updateBuildProperty('TARGETED_DEVICE_FAMILY', '"1,2"', null, target);
  }
  fs.writeFileSync(projectPath, project.writeSync());
  updated.push('ios/MyGarden.xcodeproj/project.pbxproj');
}

function updateAndroidPackage(newPackage) {
  const javaRoot = path.join(root, 'android/app/src/main/java');
  if (!fs.existsSync(javaRoot)) return;

  const mainApplication = findFileByName(javaRoot, 'MainApplication.kt');
  if (!mainApplication) return;

  const content = fs.readFileSync(mainApplication, 'utf8');
  const match = content.match(/package\s+([a-zA-Z0-9_.]+)/);
  if (!match) return;

  const oldPackage = match[1];
  if (oldPackage === newPackage) return;

  const oldDir = path.join(javaRoot, oldPackage.replace(/\./g, '/'));
  const newDir = path.join(javaRoot, newPackage.replace(/\./g, '/'));

  if (fs.existsSync(oldDir)) {
    fs.mkdirSync(path.dirname(newDir), { recursive: true });
    fs.renameSync(oldDir, newDir);
    updated.push(`android/app/src/main/java/${newPackage.replace(/\./g, '/')}`);

    const files = walkFiles(newDir, (file) => file.endsWith('.kt'));
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const next = content.replace(new RegExp(oldPackage.replace(/\./g, '\\.'), 'g'), newPackage);
      if (next !== content) {
        fs.writeFileSync(file, next);
      }
    }
  }
}

function walkFiles(dir, predicate) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(fullPath, predicate));
    } else if (!predicate || predicate(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

function findFileByName(dir, fileName) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileByName(fullPath, fileName);
      if (found) return found;
    } else if (entry.isFile() && entry.name === fileName) {
      return fullPath;
    }
  }
  return null;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function toKebab(input) {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeXml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function printUsage() {
  console.log('Usage:');
  console.log('  node scripts/init-app.js --name "My App" --bundle-id "com.example.app"');
  console.log('');
  console.log('Optional:');
  console.log('  --slug "my-app"');
  console.log('  --scheme "my-app"');
  console.log('  --android-package "com.example.app"');
  console.log('  --group-id "group.com.example.app"');
  console.log('  --npm-name "my-app"');
}
