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

  The release is created as a DRAFT. Publish it as a full release (not a pre-release) — installs only see the release GitHub marks as Latest:
  gh release edit vX.Y.Z --draft=false --prerelease=false --latest

  Auto-update on existing installs: the app reads https://github.com/Rivi9/PharmaPOS/releases/latest/download/RELEASES when Settings → Updates → Check for Updates is pressed (or every hour, if automatic checks are turned on in that tab) and triggers Squirrel when a newer version is published. 
