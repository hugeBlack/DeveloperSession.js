

import { createApp } from 'vue'
import router from './router';
import App from './App.vue'
import 'vant/lib/index.css';
import { Locale } from 'vant';
import enUS from 'vant/es/locale/lang/en-US';

Locale.use('en-US', enUS);
createApp(App).use(router).mount('#app')
