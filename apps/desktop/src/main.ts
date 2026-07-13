import { createApp } from 'vue'
import App from './App.vue'
import { installBrowserApi } from './browser-api'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import './styles.css'

installBrowserApi()
createApp(App).mount('#app')
