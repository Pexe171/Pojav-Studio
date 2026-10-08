import { readFile, writeFile, cp, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const overlay = fileURLToPath(new URL('../integrations/amethyst/overlay/', import.meta.url));
export async function applyOverlay(root, config) {
  const module = join(root, 'app_pojavlauncher');
  await cp(overlay, module, { recursive: true });
  const configPath = join(module, 'src/main/assets/studio-config.json');
  await mkdir(join(module, 'src/main/assets'), { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify({ schemaVersion: 1, apiUrl: config.apiUrl, name: config.name }),
  );
  const change = async (path, needle, replacement) => {
    const text = (await readFile(path, 'utf8')).replaceAll('\r\n', '\n');
    if (!text.includes(needle)) throw new Error(`Base Android mudou: ${path}`);
    await writeFile(path, text.replace(needle, replacement));
  };
  await change(
    join(module, 'src/main/AndroidManifest.xml'),
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />',
  );
  await change(
    join(module, 'src/main/AndroidManifest.xml'),
    '<activity\n            android:name=".MissingStorageActivity"',
    `<service android:name=".studio.TelemetryJobService" android:permission="android.permission.BIND_JOB_SERVICE" android:exported="false" />\n        <provider android:name="androidx.core.content.FileProvider" android:authorities="${config.applicationId}.studio.updates" android:exported="false" android:grantUriPermissions="true"><meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/studio_update_paths" /></provider>\n        <activity android:name=".studio.StudioActivity" android:exported="false" /><activity android:name=".studio.StudioExploreActivity" android:exported="false" />\n        <activity\n            android:name=".MissingStorageActivity"`,
  );
  await change(
    join(module, 'src/main/java/net/kdt/pojavlaunch/TestStorageActivity.java'),
    'new Intent(this, LauncherActivity.class)',
    'new Intent(this, net.kdt.pojavlaunch.studio.StudioActivity.class)',
  );
  await change(
    join(module, 'src/main/java/net/kdt/pojavlaunch/fragments/SelectAuthFragment.java'),
    'mLocalButton.setOnClickListener(v -> hasNoOnlineProfileDialog(requireActivity(), () -> Tools.swapFragment(requireActivity(), LocalLoginFragment.class, LocalLoginFragment.TAG, null)));',
    'mLocalButton.setOnClickListener(v -> Tools.swapFragment(requireActivity(), LocalLoginFragment.class, LocalLoginFragment.TAG, null));',
  );
  await change(
    join(module, 'src/main/java/net/kdt/pojavlaunch/fragments/LocalLoginFragment.java'),
    '        // This is overkill but meh\n        if (!hasOnlineProfile()){\n            Tools.swapFragment(requireActivity(), MainMenuFragment.class, MainMenuFragment.TAG, null);\n        }',
    '        // Local profiles are independent of Microsoft sign-in.',
  );
  await change(
    join(module, 'src/main/java/net/kdt/pojavlaunch/tasks/MinecraftDownloader.java'),
    'private boolean isLocalProfile = false;',
    `private boolean isLocalProfile = false;
    /** Prepare game assets before an instance is marked available offline. */
    public void prepareStudio(Activity activity, String versionName) throws Exception {
        if (Tools.isDemoProfile(activity) || net.kdt.pojavlaunch.PojavProfile.getCurrentProfileContent(activity, null) == null) throw new IOException("Selecione um perfil local ou Microsoft no launcher antes de preparar o jogo.");
        isOnline = Tools.isOnline(activity);
        if (!isOnline) throw new IOException("A primeira instalação do Minecraft precisa de internet.");
        JMinecraftVersionList versions = Tools.GLOBAL_GSON.fromJson(DownloadUtils.downloadString(LauncherPreferences.PREF_VERSION_REPOS), JMinecraftVersionList.class);
        net.kdt.pojavlaunch.extra.ExtraCore.setValue(net.kdt.pojavlaunch.extra.ExtraConstants.RELEASE_TABLE, versions);
        downloadGame(activity, AsyncMinecraftDownloader.getListedVersion(versionName), versionName);
    }
`,
  );
  await change(
    join(module, 'src/main/java/net/kdt/pojavlaunch/Tools.java'),
    '    public static boolean hasOnlineProfile(){',
    `    public static boolean hasPlayableProfile(){
        for (MinecraftAccount account : getAllProfiles()) {
            if (!account.isDemo()) return true;
        }
        return false;
    }
    public static boolean hasOnlineProfile(){`,
  );
  await change(
    join(module, 'src/main/java/net/kdt/pojavlaunch/Tools.java'),
    'if (hasOnlineProfile() && !Tools.isDemoProfile(activity)){',
    'if (hasPlayableProfile() && !Tools.isDemoProfile(activity)){',
  );
  for (const fragment of [
    'MainMenuFragment',
    'ProfileTypeSelectFragment',
    'ModpackCreateFragment',
  ]) {
    const path = join(module, `src/main/java/net/kdt/pojavlaunch/fragments/${fragment}.java`);
    const text = (await readFile(path, 'utf8')).replaceAll(
      'hasOnlineProfile',
      'hasPlayableProfile',
    );
    await writeFile(path, text);
  }
  await change(
    join(module, 'src/main/java/net/kdt/pojavlaunch/tasks/MinecraftDownloader.java'),
    'if(isLocalProfile || !isOnline) {',
    'if(!isOnline) {',
  );
  // Keep the original crash writer and offer opt-in reports on the next library opening.
  await change(
    join(module, 'src/main/java/net/kdt/pojavlaunch/utils/JREUtils.java'),
    'Logger.appendToLog("Java Exit code: " + exitCode);',
    'Logger.appendToLog("Java Exit code: " + exitCode);\n        net.kdt.pojavlaunch.studio.Diagnostics.recordGameExit(activity, exitCode);',
  );
  const main = join(module, 'src/main/java/net/kdt/pojavlaunch/MainActivity.java');
  // The game runs in :game; static registration in the launcher process does not reach it.
  await change(
    main,
    'super.onCreate(savedInstanceState);',
    'super.onCreate(savedInstanceState);\n        try { net.kdt.pojavlaunch.studio.Telemetry.register(getApplication(), new net.kdt.pojavlaunch.studio.StudioApi(this)); } catch (Exception ignored) {}',
  );
  await change(
    main,
    'private ControlLayout mControlLayout;',
    'private ControlLayout mControlLayout;\n    private net.kdt.pojavlaunch.studio.KeyboardControls studioKeyboard;',
  );
  await change(
    main,
    'mControlLayout.setMenuListener(this);',
    'mControlLayout.setMenuListener(this);\n        studioKeyboard = new net.kdt.pojavlaunch.studio.KeyboardControls(this, mControlLayout, mDrawerPullButton);',
  );
  await change(
    main,
    'mControlLayout.toggleControlVisible();',
    'mControlLayout.toggleControlVisible();\n        if (studioKeyboard != null) studioKeyboard.refresh();',
  );
  // Activity-scoped lifecycle observer unregisters the input listener when destroyed.
  let gradle = await readFile(join(module, 'build.gradle'), 'utf8');
  gradle = gradle.replace(
    "resValue 'string', 'curseforge_api_key', getCFApiKey()",
    "resValue 'string', 'curseforge_api_key', 'DUMMY'",
  );
  const quoted = (x) =>
    `'${String(x).replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', ' ').replaceAll('\r', ' ')}'`;
  gradle += `\n// Studio single-launcher build; no provider credentials are embedded.\nandroid {\n defaultConfig { applicationId ${quoted(config.applicationId)}; versionCode ${config.versionCode}; versionName ${quoted(config.versionName)} }\n signingConfigs { studio { storeFile file(${quoted(config.keystore)}); storePassword System.getenv('APK_KEYSTORE_PASSWORD'); keyAlias ${quoted(config.keyAlias)}; keyPassword System.getenv('APK_KEY_PASSWORD') ?: System.getenv('APK_KEYSTORE_PASSWORD') } }\n buildTypes { release { signingConfig signingConfigs.studio; resValue 'string', 'app_name', ${quoted(config.name)}; resValue 'string', 'app_short_name', ${quoted(config.name)}; resValue 'string', 'application_package', ${quoted(config.applicationId)}; resValue 'string', 'storageProviderAuthorities', ${quoted(config.applicationId + '.scoped.gamefolder')}; resValue 'string', 'shareProviderAuthority', ${quoted(config.applicationId + '.scoped.controlfolder')} } }\n}\n`;
  await writeFile(join(module, 'build.gradle'), gradle);
  const properties = join(root, 'gradle.properties');
  await writeFile(
    properties,
    (await readFile(properties, 'utf8')) +
      '\norg.gradle.java.installations.fromEnv=JAVA_HOME,JDK8_HOME\n',
  );
}
