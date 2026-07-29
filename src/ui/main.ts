import { createApp } from "vue";

import App from "./App.vue";
import { platformKey, tauriPlatform } from "./platform";
import "./styles.css";

const platform =
  import.meta.env.VITE_BROWSER_TEST === "true"
    ? (await import("./browser-test-platform")).browserTestPlatform
    : tauriPlatform;

createApp(App).provide(platformKey, platform).mount("#app");
