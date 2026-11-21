from pathlib import Path
from datetime import datetime
import re

path = Path("index.html")
s = path.read_text(encoding="utf-8")

if "let reloadPending = false;" not in s:
    old = "let loading = false;"
    assert s.count(old) == 1, "لم أجد تعريف loading بالشكل المتوقع"
    s = s.replace(old, old + "\nlet reloadPending = false;", 1)

old_fetch = "const response=await fetch(url,options);"
assert s.count(old_fetch) == 1, "لم أجد سطر fetch بالشكل المتوقع"
s = s.replace(
    old_fetch,
    'const response=await fetch(url,{...options,cache:"no-store"});',
    1
)

start = s.index("async function loadData() {")
end = s.index("\nfunction makeButton", start)

new_function = '''async function loadData() {
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
'''

s = s[:start] + new_function + s[end:]

backup = Path("index.html.before-load-fix-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
backup.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
path.write_text(s, encoding="utf-8")

print("تم إصلاح تحميل القوائم")
print("النسخة الاحتياطية:", backup)
