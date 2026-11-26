import { extraDrawings } from "./pictures-extra.js";

// Original single-ink drawings. Labels remain visible if inline SVG is unavailable.
export const drawings = {
  umbrella: `<path d="M10 48Q15 19 48 18Q79 19 86 48Q75 39 67 48Q58 40 48 48Q37 40 28 48Q20 40 10 48ZM48 17v-4m0 35v24c0 14 16 14 16 1M28 46q3-19 20-28 16 10 19 28"/>`,
  clock: `<circle cx="48" cy="48" r="34"/><circle cx="48" cy="48" r="2"/><path d="M48 20v5m28 23h-5M48 76v-5M20 48h5m23 0V32m0 16 17 9"/>`,
  cup: `<path d="M17 39h50l-3 23q-2 14-22 14T20 62zm50 3h6c15 0 13 20-8 20M12 80h62M32 30q-6-5 0-12m15 12q-6-5 0-12"/>`,
  scissors: `<circle cx="24" cy="66" r="12"/><circle cx="48" cy="75" r="11"/><path d="m33 57 43-37q-1 12-20 29L40 60m5 4 5-50q8 9 4 31l-5 19"/><circle cx="48" cy="51" r="2"/>`,
  key: `<path d="M44 42a18 18 0 1 0-12 13l31 30 8-8-8-8 6-6-7-7-6 6z"/><circle cx="25" cy="33" r="5"/>`,
  book: `<path d="M9 25q20-7 39 5 18-12 39-5v47q-20-6-39 5-21-11-39-5zm39 5v47M18 36q12-3 22 4m-22 8q12-3 22 4m16-12q10-7 22-4m-22 16q10-7 22-4"/>`,
  fish: `<path d="M12 49q22-37 53-8l16-12v36L65 54Q39 82 12 49Zm22-18 8-10 14 12M31 37q10 12 0 24m14-17q7 4 0 8m10-10q7 4 0 8"/><circle cx="24" cy="47" r="2"/>`,
  rabbit: `<path d="M24 55q-7-10 3-18-11-29-3-30 9-1 13 25 1-29 9-26 7 3 0 30 8 4 8 13 16-9 24 7 8 18-5 22H29q-7-1-5-6l9-7q-11 1-15-4-2-4 6-6Z"/><circle cx="82" cy="55" r="6"/><circle cx="35" cy="46" r="2"/><path d="M65 62q-11 0-12 12"/>`,
  banana: `<path d="m71 13 7 3-2 10q5 29-22 45-28 16-44-3l1-5q31 12 49-16 9-14 11-34Zm-58 55q41 15 60-38"/>`,
  carrot: `<path d="M15 80q3-18 27-51 8-10 20-1t3 20Q42 70 15 80Zm28-45 9 7m-20 6 8 6m19-26 2-17 6 9 9-13-2 16 12-2-17 11"/>`,
  tent: `<path d="m9 75 33-54 27 54zm33-54 23 1 23 53H69M23 75l18-32 14 32m-19-47 10-15m-8 1 9 15M7 78l-3 4m85-4 3 5"/>`,
  piano: `<path d="M17 18h62v37l6 6v11H11V61l6-6zm0 37h62M11 61h74M17 72v10m62-10v10"/><path d="M24 61v10m10-10v10m10-10v10m10-10v10m10-10v10m10-10v10"/><path stroke-width="5" d="M24 61v4m10-4v4m20-4v4m10-4v4m10-4v4"/>`,
  library: `<path d="M9 76V18h43v58zm0-29h43M16 42V25h6v17zm13 0V23h5v19zm10-17 6 16M16 70V53h6v17zm14-16 7 15m31-5-10-4V49l10 4 11-4v11zM54 65h33m-28 1v13m22-13v13"/>`,
  station: `<rect x="11" y="15" width="41" height="58" rx="9"/><path d="M17 30h29v18H17zm0 43-5 10m34-10 6 10M8 86h49m0-30h32v9H57zm8 10v16m17-16v16M62 28h22v10H62zm11 10v16"/><circle cx="21" cy="60" r="3"/><circle cx="42" cy="60" r="3"/>`,
  post: `<path d="M10 71V22h76v49M10 74h76M16 65h64M23 32h20m-20 6h20m-10 0v14M51 42h27v17H51zm0 0 13.5 10L78 42"/>`,
  swimming: `<circle cx="66" cy="42" r="8"/><path d="m14 58 23-9 10-11-13-9-12 9-5-5 15-13 25 15q6 6 1 13l-5 7M9 65q7 8 14 0 7 8 14 0 7 8 14 0 7 8 14 0 7 8 15 0M16 77q7 7 14 0 7 7 14 0 7 7 14 0 7 7 14 0"/>`,
  skiing: `<circle cx="54" cy="21" r="7"/><path d="m48 29-13 17 18 12-7 13m-12-24-8 13-9 3m27-28 8 10 17-4M11 64l47 15q6 2 10-2M22 64l47 14q6 2 10-2M68 38l-8 29M11 77l64 15"/>`,
  fishing: `<circle cx="23" cy="25" r="7"/><path d="m17 34 12 1 5 13 10-5m-25-8-3 25 4 17m5-23 7 11-2 13M9 80l25-2 8-7M38 49Q58 7 80 16l-4 39m0 0q1 7-5 5M52 68q6 5 12 0m4 12q7 5 14 0"/>`,
  sun: `<circle cx="48" cy="48" r="18"/><path d="M48 14v10m0 48v10M14 48h10m48 0h10M24 24l7 7m34 34 7 7M72 24l-7 7M31 65l-7 7"/>`,
  cloud: `<path d="M26 68h44a14 14 0 0 0 2-28 19 19 0 0 0-36-5A14 14 0 0 0 26 68Z"/>`,
  snowman: `<circle cx="48" cy="30" r="12"/><circle cx="48" cy="62" r="20"/><circle cx="44" cy="28" r="1.5"/><circle cx="52" cy="28" r="1.5"/><path d="M48 32l7 2-7 2m-18 18-14-8m50 8 14-8M36 42h24"/>`,
  lightning: `<path d="M56 12 24 52h22l-8 32 34-42H50z"/>`,
  rainbow: `<path d="M14 70a34 34 0 0 1 68 0M24 70a24 24 0 0 1 48 0M34 70a14 14 0 0 1 28 0"/>`,
  wind: `<path d="M14 36h44a9 9 0 1 0-9-9M10 50h60a10 10 0 1 1-10 10M20 64h28a8 8 0 1 1-8 8"/>`,
  hat: `<path d="M12 62h72M24 62l5-26q19-12 38 0l5 26M25 53h46"/>`,
  glasses: `<circle cx="28" cy="50" r="14"/><circle cx="68" cy="50" r="14"/><path d="M42 50h12M14 48l-4-12m72 12 4-12"/>`,
  shoe: `<path d="M16 66h64v-8q0-8-14-10l-16-6-10-16-24 8zm18-32 6 4m-3 5 6 4M16 66v6h64v-6"/>`,
  bag: `<rect x="16" y="34" width="64" height="44" rx="7"/><path d="M34 34V24a14 14 0 0 1 28 0v10M16 50h64M44 50v8h8v-8"/>`,
  shirt: `<path d="M32 18 14 30l8 16 10-6v38h32V40l10 6 8-16-18-12-16 10zM48 28v50"/>`,
  watch: `<rect x="30" y="28" width="36" height="40" rx="8"/><path d="M38 28V12h20v16M38 68v16h20V68M48 48V38m0 10 8 5"/>`,
  ...extraDrawings
};
export function picture(card) {
  const id = card.pictureId ?? card.id;
  if (!Object.hasOwn(drawings,id)) {
    const icon = document.createElement("span");
    icon.className = "karuta-icon";
    icon.setAttribute("aria-hidden","true");
    icon.style.maskImage = `url("/karuta/tabler/${encodeURIComponent(id)}.svg")`;
    return icon;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  for (const [attr,value] of Object.entries({ viewBox:"0 0 96 96", "aria-hidden":"true",
    fill:"none", stroke:"currentColor", "stroke-linecap":"round", "stroke-linejoin":"round", "stroke-width":"2.8" })) svg.setAttribute(attr,value);
  svg.innerHTML = drawings[id];
  return svg;
}
