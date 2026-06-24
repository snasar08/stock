#!/usr/bin/env python3
import argparse, json, math, os, shutil, subprocess, sys, tempfile
import numpy as np
from dataclasses import dataclass, asdict, field
from typing import List, Optional

@dataclass
class Word:
    start: float
    end: float
    text: str

@dataclass
class Segment:
    index: int
    start: float
    end: float
    text: str
    speaker: Optional[str] = None
    words: List[Word] = field(default_factory=list)

def seconds_to_timestamp(s, sep=","):
    if s < 0: s = 0.0
    ms = int(round(s*1000))
    h,r = divmod(ms,3600000); m,r = divmod(r,60000); sc,ms = divmod(r,1000)
    return f"{h:02d}:{m:02d}:{sc:02d}{sep}{ms:03d}"

def to_frames(s, fps): return int(round(max(0,s)*fps))
def clamp(v,lo,hi): return max(lo, min(v,hi) if hi is not None else v)

def ffmpeg_bin():
    return os.environ.get("FFMPEG_PATH", "ffmpeg")

def ffprobe_bin():
    return os.environ.get("FFPROBE_PATH", "ffprobe")

def ffprobe_duration(path):
    try:
        o = subprocess.run([ffprobe_bin(),"-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",path],capture_output=True,text=True,check=True)
        return float(o.stdout.strip())
    except: return 0.0

def to_chunk(src, dst, start, dur):
    subprocess.run([ffmpeg_bin(),"-y","-i",src,"-ss",str(start),"-t",str(dur),"-vn","-ac","1","-ar","16000","-b:a","32k",dst],capture_output=True,check=True)

def to_wav(src, dst):
    subprocess.run([ffmpeg_bin(),"-y","-i",src,"-vn","-ac","1","-ar","16000",dst],capture_output=True,check=True)

def get(obj, key):
    return obj[key] if isinstance(obj, dict) else getattr(obj, key)

def transcribe(src, language, duration, api_key):
    from groq import Groq
    client = Groq(api_key=api_key)
    segments=[]; idx=0; CHUNK=600
    n = max(1,math.ceil(duration/CHUNK))
    with tempfile.TemporaryDirectory() as tmp:
        for i in range(n):
            start=i*CHUNK; cdur=min(CHUNK,duration-start)
            if cdur<=0: break
            cp=os.path.join(tmp,f"c{i:04d}.mp3")
            print(f"CHUNK {i+1}/{n}", flush=True)
            to_chunk(src,cp,start,cdur)
            with open(cp,"rb") as f:
                r=client.audio.transcriptions.create(file=(os.path.basename(cp),f),model="whisper-large-v3",response_format="verbose_json",timestamp_granularities=["word","segment"],language=language)
            rsegs=getattr(r,"segments",None) or []
            rwords=getattr(r,"words",None) or []
            wi=0
            for rs in rsegs:
                rs_start=get(rs,"start"); rs_end=get(rs,"end"); rs_text=get(rs,"text")
                ss=round(clamp(start+rs_start,0,duration),3)
                se=round(clamp(start+rs_end,0,duration),3)
                if se<ss: se=ss
                sw=[]
                while wi<len(rwords):
                    rw=rwords[wi]
                    rw_start=get(rw,"start"); rw_end=get(rw,"end"); rw_word=get(rw,"word")
                    if rw_start<=rs_end+0.05:
                        ws=round(clamp(start+rw_start,0,duration),3)
                        we=round(clamp(start+rw_end,0,duration),3)
                        if we<ws: we=ws
                        sw.append(Word(ws,we,rw_word.strip())); wi+=1
                    else: break
                segments.append(Segment(idx,ss,se,rs_text.strip(),None,sw)); idx+=1
    return segments

def add_speakers_resemblyzer(src, segments, both_threshold=0.05):
    try:
        from resemblyzer import VoiceEncoder, preprocess_wav
        from pathlib import Path
        print("SPEAKERS_START", flush=True)
        encoder = VoiceEncoder("cpu")
        with tempfile.TemporaryDirectory() as tmp:
            wav_path = os.path.join(tmp, "full.wav")
            to_wav(src, wav_path)
            wav = preprocess_wav(Path(wav_path))
        embeddings = []
        for s in segments:
            mid = (s.start + s.end) / 2
            start_sample = max(0, int(mid * 16000) - 8000)
            end_sample = min(len(wav), int(mid * 16000) + 8000)
            if end_sample > start_sample:
                chunk = wav[start_sample:end_sample]
                if len(chunk) > 1600:
                    emb = encoder.embed_utterance(chunk)
                    embeddings.append(emb)
                else:
                    embeddings.append(None)
            else:
                embeddings.append(None)
        valid_embs = [e for e in embeddings if e is not None]
        if len(valid_embs) < 2:
            return add_speakers_gap(segments)
        spk1_seed = valid_embs[0]
        spk2_seed = None
        max_diff = 0
        for e in valid_embs[1:]:
            diff = 1 - np.dot(spk1_seed, e)
            if diff > max_diff:
                max_diff = diff
                spk2_seed = e
        if spk2_seed is None or max_diff < 0.1:
            return add_speakers_gap(segments)
        for i, s in enumerate(segments):
            if embeddings[i] is not None:
                sim1 = np.dot(spk1_seed, embeddings[i])
                sim2 = np.dot(spk2_seed, embeddings[i])
                diff = abs(sim1 - sim2)
                if diff < both_threshold:
                    s.speaker = "Both"
                elif sim1 >= sim2:
                    s.speaker = "Speaker 1"
                else:
                    s.speaker = "Speaker 2"
            else:
                s.speaker = "Both"
        return segments
    except Exception as ex:
        print(f"SPEAKERS_FALLBACK {ex}", flush=True)
        return add_speakers_gap(segments)

def add_speakers_gap(segments, gap=1.5):
    spk=1; last_end=0.0
    for s in segments:
        if s.start - last_end > gap:
            spk = 2 if spk == 1 else 1
        s.speaker = f"Speaker {spk}"
        last_end = s.end
    return segments

def _esc(t): return t.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace('"',"&quot;").replace("'","&apos;")

def write_json(segs,path,meta):
    with open(path,"w",encoding="utf-8") as f: json.dump({"meta":meta,"segments":[asdict(s) for s in segs]},f,indent=2,ensure_ascii=False)

def write_srt(segs,path):
    lines=[]
    for n,s in enumerate(segs,1):
        if not s.text: continue
        lines+=[str(n),f"{seconds_to_timestamp(s.start)} --> {seconds_to_timestamp(s.end)}",s.text,""]
    open(path,"w",encoding="utf-8").write("\n".join(lines))

def write_xml(segs,path,fps,meta):
    out=['<?xml version="1.0" encoding="UTF-8"?>',f'<transcript source="{_esc(meta.get("source",""))}" fps="{fps}" duration="{meta.get("duration",0)}" model="whisper-large-v3-groq">']
    for s in segs:
        out.append(f'  <segment index="{s.index}" start="{s.start}" end="{s.end}" start_ms="{int(s.start*1000)}" end_ms="{int(s.end*1000)}" start_frame="{to_frames(s.start,fps)}" end_frame="{to_frames(s.end,fps)}"'+(f' speaker="{_esc(s.speaker)}"' if s.speaker else "")+">")
        out.append(f'    <text>{_esc(s.text)}</text>')
        if s.words:
            out.append("    <words>")
            for w in s.words: out.append(f'      <word start="{w.start}" end="{w.end}" start_ms="{int(w.start*1000)}" end_ms="{int(w.end*1000)}" start_frame="{to_frames(w.start,fps)}" end_frame="{to_frames(w.end,fps)}">{_esc(w.text)}</word>')
            out.append("    </words>")
        out.append("  </segment>")
    out.append("</transcript>")
    open(path,"w",encoding="utf-8").write("\n".join(out))

def write_txt(segs,path):
    lines=[]
    for s in segs:
        if not s.text: continue
        lines.append(f"[{seconds_to_timestamp(s.start,sep='.')[:8]}]{' '+s.speaker+':' if s.speaker else ''} {s.text}")
    open(path,"w",encoding="utf-8").write("\n".join(lines))

def run(args):
    src = os.path.abspath(args.input)
    if not os.path.isfile(src): print(f"ERROR: {src} not found"); return 2
    base = os.path.splitext(os.path.basename(src))[0]
    outdir = os.path.join(os.path.abspath(args.outdir), base) if args.outdir else os.path.join(os.path.dirname(src), base)
    os.makedirs(outdir, exist_ok=True)
    dur = ffprobe_duration(src)
    print(f"DURATION {dur}", flush=True)
    segs = transcribe(src, args.language, dur, args.api_key)
    if args.speakers:
        segs = add_speakers_resemblyzer(src, segs, args.both_threshold)
    meta = {"source":os.path.basename(src),"duration":round(dur,3),"model":"whisper-large-v3-groq","fps":args.fps,"language":args.language or "auto"}
    print("WRITING_OUTPUTS", flush=True)
    write_json(segs, os.path.join(outdir, base+".json"), meta)
    write_srt(segs, os.path.join(outdir, base+".srt"))
    write_xml(segs, os.path.join(outdir, base+".xml"), args.fps, meta)
    write_txt(segs, os.path.join(outdir, base+".txt"))
    shutil.move(src, os.path.join(outdir, os.path.basename(src)))
    print(f"DONE {outdir}", flush=True)
    return 0

p=argparse.ArgumentParser()
p.add_argument("input")
p.add_argument("--api-key", required=True)
p.add_argument("--language", default=None)
p.add_argument("--fps", type=float, default=30.0)
p.add_argument("--speakers", action="store_true")
p.add_argument("--both-threshold", type=float, default=0.05)
p.add_argument("--outdir", default=None)
sys.exit(run(p.parse_args()))
