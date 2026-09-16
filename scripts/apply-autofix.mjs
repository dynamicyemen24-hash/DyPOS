import { spawnSync } from "node:child_process";
import path from "node:path";

const cwd = "D:/SulationDy/DyPOS/POS";
const bin = path.join(cwd, "node_modules", ".bin", "biome");

const result = spawnSync(
  bin,
  ["check", "src", "--write"],
  { cwd, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, shell: true },
);

if (result.error) {
  console.error("spawn error:", result.error.message);
} else {
  console.log("exit code:", result.status);
  console.log("stdout:", result.stdout.slice(0, 3000));
  if (result.stderr) console.error("stderr:", result.stderr.slice(0, 3000));
}
