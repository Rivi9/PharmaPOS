# PharmaPOS Deployment Guide

## Prerequisites

- Node.js 18 or higher
- Windows 10 or higher (for building Windows installer)
- Code signing certificate (production only)
- GitHub personal access token with repo permissions

## Building for Production

### 1. Prepare Environment

```bash
# Install dependencies
npm ci

# Create .env.local with credentials
CSC_LINK=path/to/certificate.pfx
CSC_KEY_PASSWORD=certificate-password
GH_TOKEN=github-token
```

### 2. Build Installer

```bash
# Build installer without publishing
npm run make

# Build and publish to GitHub releases
npm run publish
```

### 3. Test Installer

1. Install the generated .exe from `out/make/squirrel.windows/x64/` directory
2. Run the application and complete first-run setup
3. Verify all features work correctly
4. Test auto-update mechanism (with test release)

## GitHub Releases

### Creating a Release

1. Update version in `package.json`
2. Commit changes: `git commit -m "chore: bump version to X.Y.Z"`
3. Create and push tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
4. GitHub Actions will automatically build and create release

### Manual Release

```bash
# Build and publish
npm run publish

# Installer will be uploaded to GitHub releases
```

## Auto-Update Configuration

Auto-updates work via `update-electron-app` + Squirrel.Windows + GitHub releases:

1. Application checks for updates every hour (production only)
2. Squirrel downloads the update silently in the background
3. User is notified via the renderer when update is ready
4. Update is applied on next app quit (`autoUpdater.quitAndInstall()`)

### Update Channels

- `latest`: Stable releases (default)
- `beta`: Pre-release versions (set `prerelease: true` in `forge.config.ts`)

## Code Signing

### Development

Use self-signed certificate for testing:

```powershell
New-SelfSignedCertificate -Subject "CN=PharmaPOS" -Type CodeSigning -CertStoreLocation Cert:\CurrentUser\My
```

### Production

1. Purchase certificate from trusted CA (DigiCert, Sectigo)
2. Install certificate to build machine
3. Set CSC_LINK and CSC_KEY_PASSWORD in CI/CD secrets

## CI/CD Setup

### GitHub Secrets

Add these secrets to repository settings:

- `CSC_LINK`: Base64-encoded certificate (or path in runner)
- `CSC_KEY_PASSWORD`: Certificate password
- `GH_TOKEN`: GitHub token (auto-provided by Actions)

### Triggering Builds

Builds trigger automatically on version tags:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Troubleshooting

### Build Fails

- Verify Node.js version (18+)
- Check certificate is valid
- Ensure all dependencies installed

### Auto-Update Not Working

- Verify GH_TOKEN has repo permissions
- Check GitHub release exists
- Confirm production build (not dev)

### Installer Unsigned

- Verify CSC_LINK and CSC_KEY_PASSWORD set
- Check certificate hasn't expired
- Confirm certificate is code-signing type

## Distribution

### Direct Download

Users download installer from GitHub releases page.

### Enterprise Deployment

Deploy via Group Policy, SCCM, or Intune:

```powershell
# Silent install
PharmaPOS-Setup-1.0.0.exe /S

# Custom install directory
PharmaPOS-Setup-1.0.0.exe /S /D=C:\CustomPath
```

## Additional Resources

- [Electron Forge Documentation](https://www.electronforge.io/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Code Signing Guide](docs/BUILDING.md)
