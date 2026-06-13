/* Real generated imagery via DiceBear (deterministic by seed). */

const BG = "c5f72b,34d6e0,ff36a3,ff8a3d,3da5ff,8be34a"; // brand colors, no violet

export function playerAvatar(seed: string) {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&radius=50`;
}

export function matchLogo(seed: string) {
  return `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${BG}&radius=50`;
}

export function botAvatar(seed: string) {
  return `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${BG}&radius=50`;
}
