import { Segment } from "./format";

export interface SpeakerState {
  lastSpeaker: string;
  lastEnd: number;
}

export function labelSpeakers(
  segments: Segment[],
  state: SpeakerState = { lastSpeaker: "Speaker 1", lastEnd: 0 }
): SpeakerState {
  let { lastSpeaker, lastEnd } = state;
  for (const s of segments) {
    const gap = s.start - lastEnd;
    if (gap > 0.5) {
      lastSpeaker = lastSpeaker === "Speaker 1" ? "Speaker 2" : "Speaker 1";
    }
    s.speaker = lastSpeaker;
    lastEnd = s.end;
  }
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i];
    const b = segments[i + 1];
    if (a.speaker !== b.speaker && a.end > b.start) {
      a.speaker = "Both";
      b.speaker = "Both";
    }
  }
  return { lastSpeaker, lastEnd };
}
