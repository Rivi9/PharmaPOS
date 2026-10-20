import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      // Left to Node at runtime (the packaged app ships node_modules):
      // - moment: Vite 8's Rolldown resolves `require('moment')` (in the log-file
      //   rotator) to moment's ESM build, so it came back as a namespace object
      //   and the app crashed on load with "a is not a function".
      // - @aws-sdk/client-s3: only required inside unzipper's S3 helper
      //   (read-excel-file -> unzipper), which this app never calls. Rollup
      //   ignored the unresolvable require; Rolldown fails the build.
      external: ['better-sqlite3', 'serialport', 'usb', 'moment', '@aws-sdk/client-s3']
    }
  }
})
