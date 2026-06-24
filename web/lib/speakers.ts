import { Segment } from "./format";

export function addSpeakersGap(segments: Segment[], gap = 1.5): Segment[] {
  let spk = 1;
  let lastEnd = 0;
  for (const s of segments) {
    if (s.start - lastEnd > gap) {
      spk = spk === 1 ? 2 : 1;
    }
    s.speaker = `Speaker ${spk}`;
    lastEnd = s.end;
  }
  return segments;
}
