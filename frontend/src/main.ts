import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "./App.vue";
import { i18n } from "./i18n";
import "./styles/base.css";
import "./styles/toograph-select.css";
import { router } from "@/router";

const app = createApp(App);
app.use(ElementPlus);
app.use(createPinia());
app.use(i18n);
app.use(router);
app.mount("#app");
