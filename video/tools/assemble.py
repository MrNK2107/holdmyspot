"""
Final cut: raw screen recording + ElevenLabs voice clips -> out/holdmyspot_demo.mp4.
The recorder logged when each narration beat starts (out/beats.json). PayPal's own pages are real and slow, so the
stretch between pp_start and pp_end is played SPEED x faster; later beats shift earlier by what that saved.
    python tools/assemble.py [--speed 2.5] [--offset 0.25]
"""
import argparse, json, pathlib, subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "out"
ap = argparse.ArgumentParser()
ap.add_argument("--speed", type=float, default=2.5)
ap.add_argument("--offset", type=float, default=0.25, help="seconds: the page video starts a little before the recorder clock")
a = ap.parse_args()

data = json.loads((OUT / "beats.json").read_text())
beats, marks = data["beats"], {m["name"]: m["at"] for m in data["marks"]}
pp0, pp1 = marks["pp_start"], marks["pp_end"]
saved = (pp1 - pp0) * (1 - 1 / a.speed)
src = OUT / "raw" / "demo.webm"
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)], capture_output=True, text=True).stdout)

def shifted(t):
    return t if t <= pp0 else (t - saved if t >= pp1 else pp0 + (t - pp0) / a.speed)

inputs, filt, labels = ["-i", str(src)], [], []
for i, b in enumerate(beats, start=1):
    inputs += ["-i", str(ROOT / "audio" / "vo" / f'{b["id"]}.mp3')]
    ms = int(max(0, (shifted(b["at"]) + a.offset)) * 1000)
    filt.append(f"[{i}:a]adelay={ms}|{ms}[a{i}]")
    labels.append(f"[a{i}]")
total = shifted(dur)
video = (
    f"[0:v]split=3[v0][v1][v2];"
    f"[v0]trim=0:{pp0},setpts=PTS-STARTPTS[p0];"
    f"[v1]trim={pp0}:{pp1},setpts=(PTS-STARTPTS)/{a.speed}[p1];"
    f"[v2]trim={pp1},setpts=PTS-STARTPTS[p2];"
    f"[p0][p1][p2]concat=n=3:v=1:a=0,fps=30,format=yuv420p[v]"
)
audio = ";".join(filt) + f";{''.join(labels)}amix=inputs={len(beats)}:normalize=0:dropout_transition=0,apad,atrim=0:{total:.2f},afade=t=out:st={total-1.2:.2f}:d=1.2[a]"
cmd = ["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", video + ";" + audio, "-map", "[v]", "-map", "[a]",
       "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(OUT / "holdmyspot_demo.mp4")]
subprocess.run(cmd, check=True)
print(f"raw {dur:.1f}s -> final {total:.1f}s ({int(total//60)}:{int(total%60):02d}); PayPal wait {pp1-pp0:.1f}s at {a.speed}x; offset {a.offset}s")
for b in beats:
    print(f'  {b["id"]:12s} video {shifted(b["at"]):6.1f}s  voice {json.loads((ROOT/"audio"/"vo"/"durations.json").read_text())[b["id"]]:5.1f}s')
