/**
 * Root (workspace solution) build configuration: the root package has no
 * runtime entry of its own, so it contributes no bundles. Keeping entry empty
 * lets per-package tsdown configs own the workspace build.
 */
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [],
})
