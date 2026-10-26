{
  description = "OpenCode Mobile Android builds and development toolchain";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/46db2e09e1d3f113a13c0d7b81e2f221c63b8ce9";

  outputs =
    { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      toolchain =
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config = {
              allowUnfree = true;
              android_sdk.accept_license = true;
            };
          };
          android = pkgs.androidenv.composeAndroidPackages {
            platformVersions = [ "36" ];
            buildToolsVersions = [
              "35.0.0"
              "36.0.0"
            ];
            includeNDK = true;
            ndkVersions = [ "27.1.12297006" ];
            cmakeVersions = [ "3.22.1" ];
          };
          sdk = "${android.androidsdk}/libexec/android-sdk";
          gradle =
            (pkgs.gradle-packages.mkGradle {
              version = "8.14.3";
              hash = "sha256-vXEQIhNJMGCVbsIp2Ua+7lcVjb2J0OYrkbyg+ixfNTE=";
              defaultJava = pkgs.jdk17;
            }).wrapped;
          env = {
            ANDROID_HOME = sdk;
            ANDROID_SDK_ROOT = sdk;
            JAVA_HOME = "${pkgs.jdk17}";
            EXPO_NO_TELEMETRY = "1";
            SENTRY_DISABLE_AUTO_UPLOAD = "true";
            SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD = "true";
          };
          apk = pkgs.callPackage ./nix/package.nix {
            inherit gradle sdk env;
            src = self;
          };
        in
        {
          inherit
            pkgs
            android
            sdk
            gradle
            env
            apk
            ;
        };
    in
    {
      packages = forAllSystems (
        system:
        let
          t = toolchain system;
        in
        {
          default = t.apk;
          apk = t.apk;
          npm-deps = t.apk.npmDeps;
          android-sdk = t.android.androidsdk;
        }
      );

      apps = forAllSystems (
        system:
        let
          t = toolchain system;
          sign = t.pkgs.writeShellApplication {
            name = "opencode-sign-apk";
            runtimeInputs = [ t.pkgs.coreutils ];
            runtimeEnv = t.env;
            text = builtins.readFile ./scripts/sign-android-apk.sh;
          };
        in
        {
          sign-apk = {
            type = "app";
            program = "${sign}/bin/opencode-sign-apk";
            meta.description = "Sign the APK using the local fork signing key";
          };
          update-gradle-deps = {
            type = "app";
            program = "${t.apk.mitmCache.updateScript}";
            meta.description = "Refresh the locked Gradle dependencies";
          };
        }
      );

      devShells = forAllSystems (
        system:
        let
          t = toolchain system;
          packages = [
            t.gradle
            t.pkgs.jdk17
            t.pkgs.nodejs_24
            t.pkgs.python3
            t.pkgs.pkg-config
          ];
          emulator = t.pkgs.androidenv.composeAndroidPackages {
            platformVersions = [ "36" ];
            buildToolsVersions = [ "36.0.0" ];
            includeCmake = false;
            includeEmulator = true;
            includeSystemImages = true;
            systemImageTypes = [ "google_apis" ];
            abiVersions = [ "x86_64" ];
          };
        in
        {
          default = t.pkgs.mkShell (
            t.env
            // {
              inherit packages;
              GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${t.sdk}/build-tools/36.0.0/aapt2";
            }
          );
          emulator = t.pkgs.mkShell (
            t.env
            // {
              packages = packages ++ [ emulator.androidsdk ];
              ANDROID_HOME = "${emulator.androidsdk}/libexec/android-sdk";
              ANDROID_SDK_ROOT = "${emulator.androidsdk}/libexec/android-sdk";
            }
          );
        }
      );
    };
}
