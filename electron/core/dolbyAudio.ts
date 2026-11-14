export { directDolbyTracks } from "../../shared/dolbyAudio.js";

const DOLBY_CONTAINERS = new Set(["mp4", "m4v", "mov"]);

export function canHaveDirectDolby(ext: string): boolean {
  return DOLBY_CONTAINERS.has(ext);
}
