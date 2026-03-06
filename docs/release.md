 The full publish flow:

  # 1. Bump version in package.json
  npm version patch        # 1.0.0 → 1.0.1
  # (or: minor for features, major for breaking changes)

  # 2. Push the commit + tag GitHub Actions created
  git push origin main --follow-tags

  That's it. GitHub Actions picks up the v* tag, runs npm run publish, which:
  - Builds and packages the app
  - Creates PharmaPOS-Setup.exe + .nupkg
  - Creates a GitHub Release with those files attached
  - The RELEASES file tells existing installs there's an update available

  For local publishing (without CI):
  # Need a GH_TOKEN with repo write access
  $env:GITHUB_TOKEN="ghp_your_token_here"
  npm run publish

  Auto-update on existing installs: update-electron-app checks https://update.electronjs.org/Rivi9/pharmapos/win32-x64/{currentVersion} every hour and triggers Squirrel when a newer version is published. 
