# PharmaPOS

A production-ready Pharmacy Point of Sale (POS) Desktop Application built with Electron, React, and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# Build for production
$ npm run build

# Build and publish to GitHub releases
$ npm run release
```

Installer will be created in `dist/` directory.

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions and [BUILDING.md](docs/BUILDING.md) for code signing setup.

## Releases

Releases are automatically created when version tags are pushed:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Download latest release from [GitHub Releases](https://github.com/your-org/pharmapos/releases).
