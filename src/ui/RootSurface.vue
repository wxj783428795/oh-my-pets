<script setup lang="ts">
import DeveloperWorkbench from "./App.vue";
import PetWindow from "./PetWindow.vue";
import PreferencesWindow from "./PreferencesWindow.vue";
import { resolveSurface, type AppSurface } from "./surface";

const fallback: AppSurface =
  import.meta.env.VITE_BROWSER_TEST === "true" ? "developer" : "pet";
const surface = resolveSurface(window.location.search, fallback);
</script>

<template>
  <PetWindow v-if="surface === 'pet'" />
  <PreferencesWindow v-else-if="surface === 'preferences'" />
  <DeveloperWorkbench v-else />
</template>
