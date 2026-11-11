import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import fs from "node:fs/promises";
import path from "node:path";
const from=path.resolve("styles/reference-kit.css");
const output=await postcss([tailwind()]).process(await fs.readFile(from,"utf8"),{from,to:path.resolve("public/reference-kit.css")});
await fs.writeFile("public/reference-kit.css",output.css);
console.log("Built isolated Kit utilities without global preflight.");

