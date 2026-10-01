import { run } from 'vitest/runner'
run({ config: 'vitest.config.ts' }).then(() => {
  process.exit(0)
}).catch(e => {
  console.error(e)
  process.exit(1)
})