// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions 는 Deno 런타임이라 이 설정(Expo/RN)의 대상이 아니다.
    ignores: ["dist/*", "supabase/functions/*"],
  }
]);
