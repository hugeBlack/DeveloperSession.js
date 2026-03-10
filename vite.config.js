import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  let env = loadEnv(mode, "")
  console.log(env)
  return {
    plugins: [
      vue(),
      vueDevTools(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        'BackgroundClient': fileURLToPath(new URL('./src/lib/BackgroundClientISH.js', import.meta.url))
      },
    },
    server: {
      allowedHosts: true,
      host: '0.0.0.0'
    },
  }
})
