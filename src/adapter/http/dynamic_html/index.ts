import { createHash } from "crypto";
import { ox_runtime_js } from "./runtime_asset";

const ox_runtime_hash = createHash("sha1")
  .update(ox_runtime_js)
  .digest("hex")
  .slice(0, 12);

const ox_runtime_path = `/__oxarion/ox.${ox_runtime_hash}.js`;

export { ox_runtime_hash, ox_runtime_js, ox_runtime_path };
