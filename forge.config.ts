import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import { PublisherGithub } from '@electron-forge/publisher-github'

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      // Native .node files cannot be loaded from inside an asar archive —
      // unpack them alongside it so the OS can load them directly.
      unpack: '**/*.node',
      unpackDir: '**/node_modules/{better-sqlite3,usb}'
    },
    icon: './build/icon',
    name: 'PharmaPOS',
    appVersion: '1.0.0',
    extraResource: ['./resources'],
    win32metadata: {
      CompanyName: 'PharmaPOS',
      ProductName: 'PharmaPOS',
      FileDescription: 'Pharmacy POS Desktop Application'
    }
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'PharmaPOS',
      setupIcon: './build/icon.ico',
      iconUrl: 'https://raw.githubusercontent.com/Rivi9/pharmapos/main/build/icon.ico',
      setupExe: 'PharmaPOS-Setup.exe'
    }),
    new MakerZIP({}, ['darwin'])
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main'
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload'
        }
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts'
        }
      ]
    })
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: 'Rivi9',
        name: 'pharmapos'
      },
      prerelease: false
    })
  ]
}

export default config
