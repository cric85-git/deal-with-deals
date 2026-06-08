# Add the Android build workflow

The `android-build.yml` in this folder needs to be installed as a GitHub Actions
workflow. The file is here (instead of directly in `.github/workflows/`)
because adding GitHub Actions requires a token with the `workflow` scope, and
this repo's local push credential doesn't have that.

## One-time setup (30 seconds)

1. Open https://github.com/cric85-git/deal-with-deals on your computer
2. Click **Add file → Create new file**
3. In the filename box, type exactly: `.github/workflows/android-build.yml`
4. Open `docs/ci-workflow/android-build.yml` in this repo, copy its contents
5. Paste into the new file on GitHub
6. Scroll down → **Commit new file**

That's it. Every push to `main` that touches app code will now build a debug
APK and publish it as a GitHub Release. You'll find it at:

https://github.com/cric85-git/deal-with-deals/releases

## Trigger the first build manually

After installing the workflow:

1. Go to https://github.com/cric85-git/deal-with-deals/actions
2. In the left sidebar click **Build Android APK**
3. Click **Run workflow → main → Run workflow**
4. Wait ~3-4 minutes
5. APK appears as both a workflow artifact and a GitHub Release asset

## Install the APK on your Android phone

1. Open the Releases page on your phone's browser
2. Tap the latest `perq-debug-*.apk` to download
3. Allow your browser to install unknown apps
4. Tap the file → Install
5. Open Perq, grant Camera + Notifications

You can also pre-emptively allow APK installs on your phone:
**Settings → Apps → Special access → Install unknown apps → Chrome → Allow**
