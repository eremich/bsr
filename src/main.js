import { createStage } from "./stage.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const chapters = [...document.querySelectorAll(".chapter")];
const callouts = [...document.querySelectorAll("[data-callout]")];
const chapterNum = document.querySelector("[data-chapter-num]");
const chapterName = document.querySelector("[data-chapter-name]");

let active = -1;
function setActive(i) {
  if (i === active) return;
  active = i;
  chapters.forEach((c, k) => c.classList.toggle("is-active", k === i));
  chapterNum.textContent = String(i).padStart(2, "0");
  chapterName.textContent = chapters[i].dataset.name;
}

// pin each callout to its projected 3D anchor while its chapter is in view
function placeCallouts(project) {
  callouts.forEach((el) => {
    const hit = project(Number(el.dataset.callout));
    el.classList.toggle("is-on", !!hit && hit[2]);
    if (hit) el.style.transform = `translate(${hit[0].toFixed(1)}px, ${hit[1].toFixed(1)}px)`;
  });
}

// scroll position → tour progress: 0 at the hero, 1 per chapter
function readProgress() {
  const centre = window.scrollY + window.innerHeight / 2;
  for (let i = 0; i < chapters.length - 1; i++) {
    const a = chapters[i].offsetTop + chapters[i].offsetHeight / 2;
    const b = chapters[i + 1].offsetTop + chapters[i + 1].offsetHeight / 2;
    if (centre < b) return i + Math.max(0, (centre - a) / (b - a));
  }
  return chapters.length - 1;
}

let stage = null;
try {
  stage = createStage(document.querySelector(".stage"), {
    reducedMotion,
    onProgress: (_, project) => placeCallouts(project),
  });
} catch {
  document.documentElement.classList.add("no-webgl");
}

function onScroll() {
  const p = readProgress();
  stage?.setProgress(p);
  setActive(Math.min(chapters.length - 1, Math.round(p)));
}
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", onScroll);
