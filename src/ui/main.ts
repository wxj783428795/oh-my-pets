import { createApp } from "vue";

import { platformKey, tauriPlatform } from "./platform";
import RootSurface from "./RootSurface.vue";
import "./styles.css";

const platform =
  import.meta.env.VITE_BROWSER_TEST === "true"
    ? (await import("./browser-test-platform")).browserTestPlatform
    : tauriPlatform;

createApp(RootSurface).provide(platformKey, platform).mount("#app");
