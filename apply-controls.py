from pathlib import Path
import re, shutil, sys

p = Path("index.html")
s = p.read_text(encoding="utf-8")

# التأكد من وجود الأجزاء المطلوبة
required = [
    '<div class="controls">',
    '$("power").onclick=()=>{',
    'function renderIndex() {',
    'function receive(text) {',
    'let powered = false;'
]
for item in required:
    if item not in s:
        sys.exit("توقف: لم يتم العثور على الجزء: " + item)

backup = Path("index.html.before-switches")
shutil.copy2(p, backup)

# تصميم المفاتيح
css = r"""
/* BLACK PAGER interactive controls */
.screen.off {
  background:#172019 !important;
  color:#465044 !important;
  box-shadow:inset 0 0 22px #050805 !important;
  border-color:#080b09;
}
.screen.off .message,
.screen.off .top,
.screen.off .bottom,
.screen.off .screen-status {
  opacity:.28;
}
.device-controls {
  display:flex;
  justify-content:center;
  align-items:flex-start;
  gap:13px;
  flex-wrap:wrap;
  margin:18px 0 10px;
}
.control-unit {
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:7px;
  min-width:75px;
  color:#b8c5b9;
  font-size:11px;
}
.switch-control {
  position:relative;
  width:58px;
  height:58px;
  padding:0;
  border-radius:50%;
  border:2px solid #68736a;
  background:radial-gradient(circle at 35% 28%,#515a52,#171b18 70%);
  box-shadow:inset 0 2px 5px #000,0 3px 7px #000;
  display:flex;
  align-items:center;
  justify-content:center;
}
.rotary::before {
  content:"";
  width:34px;
  height:34px;
  border-radius:50%;
  background:linear-gradient(145deg,#858d83,#292f2a 65%);
  border:2px solid #111;
  box-shadow:0 2px 4px #000;
}
.rotary::after {
  content:"";
  position:absolute;
  width:4px;
  height:15px;
  border-radius:4px;
  background:#d5ded1;
  top:8px;
  left:27px;
  transform-origin:2px 21px;
  transform:rotate(-45deg);
  transition:transform .2s ease,background .2s;
}
.rotary.on {
  border-color:#9dbb83;
  box-shadow:0 0 10px #8aa96b55,inset 0 2px 5px #000;
}
.rotary.on::after {
  transform:rotate(45deg);
  background:#b7e58e;
}
.rocker {
  width:58px;
  height:42px;
  border-radius:10px;
  font-size:19px;
  background:linear-gradient(#414941,#171c18);
  border:2px solid #626d63;
}
.rocker.active {
  border-color:#9dbb83;
  color:#c6e5aa;
  box-shadow:0 0 9px #8aa96b55;
}
.volume-panel {
  display:flex;
  align-items:center;
  justify-content:center;
  gap:9px;
  width:100%;
  margin-top:3px;
  padding:9px;
  background:#101511;
  border:1px solid #39443c;
  border-radius:10px;
}
.volume-panel[hidden] { display:none; }
.volume-panel button { min-width:42px; }
.volume-panel span { min-width:75px;text-align:center;font-size:12px; }
"""

s = s.replace("</style>", css + "\n</style>", 1)

# استبدال منطقة الأزرار فقط
start = s.index('<div class="controls">')
end = s.index('</div>', s.index('<div class="note" id="status">', start))
new_controls = """<div class="device-controls">
  <div class="control-unit">
    <button class="switch-control rotary off" id="power" type="button"
      aria-label="تشغيل أو إطفاء البيجر" aria-pressed="false"></button>
    <span id="powerLabel">POWER OFF</span>
  </div>
  <div class="control-unit">
    <button class="switch-control rocker" id="clear" type="button"
      aria-label="مسح الرسالة">⌫</button>
    <span>مسح الرسالة</span>
  </div>
  <div class="control-unit">
    <button class="switch-control rocker" id="volumeToggle" type="button"
      aria-expanded="false">♫</button>
    <span>إعدادات الصوت</span>
  </div>
  <div class="control-unit">
    <button class="switch-control rocker" id="enableNotifications" type="button"
      aria-pressed="false">◉</button>
    <span id="notificationLabel">الإشعارات OFF</span>
  </div>
  <div class="volume-panel" id="volumePanel" hidden>
    <button id="volumeDown" type="button" aria-label="خفض الصوت">−</button>
    <span id="volumeLabel">الصوت 70%</span>
    <button id="volumeUp" type="button" aria-label="رفع الصوت">+</button>
  </div>
</div>
"""
s = s[:start] + new_controls + s[end+6:]

# حالة الإشعارات محفوظة على الجهاز
s = s.replace(
    'let powered = false;',
    'let powered = false;\nlet notificationsEnabled = localStorage.getItem("pagerNotifications") !== "false";',
    1
)

# منع استقبال الرسائل على شاشة مطفأة
s = s.replace(
    'function receive(text) {\n',
    'function receive(text) {\n  if (!powered) return;\n',
    1
)

# استبدال أحداث المفاتيح مع الإبقاء على وظائف الصوت الحالية
a = s.index('$("power").onclick=()=>{')
b = s.index('function renderIndex() {', a)

handlers = r'''function updatePowerUI() {
  const powerButton = $("power");
  powerButton.classList.toggle("on", powered);
  powerButton.classList.toggle("off", !powered);
  powerButton.setAttribute("aria-pressed", String(powered));
  $("powerLabel").textContent = powered ? "POWER ON" : "POWER OFF";
  $("state").textContent = powered ? "POWER ON" : "POWER OFF";
  $("message").textContent = powered ? "جاهز لاستقبال الرسائل" : "اضغط POWER";
  $("status").textContent = powered ? "الجهاز يعمل" : "الجهاز مغلق";
  $("pagerScreen").classList.toggle("off", !powered);
  setMessageIndicator(false);
  $("pagerScreen").classList.remove("flash");
}

$("power").onclick = () => {
  powered = !powered;
  updatePowerUI();
};

function updateNotificationUI() {
  const button = $("enableNotifications");
  const available = "Notification" in window;
  const active = available && Notification.permission === "granted" && notificationsEnabled;
  button.classList.toggle("active", active);
  button.setAttribute("aria-pressed", String(active));
  $("notificationLabel").textContent = active ? "الإشعارات ON" : "الإشعارات OFF";
}

$("enableNotifications").onclick = async () => {
  if (!("Notification" in window)) {
    $("notice").textContent = "المتصفح لا يدعم الإشعارات";
    updateNotificationUI();
    return;
  }

  if (Notification.permission === "denied") {
    $("notice").textContent = "الإشعارات محظورة من إعدادات المتصفح";
    updateNotificationUI();
    return;
  }

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    notificationsEnabled = permission === "granted";
  } else {
    notificationsEnabled = !notificationsEnabled;
  }

  localStorage.setItem("pagerNotifications", String(notificationsEnabled));
  $("notice").textContent = notificationsEnabled ? "تم تفعيل الإشعارات" : "تم إيقاف الإشعارات";
  updateNotificationUI();
};

$("clear").onclick = () => {
  $("message").textContent = powered ? "لا توجد رسائل" : "اضغط POWER";
  $("state").textContent = powered ? "POWER ON" : "POWER OFF";
  setMessageIndicator(false);
  $("pagerScreen").classList.remove("flash");
};

$("volumeToggle").onclick = () => {
  const panel = $("volumePanel");
  panel.hidden = !panel.hidden;
  $("volumeToggle").classList.toggle("active", !panel.hidden);
  $("volumeToggle").setAttribute("aria-expanded", String(!panel.hidden));
};

updatePowerUI();
updateNotificationUI();

'''
s = s[:a] + handlers + s[b:]

p.write_text(s, encoding="utf-8")
print("تم تحديث المفاتيح بنجاح")
print("تم حفظ النسخة الاحتياطية:", backup)
