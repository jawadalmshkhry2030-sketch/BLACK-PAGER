from pathlib import Path
import shutil

p = Path("index.html")
s = p.read_text(encoding="utf-8")

css_anchor = "</style>"
css = """
/* BLACK PAGER welcome boot */
.screen { position:relative; overflow:hidden; }
.screen.off {
  background:#030503 !important;
  color:transparent !important;
  box-shadow:inset 0 0 18px #000 !important;
}
.screen.off > :not(#welcomeBoot),
.screen.booting > :not(#welcomeBoot) {
  visibility:hidden !important;
}
.welcome-boot {
  position:absolute;
  inset:0;
  z-index:20;
  display:flex;
  align-items:center;
  justify-content:center;
  background:#a9bd8c;
  color:#172313;
  overflow:hidden;
}
.welcome-boot[hidden] { display:none !important; }
.welcome-boot span {
  font-family:monospace;
  font-size:clamp(23px, 7vw, 34px);
  font-weight:900;
  letter-spacing:5px;
  text-shadow:2px 0 #70875b, -2px 0 #d2e2b8;
  clip-path:inset(0 100% 0 0);
  animation:welcomePixel 1.8s steps(12,end) forwards;
}
@keyframes welcomePixel {
  0% { clip-path:inset(0 100% 0 0); opacity:.25; }
  35% { opacity:.65; }
  100% { clip-path:inset(0 0 0 0); opacity:1; }
}
"""

if '/* BLACK PAGER welcome boot */' not in s:
    if css_anchor not in s:
        raise SystemExit("لم أجد نهاية قسم CSS")
    s = s.replace(css_anchor, css + "\n" + css_anchor, 1)

screen_anchor = '<div class="screen" id="pagerScreen">'
welcome_html = screen_anchor + '\n<div class="welcome-boot" id="welcomeBoot" hidden><span>WELCOME</span></div>'
if 'id="welcomeBoot"' not in s:
    if screen_anchor not in s:
        raise SystemExit("لم أجد شاشة البيجر")
    s = s.replace(screen_anchor, welcome_html, 1)

old_click = '''$("power").onclick = () => {
  powered = !powered;
  updatePowerUI();
};'''

new_click = '''function playWelcomeSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [
      { f: 523.25, t: 0.00, d: 0.22 },
      { f: 659.25, t: 0.24, d: 0.22 },
      { f: 783.99, t: 0.48, d: 0.28 },
      { f: 1046.5, t: 0.82, d: 0.55 }
    ];
    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = n.f;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + n.t);
      gain.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + n.t + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + n.t + n.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + n.t);
      osc.stop(ctx.currentTime + n.t + n.d + 0.02);
    });
    setTimeout(() => ctx.close().catch(() => {}), 2200);
  } catch (e) {
    console.warn("Welcome sound unavailable:", e);
  }
}

let welcomeTimer = null;

function startWelcomeSequence() {
  const screen = $("pagerScreen");
  const welcome = $("welcomeBoot");
  if (welcomeTimer) clearTimeout(welcomeTimer);

  screen.classList.remove("off");
  screen.classList.add("booting");
  welcome.hidden = false;
  playWelcomeSound();

  welcomeTimer = setTimeout(() => {
    welcome.hidden = true;
    screen.classList.remove("booting");
    welcomeTimer = null;
    updatePowerUI();
  }, 5000);
}

$("power").onclick = () => {
  if (powered) {
    powered = false;
    if (welcomeTimer) {
      clearTimeout(welcomeTimer);
      welcomeTimer = null;
    }
    $("welcomeBoot").hidden = true;
    $("pagerScreen").classList.remove("booting");
    updatePowerUI();
    return;
  }

  powered = true;
  updatePowerUI();
  startWelcomeSequence();
};'''

if 'function startWelcomeSequence()' not in s:
    if old_click not in s:
        raise SystemExit("لم أجد كود زر التشغيل المطابق؛ لم يتم حفظ أي تعديل")
    s = s.replace(old_click, new_click, 1)

backup = Path("index.html.before-welcome-boot")
if not backup.exists():
    shutil.copy2(p, backup)

p.write_text(s, encoding="utf-8")
print("تمت إضافة شاشة WELCOME وصوت الترحيب بنجاح")
print("النسخة الاحتياطية: " + str(backup))
