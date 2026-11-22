
const socket = io();

const $ = id => document.getElementById(id);

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
    label.textContent = "BAT N/A";
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
    label.textContent = "BAT N/A";
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


function changeWave(direction) {
  currentWave = ((currentWave - 1 + direction + totalWaves) % totalWaves) + 1;
  $("waveLabel").textContent = "WAVE " + String(currentWave).padStart(2, "0");
  $("notice").textContent = "جاري تغيير الموجة...";
  socket.emit("join-wave", currentWave);
}
$("waveNext").onclick = () => changeWave(1);
$("wavePrev").onclick = () => changeWave(-1);


let powered = false;
let booting = false;
let bootTimer = null;
let notificationsEnabled = localStorage.getItem("pagerNotifications") !== "false";
let currentWave = 1;
const totalWaves = 50;
let data = [];
const visibleMeaningIds = new Set();
let loading = false;
let reloadPending = false;
let pagerVolume = Number(localStorage.getItem("pagerVolume"));
if (!Number.isFinite(pagerVolume)) pagerVolume = 0.7;
pagerVolume = Math.max(0, Math.min(1, pagerVolume));

function updateVolume() {
  $("volumeLabel").textContent = "الصوت " + Math.round(pagerVolume * 100) + "%";
  localStorage.setItem("pagerVolume", String(pagerVolume));
}
$("volumeUp").onclick = () => {
  pagerVolume = Math.min(1, Math.round((pagerVolume + 0.1) * 10) / 10);
  updateVolume();
};
$("volumeDown").onclick = () => {
  pagerVolume = Math.max(0, Math.round((pagerVolume - 0.1) * 10) / 10);
  updateVolume();
};
updateVolume();

socket.on("pager-message", receive);
socket.on("send-success", () => {
  $("notice").textContent = "تم إرسال الرسالة";
  $("status").textContent = "تم إرسال الرسالة بنجاح";
});
socket.on("data-changed", loadData);

socket.on("connect", () => {
  socket.emit("join-wave", currentWave);
});

socket.on("wave-joined", (wave) => {
  $("notice").textContent = "تم الاتصال بالموجة WAVE " + String(wave).padStart(2, "0");
});

async function api(url, method="GET", body=null) {
  const options = {method,headers:{"Content-Type":"application/json"}};
  if(body) options.body=JSON.stringify(body);
  const response=await fetch(url,{...options,cache:"no-store"});
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(result.error||"حدث خطأ");
  return result;
}

const refreshGroups = document.getElementById("refreshGroups");
if (refreshGroups) {
  refreshGroups.addEventListener("click", async () => {
    refreshGroups.disabled = true;
    refreshGroups.textContent = "جاري التحديث...";
    await loadData();
    refreshGroups.disabled = false;
    refreshGroups.textContent = "↻ تحديث القوائم";
  });
}

async function loadData() {
  $("notice").textContent = "جاري تحميل القوائم...";
  if (loading) {
    reloadPending = true;
    return;
  }

  loading = true;
  try {
    const result = await api("/api/data");

    if (!Array.isArray(result.groups) || !Array.isArray(result.items)) {
      throw new Error("بيانات القوائم غير مكتملة");
    }

    data = result.groups.map(group => ({
      ...group,
      items: result.items.filter(item => item.group_id === group.id)
    }));

    renderGroups();

    if (!$("indexArea").hidden) renderIndex();
    $("notice").textContent = "";
  } catch (error) {
    $("notice").textContent = "تعذر تحميل القوائم: " + error.message;
  } finally {
    loading = false;

    if (reloadPending) {
      reloadPending = false;
      void loadData();
    }
  }
}

function makeButton(label, className, action) {
  const button=document.createElement("button");
  button.textContent=label;
  if(className)button.className=className;
  button.onclick=action;
  return button;
}

function renderGroups() {
  const container=$("groups");
  container.replaceChildren();

  data.forEach(group=>{
    const box=document.createElement("details");
    box.className="group";

    const summary=document.createElement("summary");
    summary.textContent=group.title;
    box.appendChild(summary);

    const row=document.createElement("div");
    row.className="pagers";

    group.items.forEach((item,i)=>{
      const btn=makeButton("بيجر "+(i+1),"pager-button",()=>sendPager(group,item));
      row.appendChild(btn);
    });

    box.appendChild(row);

    const actions=document.createElement("div");
    actions.className="small-actions";

    actions.appendChild(makeButton("⊕ إضافة بيجر","",()=>addItem(group)));
    actions.appendChild(makeButton("تعديل القائمة","edit",()=>editGroup(group)));
    actions.appendChild(makeButton("حذف القائمة","danger",()=>deleteGroup(group)));

    group.items.forEach((item,i)=>{
      actions.appendChild(makeButton("تعديل بيجر "+(i+1),"edit",()=>editItem(item)));
      actions.appendChild(makeButton("حذف بيجر "+(i+1),"danger",()=>deleteItem(item)));
    });

    box.appendChild(actions);
    container.appendChild(box);
  });
}

async function addGroup() {
  const title=prompt("اكتب اسم القائمة الجديدة:");
  if(title===null)return;
  if(!title.trim())return alert("اكتب اسم القائمة");
  try {
    await api("/api/groups","POST",{title:title.trim()});
    await loadData();
    $("notice").textContent="تم إنشاء القائمة";
  } catch(error){alert(error.message);}
}

async function addItem(group) {
  window.openPagerModal(group);
}

async function editGroup(group) {
  const title=prompt("اكتب الاسم الجديد للقائمة:",group.title);
  if(title===null)return;
  if(!title.trim())return alert("اسم القائمة مطلوب");
  try {
    await api("/api/groups/"+encodeURIComponent(group.id),"PATCH",{title:title.trim()});
    await loadData();
    $("notice").textContent="تم تعديل القائمة";
  } catch(error){alert(error.message);}
}

async function deleteGroup(group) {
  if(!confirm("هل تريد حذف القائمة وجميع البيجرات الموجودة داخلها؟"))return;
  try {
    await api("/api/groups/"+encodeURIComponent(group.id),"DELETE");
    await loadData();
    $("notice").textContent="تم حذف القائمة";
  } catch(error){alert(error.message);}
}

async function editItem(item) {
  const needsNumber = item.phrase.startsWith("[[N]]");
  const currentPhrase = needsNumber ? item.phrase.slice(5) : item.phrase;
  const phrase=prompt("اكتب العبارة الجديدة:",currentPhrase);
  if(phrase===null)return;
  if(!phrase.trim())return alert("العبارة مطلوبة");
  try {
    const savedPhrase = (needsNumber ? "[[N]]" : "") + phrase.trim();
    await api("/api/items/"+encodeURIComponent(item.id),"PATCH",{phrase:savedPhrase});
    await loadData();
    $("notice").textContent="تم تعديل البيجر";
  } catch(error){alert(error.message);}
}

async function deleteItem(item) {
  if(!confirm("هل تريد حذف هذا البيجر؟"))return;
  try {
    await api("/api/items/"+encodeURIComponent(item.id),"DELETE");
    await loadData();
    $("notice").textContent="تم حذف البيجر";
  } catch(error){alert(error.message);}
}

function sendPager(group,item) {
  if (!powered) {
    $("notice").textContent = "شغّل البيجر أولاً";
    return;
  }

  if (!socket.connected) {
    $("notice").textContent = "لا يوجد اتصال بالسيرفر";
    $("status").textContent = "فشل الإرسال: غير متصل";
    return;
  }

  const needsNumber = item.phrase.startsWith("[[N]]");
  let text = needsNumber ? item.phrase.slice(5) : item.phrase;

  if (needsNumber || (group.title === "== ماب النووي ==" && item.phrase === "كمبر عند البيس رقم")) {
    const number = prompt("اكتب رقماً من 1 إلى 6:");
    if (number === null) return;
    if (!/^[1-6]$/.test(number.trim())) {
      $("notice").textContent = "اختر رقماً من 1 إلى 6";
      return;
    }
    text += " " + number.trim();
  }

  $("state").textContent = "SENDING";
  $("status").textContent = "جاري إرسال الرسالة";
  $("notice").textContent = "جاري الإرسال...";
  socket.emit("send-message", text);
}

let pagerAudioContext = null;

function getAudioContext() {
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;

  if (!pagerAudioContext) pagerAudioContext = new C();

  if (pagerAudioContext.state === "suspended") {
    pagerAudioContext.resume().catch(() => {});
  }

  return pagerAudioContext;
}

function beep() {
  try {
    const c = getAudioContext();
    if (!c) return;

    const start = c.currentTime + 0.02;

    [0, 0.25].forEach(delay => {
      const o = c.createOscillator();
      const g = c.createGain();

      o.type = "square";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.035 * pagerVolume, start + delay);
      g.gain.setValueAtTime(0, start + delay + 0.14);

      o.connect(g);
      g.connect(c.destination);
      o.start(start + delay);
      o.stop(start + delay + 0.15);
    });
  } catch (e) {
    console.error("Pager beep error:", e);
  }
}

function nuclearAlarm() {
  const alarm = new Audio("/sounds/nuclear-alarm.mp3");
  alarm.volume = pagerVolume;
  alarm.play().catch(error => {
    console.error("Alarm playback error:", error);
  });
}

function receive(text) {
  if (!powered || booting) return;
  $("message").textContent=text;
  $("state").textContent="NEW MESSAGE";
  $("status").textContent="وصلت رسالة جديدة";
  setMessageIndicator(true);
  flashPagerScreen();

  if(text.startsWith("جمعت النووي خذ طيارة و تعال")) {
    nuclearAlarm();
  } else {
    beep();
  }

  if(navigator.vibrate)navigator.vibrate(150);

  if("Notification" in window && Notification.permission==="granted") {
    new Notification("BLACK PAGER",{
      body:"وصلتك رسالة جديدة: "+text,
      tag:"black-pager-message"
    });
  }
}

$("addGroup").onclick=addGroup;

function updatePowerUI() {
  const powerButton = $("power");
  powerButton.classList.toggle("on", powered);
  powerButton.classList.toggle("off", !powered);
  powerButton.setAttribute("aria-pressed", String(powered));

  $("powerLabel").textContent = powered ? "POWER ON" : "POWER OFF";
  $("state").textContent = powered ? "POWER ON" : "POWER OFF";
  $("message").textContent = powered
    ? (booting ? "" : "جاهز لاستقبال الرسائل")
    : "";

  $("status").textContent = powered ? "الجهاز يعمل" : "الجهاز مغلق";
  $("pagerScreen").classList.toggle("off", !powered);
  $("pagerScreen").classList.toggle("booting", booting);
  $("welcomeBoot").hidden = !booting;

  setMessageIndicator(false);
  $("pagerScreen").classList.remove("flash");
}

$("power").onclick = () => {
  if (powered) {
    powered = false;
    booting = false;
    clearTimeout(bootTimer);
    updatePowerUI();
    return;
  }

  powered = true;
  booting = true;
  updatePowerUI();

  // صوت البيجر الحقيقي عند الإقلاع
  const welcomeAudio = new Audio("/sounds/welcome.mp3");
  welcomeAudio.volume = 0.8;
  welcomeAudio.play().catch(err => {
    console.warn("تعذر تشغيل صوت الترحيب:", err);
  });

  bootTimer = setTimeout(() => {
    if (!powered) return;
    booting = false;
    updatePowerUI();
  }, 5000);
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

function renderIndex() {
  const index = $("index");
  index.replaceChildren();

  data.forEach((group) => {
    const section = document.createElement("div");
    section.className = "index-group";

    const title = document.createElement("div");
    title.className = "index-title";
    title.textContent = group.title;
    section.appendChild(title);

    group.items.forEach((item, i) => {
      const line = document.createElement("div");
      line.className = "index-item";

      const label = document.createElement("span");
      label.textContent = "بيجر " + (i + 1) + ": ";

      const meaning = document.createElement("span");
      meaning.className = "meaning";
      meaning.textContent = visibleMeaningIds.has(item.id)
        ? (item.phrase.startsWith("[[N]]") ? item.phrase.slice(5) : item.phrase)
        : "***";

      const toggle = document.createElement("button");
      toggle.className = "meaning-toggle";
      toggle.textContent = visibleMeaningIds.has(item.id)
        ? "إخفاء"
        : "إظهار";

      toggle.onclick = () => {
        if (visibleMeaningIds.has(item.id)) {
          visibleMeaningIds.delete(item.id);
        } else {
          visibleMeaningIds.add(item.id);
        }
        renderIndex();
      };

      line.append(label, meaning, toggle);
      section.appendChild(line);
    });

    index.appendChild(section);
  });
}

$("showAll").onclick = () => {
  data.forEach(group => {
    group.items.forEach(item => visibleMeaningIds.add(item.id));
  });
  renderIndex();
};

$("hideAll").onclick = () => {
  visibleMeaningIds.clear();
  renderIndex();
};

$("indexBtn").onclick = async () => {
  if (!$("indexArea").hidden) {
    $("indexArea").hidden = true;
    $("index").replaceChildren();
    $("pass").value = "";
    visibleMeaningIds.clear();
    $("indexBtn").textContent = "فتح الفهرس";
    return;
  }

  const indexButton = $("indexBtn");
  indexButton.disabled = true;

  try {
    const response = await fetch("/api/index/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("pass").value })
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      $("notice").textContent = result.error || "كلمة المرور غير صحيحة";
      return;
    }
  } catch {
    $("notice").textContent = "تعذر الاتصال بالسيرفر";
    return;
  } finally {
    indexButton.disabled = false;
  }

  $("indexArea").hidden = false;
  visibleMeaningIds.clear();
  renderIndex();
  $("indexBtn").textContent = "إغلاق الفهرس";
};

function clock() {
  const now = new Date();
  const clockLabel = $("clock");
  const dateLabel = $("dateLabel");

  if (clockLabel) {
    clockLabel.textContent =
      now.getHours().toString().padStart(2, "0") + ":" +
      now.getMinutes().toString().padStart(2, "0");
  }

  if (dateLabel) {
    dateLabel.textContent =
      now.getDate().toString().padStart(2, "0") + "/" +
      (now.getMonth() + 1).toString().padStart(2, "0") + "/" +
      now.getFullYear();
  }
}

clock();
setInterval(clock, 1000);
updateLinkIndicator();
updateBatteryIndicator();
window.addEventListener("pageshow", () => {
  clock();
  updateLinkIndicator();
  updateBatteryIndicator();
});
setMessageIndicator(false);
loadData();
