from pathlib import Path
import re

p = Path("index.html")
s = p.read_text()

def need(condition, message):
    if not condition:
        raise SystemExit("توقف بدون حفظ: " + message)

# التحقق من الملف
need('<div class="screen">' in s, "لم أجد شاشة البيجر")
need('function receive(text)' in s, "لم أجد استقبال الرسائل")
need('function clock() {' in s, "لم أجد الساعة")
need('const $ = id => document.getElementById(id);' in s, "لم أجد بداية السكربت")
need('screen-status' not in s and 'pagerScreen' not in s, "التعديل موجود مسبقاً")

# إضافة معرّف الشاشة
s = s.replace(
    '<div class="screen">',
    '<div class="screen" id="pagerScreen">',
    1
)

# إضافة شريط معلومات الشاشة
old = '<div class="message" id="message">اضغط POWER</div>'
new = '''<div class="screen-status">
<span id="dateLabel">--/--/----</span>
<span id="signalIndicator" class="offline">LINK OFF</span>
<span id="batteryIndicator">BAT --</span>
<span id="alertIndicator">MSG STBY</span>
</div>
<div class="message" id="message">اضغط POWER</div>'''

need(s.count(old) == 1, "موضع الرسالة غير مطابق")
s = s.replace(old, new, 1)

# تصميم شريط الشاشة
css = """
.screen-status {
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:5px;
  flex-wrap:wrap;
  font-size:9px;
  font-weight:bold;
  border-bottom:1px solid #71835d;
  padding-bottom:5px;
}
.screen-status .online { color:#174c19; }
.screen-status .offline { color:#8b2424; }
.screen-status .new-message {
  color:#8b1010;
  animation:msgBlink .65s steps(2,start) infinite;
}
#pagerScreen.flash {
  animation:screenFlash .35s ease-in-out 3;
}
@keyframes msgBlink {
  to { opacity:.25; }
}
@keyframes screenFlash {
  50% {
    background:#d9edb5;
    box-shadow:inset 0 0 25px #fff;
  }
}
@media(max-width:380px) {
  .screen-status { font-size:8px; gap:3px; }
}
"""

pos = s.find("</style>")
need(pos >= 0, "لم أجد نهاية CSS")
s = s[:pos] + css + "\n" + s[pos:]

# دوال المؤشرات
anchor = 'const $ = id => document.getElementById(id);'

helpers = '''
function updateLinkIndicator() {
  const label = $("signalIndicator");
  if (!label) return;

  const online = socket.connected;
  label.textContent = online ? "LINK ONLINE" : "LINK OFF";
  label.className = online ? "online" : "offline";
}

function updateBatteryIndicator() {
  const label = $("batteryIndicator");
  if (!label) return;

  if (!navigator.getBattery) {
    label.textContent = "BAT --";
    return;
  }

  navigator.getBattery().then(battery => {
    const update = () => {
      label.textContent = "BAT " +
        Math.round(battery.level * 100) + "%" +
        (battery.charging ? " +" : "");
    };

    update();
    battery.addEventListener("levelchange", update);
    battery.addEventListener("chargingchange", update);
  }).catch(() => {
    label.textContent = "BAT --";
  });
}

function setMessageIndicator(isNew) {
  const label = $("alertIndicator");
  if (!label) return;

  label.textContent = isNew ? "MSG NEW" : "MSG STBY";
  label.classList.toggle("new-message", isNew);
}

function flashPagerScreen() {
  const screen = $("pagerScreen");
  if (!screen) return;

  screen.classList.remove("flash");
  void screen.offsetWidth;
  screen.classList.add("flash");

  setTimeout(() => {
    screen.classList.remove("flash");
  }, 1100);
}

socket.on("connect", updateLinkIndicator);
socket.on("disconnect", updateLinkIndicator);
'''

need(s.count(anchor) >= 1, "موضع دوال JavaScript غير موجود")
s = s.replace(anchor, anchor + "\n" + helpers, 1)

# عند استقبال رسالة
anchor = '$("status").textContent="وصلت رسالة جديدة";'
need(s.count(anchor) == 1, "سطر استقبال الرسالة غير مطابق")

s = s.replace(
    anchor,
    anchor + '''
  setMessageIndicator(true);
  flashPagerScreen();''',
    1
)

# عند تشغيل وإطفاء الجهاز
anchor = '$("status").textContent=powered?"الجهاز يعمل":"الجهاز مغلق";'
need(s.count(anchor) == 1, "سطر حالة التشغيل غير مطابق")

s = s.replace(
    anchor,
    anchor + '''
  setMessageIndicator(false);
  $("pagerScreen").classList.remove("flash");''',
    1
)

# عند مسح الرسالة
pattern = r'(\$\("clear"\)\.onclick=\(\)=>\{[\s\S]*?\$\("state"\)\.textContent=powered\?"POWER ON":"POWER OFF";)'

s, count = re.subn(
    pattern,
    r'\1\n  setMessageIndicator(false);\n  $("pagerScreen").classList.remove("flash");',
    s,
    count=1
)

need(count == 1, "لم أستطع تحديد زر المسح")

# تحديث الساعة والتاريخ
pattern = r'function clock\(\) \{[\s\S]*?\n\}'

clock = '''function clock() {
  const now = new Date();

  $("clock").textContent = now.toLocaleTimeString("en-GB", {
    hour:"2-digit",
    minute:"2-digit"
  });

  $("dateLabel").textContent =
    now.toLocaleDateString("en-GB");
}'''

s, count = re.subn(
    pattern,
    lambda m: clock,
    s,
    count=1
)

need(count == 1, "لم أستطع تحديث الساعة")

# تشغيل المؤشرات
anchor = 'setInterval(clock,1000);'
need(s.count(anchor) == 1, "موضع تشغيل الساعة غير مطابق")

s = s.replace(
    anchor,
    anchor + '''
updateLinkIndicator();
updateBatteryIndicator();
setMessageIndicator(false);''',
    1
)

# فحوص قبل الحفظ
need(s.count('id="pagerScreen"') == 1, "معرّف الشاشة مكرر")
need(s.count('id="dateLabel"') == 1, "معرّف التاريخ مكرر")
need(s.count('function updateLinkIndicator()') == 1, "دالة الاتصال مكررة")

# حفظ نسخة احتياطية ثم الملف
backup = Path("index.html.before-screen-upgrade")
backup.write_text(p.read_text())
p.write_text(s)

print("تم التعديل بنجاح")
print("تم حفظ النسخة الاحتياطية")
