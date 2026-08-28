// Splices the freshly-dumped route/route_hop INSERT blocks into a target SQL
// file, replacing the stale ones between known line markers.
import fs from "node:fs";

const target = process.argv[2];
if (!target) { console.error("Usage: node splice-route-sql.mjs <path-to-sql-file>"); process.exit(1); }

const lines = fs.readFileSync(target, "utf8").split("\n");
const routeStart = lines.findIndex(l => l.startsWith("INSERT INTO route (genco"));
const hopStart = lines.findIndex(l => l.startsWith("INSERT INTO route_hop"));
if (routeStart === -1 || hopStart === -1) { console.error("Could not find route/route_hop INSERT markers"); process.exit(1); }

// route block runs [routeStart, hopStart-2] (there's a blank line before INSERT INTO route_hop)
// find the blank line right before hopStart
let routeEnd = hopStart - 1;
while (routeEnd > routeStart && lines[routeEnd].trim() === "") routeEnd--;
// hop block runs [hopStart, hopEnd] until the next blank line followed by a comment/section marker
let hopEnd = hopStart + 1;
while (hopEnd < lines.length && lines[hopEnd].trim() !== "") hopEnd++;
hopEnd--; // last non-blank line (the terminating `;` row)

const routeBlock = fs.readFileSync("route-block.sql", "utf8").trimEnd().split("\n");
const hopBlock = fs.readFileSync("route-hop-block.sql", "utf8").trimEnd().split("\n");

const before = lines.slice(0, routeStart);
const betweenBlank = lines.slice(routeEnd + 1, hopStart); // preserves the blank line(s) between blocks
const after = lines.slice(hopEnd + 1);

const result = [...before, ...routeBlock, ...betweenBlank, ...hopBlock, ...after].join("\n");
fs.writeFileSync(target, result);
console.log(`Spliced into ${target}: route rows [${routeStart}-${routeEnd}] -> ${routeBlock.length} lines, route_hop rows [${hopStart}-${hopEnd}] -> ${hopBlock.length} lines`);
