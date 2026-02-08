# Building PharmaPOS

This guide covers building and packaging PharmaPOS for distribution.

## Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Windows 10/11 (for Windows builds and code signing)

## Development Build

```bash
# Install dependencies
npm install

# Build the application
npm run dev
```

## Production Build

### 1. Build Without Code Signing

```bash
# Build for Windows without publishing
npm run build
```

This creates an unsigned installer in `dist/` directory.

### 2. Build With Code Signing

Code signing ensures users can trust your application and prevents Windows SmartScreen warnings.

#### Obtaining a Code Signing Certificate

1. **Purchase a certificate** from a trusted Certificate Authority (CA):
   - DigiCert
   - Sectigo
   - GlobalSign
   - SSL.com

2. **Certificate formats**:
   - `.pfx` (PKCS#12) - Windows format (recommended)
   - `.p12` (PKCS#12) - Alternative format

#### Setting Up Code Signing

1. **Create `.env.local` file** (copy from template):
   ```bash
   cp .env.local.template .env.local
   ```

2. **Configure environment variables**:
   ```env
   # Path to your certificate file
   CSC_LINK=C:/path/to/certificate.pfx

   # Certificate password
   CSC_KEY_PASSWORD=your-certificate-password

   # GitHub token for releases
   GH_TOKEN=your-github-personal-access-token
   ```

3. **Verify certificate**:
   ```powershell
   # On Windows PowerShell
   certutil -dump certificate.pfx
   ```

#### Building Signed Installer

```bash
# Build with code signing
npm run build
```

The build process will automatically:
- Sign the executable with SHA-256
- Create NSIS installer
- Sign the installer package
- Output to `dist/` directory

## Publishing Releases

### GitHub Releases

1. **Setup GitHub token**:
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Generate token with `repo` scope
   - Add to `.env.local` as `GH_TOKEN`

2. **Update version**:
   ```bash
   # Update version in package.json
   npm version patch  # or minor, major
   ```

3. **Create release**:
   ```bash
   npm run release
   ```

This will:
- Build the application
- Create a GitHub release
- Upload installer as release asset
- Enable auto-update for existing installations

### Manual Release

If you need to build without auto-publishing:

```bash
# Build and create installer, but don't publish
npm run build

# Upload dist/PharmaPOS-Setup-*.exe manually to GitHub Releases
```

## Build Configuration

Build configuration is defined in `electron-builder.yml`:

- **Application ID**: `com.pharmapos.app`
- **Product Name**: `PharmaPOS`
- **Installer Type**: NSIS (Windows)
- **Architecture**: x64
- **Signing**: SHA-256 hash algorithm
- **Auto-update**: GitHub releases provider

## Build Outputs

After successful build, you'll find:

```
dist/
├── PharmaPOS-Setup-1.0.0.exe    # Signed NSIS installer
├── win-unpacked/                # Unpacked application files
└── builder-debug.yml            # Build debug information
```

## Troubleshooting

### "Certificate not found" Error

**Cause**: `CSC_LINK` path is incorrect or certificate file is missing.

**Solution**:
- Verify certificate file exists at specified path
- Use absolute paths in `.env.local`
- Check file permissions

### "Invalid certificate password" Error

**Cause**: `CSC_KEY_PASSWORD` is incorrect.

**Solution**:
- Verify password with: `certutil -dump certificate.pfx`
- Ensure no extra spaces in `.env.local`

### Windows SmartScreen Warning

**Cause**: Certificate doesn't have enough reputation or is self-signed.

**Solution**:
- Use certificate from trusted CA (DigiCert, Sectigo, etc.)
- Build reputation over time (Microsoft tracks signed executables)
- Consider Extended Validation (EV) certificate for immediate trust

### Build Fails on Non-Windows Platform

**Cause**: Code signing requires Windows.

**Solution**:
- Build on Windows machine or Windows VM
- Use CI/CD with Windows runners (GitHub Actions)
- Or build without signing: remove certificate config from electron-builder.yml

## CI/CD Integration

For automated builds with GitHub Actions, see `.github/workflows/release.yml` (created in Phase 6, Task 8).

## Security Best Practices

1. **Never commit certificates or passwords** to version control
   - `.env.local` is gitignored
   - Certificate files (`.pfx`, `.p12`) are gitignored

2. **Store certificates securely**:
   - Use password-protected certificates
   - Rotate certificates before expiration
   - Keep backups in secure location

3. **Limit access**:
   - Only trusted team members should have access to certificates
   - Use environment-specific certificates (dev vs prod)

4. **Monitor certificate expiration**:
   - Set calendar reminders 3-6 months before expiration
   - Plan renewal well in advance

## Additional Resources

- [electron-builder Documentation](https://www.electron.build/)
- [Code Signing Guide](https://www.electron.build/code-signing)
- [Windows Code Signing](https://docs.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools)
