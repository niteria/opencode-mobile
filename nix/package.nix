{
  lib,
  stdenv,
  nodejs_24,
  npmHooks,
  fetchNpmDeps,
  autoPatchelfHook,
  jdk17,
  bash,
  gradle,
  sdk,
  env,
  src,
}:

stdenv.mkDerivation (finalAttrs: {
  pname = "opencode-mobile-android";
  version = "0.4.15-pr182";
  inherit src env;

  nativeBuildInputs = [
    nodejs_24
    npmHooks.npmConfigHook
    gradle
    jdk17
    autoPatchelfHook
  ];
  buildInputs = [ stdenv.cc.cc.lib ];

  npmDeps = fetchNpmDeps {
    inherit src;
    hash = "sha256-c6YfJUabzAOOvmDBThjN4kraaMyTKHYJRNFIWVaQxWE=";
  };
  npmFlags = [ "--legacy-peer-deps" ];
  npmRebuildFlags = [ "--ignore-scripts" ];
  dontAutoPatchelf = true;

  mitmCache = gradle.fetchDeps {
    pkg = finalAttrs.finalPackage;
    inherit (finalAttrs) pname;
    attrPath = null;
    data = ./gradle-deps.json;
    # AGP executes generated prefab command files without a shebang. Java's
    # ENOEXEC fallback needs /bin/sh, as supplied by the normal Nix sandbox.
    bwrapFlags = ''--ro-bind "$PWD" "$PWD" --dir /bin --ro-bind ${bash}/bin/sh /bin/sh'';
  };

  gradleBuildTask = ":app:assembleRelease";
  gradleUpdateTask = finalAttrs.gradleBuildTask;
  gradleFlags = [
    "-p"
    "android"
    "--max-workers=4"
    "-PreactNativeArchitectures=arm64-v8a"
    "-PopencodeUnsigned=true"
    "-Dorg.gradle.java.home=${jdk17}"
    "-Dorg.gradle.project.android.aapt2FromMavenOverride=${sdk}/build-tools/36.0.0/aapt2"
  ];

  prePatch = ''
    export HOME="$TMPDIR/home"
    mkdir -p "$HOME"
    # The dependency updater's user namespace has no passwd entry. Without
    # this, Java reports user.home="?" and Kotlin's daemon lookup walks a
    # relative path instead of its own cache directory.
    export JAVA_TOOL_OPTIONS="-Duser.home=$HOME"
  '';
  postConfigure = ''
    autoPatchelf node_modules/react-native/sdks/hermesc/linux64-bin/hermesc
  '';

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm run check:versions
    npm run typecheck
    npm test
    runHook postCheck
  '';
  installPhase = ''
    runHook preInstall
    mkdir -p "$out"
    cp android/app/build/outputs/apk/release/app-release-unsigned.apk "$out/opencode-mobile-unsigned.apk"
    runHook postInstall
  '';

  meta = {
    description = "Standalone OpenCode PR 182 ARM64 Android APK (unsigned)";
    license = lib.licenses.mit;
    platforms = [ "x86_64-linux" ];
  };
})
