# Building PharmaPOS

This guide covers building and packaging PharmaPOS for distribution.

## Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Windows 10/11 (for Windows builds and code signing)

## Development

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev
```

## Production Build

### 1. Package (no installer)

```bash
npm run package
```

Creates the app bundle in `out/` directory (unpackaged).

### 2. Make Installer

```bash
npm run make
```

Creates a Squirrel.Windows installer in `out/make/` directory.

### 3. Code Signing

Configure code signing in `forge.config.ts` under `makers[0]` (MakerSquirrel):

```typescript
new MakerSquirrel({
  name: 'PharmaPOS',
  setupIcon: './build/icon.ico',
  certificateFile: process.env.CSC_LINK,
  certificatePassword: process.env.CSC_KEY_PASSWORD
})
```

Set environment variables before building:

```env
CSC_LINK=C:/path/to/certificate.pfx
CSC_KEY_PASSWORD=your-certificate-password
GH_TOKEN=your-github-personal-access-token
```

## Publishing Releases

### GitHub Releases

1. **Update version**:

   ```bash
   npm version patch  # or minor, major
   ```

2. **Create release**:
   ```bash
   npm run publish
   ```

This will:

- Build the application
- Create a Squirrel.Windows installer
- Publish to GitHub Releases
- Enable auto-update for existing installations

### Manual Release

```bash
# Build installer without publishing
npm run make

# Upload out/make/squirrel.windows/x64/*.exe manually to GitHub Releases
```

## Build Configuration

Build configuration is defined in `forge.config.ts`:

- **Application ID**: `com.pharmapos.app`
- **Product Name**: `PharmaPOS`
- **Installer Type**: Squirrel.Windows
- **Architecture**: x64
- **Auto-update**: GitHub releases via `update-electron-app`

## Build Outputs

After `npm run make`:

```
out/
├── make/
│   └── squirrel.windows/
│       └── x64/
│           ├── PharmaPOS-Setup.exe    # Squirrel installer
│           └── *.nupkg                # Update package
└── PharmaPOS-win32-x64/              # Unpacked application
```

## Troubleshooting

### "Certificate not found" Error

**Cause**: `CSC_LINK` path is incorrect or certificate file is missing.

**Solution**:

- Verify certificate file exists at specified path
- Use absolute paths in environment variables
- Check file permissions

### Windows SmartScreen Warning

**Cause**: Certificate doesn't have enough reputation or is self-signed.

**Solution**:

- Use certificate from trusted CA (DigiCert, Sectigo, etc.)
- Consider Extended Validation (EV) certificate for immediate trust

## Security Best Practices

1. **Never commit certificates or passwords** to version control
   - `.env.local` is gitignored
   - Certificate files (`.pfx`, `.p12`) are gitignored

2. **Store certificates securely**:
   - Use password-protected certificates
   - Rotate certificates before expiration

## Additional Resources

- [Electron Forge Documentation](https://www.electronforge.io/)
- [Squirrel.Windows Maker](https://www.electronforge.io/config/makers/squirrel.windows)
- [update-electron-app](https://github.com/electron/update-electron-app)
