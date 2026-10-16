/* 本子里所有的"时间"只在这里定义。
   CSS 记不住 JS 的数字、JS 也记不住 CSS 的 —— 所以：
   · JS 直接 import 这些常量；
   · CSS 用的一套，由 notebook.js 调 installTimingVars() 写进 :root，样式里只写 var(--xxx)。
   要调快调慢、要改衔接，改这一个文件就够。 */

export const FLIP_MS = 760;                 // turn.js 翻一页
export const SHEET_DELAY_MS = 60;           // 放开之后到"动笔"的那点呼吸
export const SHEET_IN_MS = 440;             // 一张新纸落下来（改这条是"墨迹化开"）
export const SHEET_OUT_MS = 240;            // 写进本子 / 不写了：这一页收走
export const SHEET_RIP_MS = 440;            // 撕掉这页
export const ROW_STAGGER_MS = 48;           // 逐行写出来的间隔
export const SHEET_ACTIONS_DELAY_MS = 400;  // 两颗按钮最后出现
export const SHEET_RELEASE_FALLBACK_MS = 1400;   // 兜底：万一没翻成，也要放开这一页

const px = (v) => v + 'ms';

/** 把同一批数字写进 :root，给 CSS 用 */
export function installTimingVars(root) {
  const style = (root || document.documentElement).style;
  style.setProperty('--flip-ms', px(FLIP_MS));
  style.setProperty('--sheet-in-ms', px(SHEET_IN_MS));
  style.setProperty('--sheet-out-ms', px(SHEET_OUT_MS));
  style.setProperty('--sheet-rip-ms', px(SHEET_RIP_MS));
  style.setProperty('--row-stagger-ms', px(ROW_STAGGER_MS));
  style.setProperty('--es-actions-delay', px(SHEET_ACTIONS_DELAY_MS));
}
