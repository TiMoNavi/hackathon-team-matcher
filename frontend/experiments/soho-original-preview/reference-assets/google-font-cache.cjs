const path = require("node:path");
const faces = require("./font-faces.json");
const fontRoot = path.join(__dirname, "fonts");
const css = family => faces.filter(face => face.family === family).map(face => face.css.replaceAll("__FONT_ROOT__", fontRoot)).join("\n");
module.exports = {
  "https://fonts.googleapis.com/css2?family=DM+Sans:wght@100..1000&display=swap": css("DM Sans"),
  "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&display=swap": css("Geist Mono"),
};
