import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// The app uses root-relative public data/assets and client-side deep links.
// A root base keeps direct routes such as /moves/tackle loadable after a
// static host rewrites them to index.html.
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves project sites below /<repository>/ while local and
  // custom-domain deployments use the root path.
  base: process.env.GITHUB_ACTIONS ? '/polishedDexCN/' : '/',
})
