(() => {
  const $ = id => document.getElementById(id);

  const deviceKey = "blackPagerDeviceId";
  let deviceId = localStorage.getItem(deviceKey);

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(deviceKey, deviceId);
  }

  const tokenKey = "blackPagerAdminToken";

  function createSecret() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  }

  let adminToken = localStorage.getItem(tokenKey) || "";

  if (!/^[0-9a-f]{64}$/i.test(adminToken)) {
    adminToken = createSecret();
    localStorage.setItem(tokenKey, adminToken);
  }

  let adminRole = null;
  let checking = false;

  const entry = $("adminEntry");
  const message = $("adminMessage");

  async function request(url, method = "GET", body = null) {
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-device-id": deviceId,
        "x-admin-token": adminToken
      }
    };

    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "تعذر تنفيذ الطلب");
    }

    return data;
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      alert("تم النسخ");
    } catch {
      const field = document.createElement("textarea");
      field.value = value;
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
      alert("تم النسخ");
    }
  }

  async function checkStatus() {
    if (checking) return;
    checking = true;

    try {
      const status = await request("/api/admin/status");

      adminRole = status.role;

      entry.style.display = "block";
      $("ownerClaim").style.display = !status.claimed ? "block" : "none";
      $("ownerRecover").style.display =
        status.claimed && !adminRole ? "block" : "none";
      $("adminPairing").style.display =
        status.claimed && !adminRole ? "block" : "none";

      $("adminOpen").style.display = adminRole ? "block" : "none";

      $("pairDeviceId").value = deviceId;
      $("pairDeviceToken").value = adminToken;

      if (adminRole) {
        message.textContent =
          adminRole === "owner"
            ? "تم التحقق من صلاحية المالك"
            : "تم تفعيل صلاحية الإداري";
      } else if (status.claimed) {
        message.textContent = "هذا الجهاز غير إداري حالياً";
      } else {
        message.textContent = "يمكن تسجيل جهاز المالك";
      }
    } catch (error) {
      message.textContent = error.message;
    } finally {
      checking = false;
    }
  }

  async function loadPanel() {
    try {
      const data = await request("/api/admin/panel");

      $("adminRole").textContent =
        data.role === "owner" ? "الصلاحية: المالك" : "الصلاحية: إداري";

      $("ownerTools").style.display =
        data.role === "owner" ? "block" : "none";

      const online = $("onlineDevices");
      online.replaceChildren();

      data.online.forEach(device => {
        const line = document.createElement("div");
        line.className = "admin-device";
        line.textContent =
          "الموجة: " + device.wave +
          " | الصلاحية: " + device.role +
          " | الجهاز: " + device.deviceId;
        online.appendChild(line);
      });

      const admins = $("adminDevices");
      admins.replaceChildren();

      data.admins.forEach(device => {
        const line = document.createElement("div");
        line.className = "admin-device";

        line.textContent =
          device.role + " | " + device.deviceId +
          (device.online ? " | متصل بهذه النسخة" : " | غير متصل بهذه النسخة");

        if (data.role === "owner" && device.role === "admin") {
          const remove = document.createElement("button");
          remove.textContent = "إزالة";

          remove.onclick = async () => {
            try {
              await request(
                "/api/admin/remove/" + encodeURIComponent(device.deviceId),
                "DELETE"
              );
              await loadPanel();
            } catch (e) {
              alert(e.message);
            }
          };

          line.appendChild(remove);
        }

        admins.appendChild(line);
      });
    } catch (error) {
      alert(error.message);
    }
  }

  $("recoverOwner").onclick = async () => {
    try {
      const result = await request("/api/admin/recover-owner", "POST", {
        password: $("recoverOwnerPassword").value
      });

      adminToken = result.token;
      localStorage.setItem(tokenKey, adminToken);
      $("recoverOwnerPassword").value = "";
      await checkStatus();
      alert("تمت استعادة صلاحية المالك على هذا الجهاز");
    } catch (error) {
      alert(error.message);
    }
  };

  $("claimOwner").onclick = async () => {
    try {
      const result = await request("/api/admin/claim", "POST", {
        password: $("ownerPassword").value
      });

      adminToken = result.token;
      localStorage.setItem(tokenKey, adminToken);
      $("ownerPassword").value = "";

      await checkStatus();
      alert("تم تسجيل جهاز المالك");
    } catch (error) {
      alert(error.message);
    }
  };

  $("adminOpen").onclick = async () => {
    $("adminPanel").style.display = "block";
    await loadPanel();
  };

  $("adminClose").onclick = () => {
    $("adminPanel").style.display = "none";
  };

  $("adminRefresh").onclick = loadPanel;

  $("addAdmin").onclick = async () => {
    const targetId = $("targetDeviceId").value.trim();
    const targetToken = $("targetDeviceToken").value.trim();

    if (!targetId || !targetToken) {
      return alert("أدخل معرف الجهاز ورمز الربط");
    }

    try {
      await request("/api/admin/add", "POST", {
        deviceId: targetId,
        deviceToken: targetToken
      });

      $("targetDeviceId").value = "";
      $("targetDeviceToken").value = "";

      alert("تمت إضافة الجهاز كإداري");
      await loadPanel();
    } catch (error) {
      alert(error.message);
    }
  };

  $("changeIndexPassword").onclick = async () => {
    const currentPassword = $("indexCurrentPassword").value;
    const newPassword = $("indexNewPassword").value;
    const confirmPassword = $("indexConfirmPassword").value;
    const output = $("indexPasswordMessage");

    if (!currentPassword || !newPassword) {
      output.textContent = "أدخل كلمة المرور الحالية والجديدة";
      return;
    }

    if (newPassword.length < 8) {
      output.textContent = "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل";
      return;
    }

    if (newPassword !== confirmPassword) {
      output.textContent = "تأكيد كلمة المرور غير مطابق";
      return;
    }

    try {
      await request("/api/admin/index-password", "POST", {
        currentPassword,
        newPassword
      });

      $("indexCurrentPassword").value = "";
      $("indexNewPassword").value = "";
      $("indexConfirmPassword").value = "";
      output.textContent = "تم تغيير كلمة مرور الفهرس بنجاح";
    } catch (error) {
      output.textContent = error.message;
    }
  };

  $("copyDeviceId").onclick = () =>
    copyText($("pairDeviceId").value);

  $("copyPairToken").onclick = () =>
    copyText($("pairDeviceToken").value);

  if (typeof socket !== "undefined") {
    socket.on("connect", () => {
      socket.emit("register-device", deviceId);
    });

    socket.on("admin-granted", data => {
      if (data?.token) {
        adminToken = data.token;
        localStorage.setItem(tokenKey, adminToken);
        checkStatus();
      }
    });

    socket.on("admin-revoked", () => {
      checkStatus();
    });

    socket.on("admin-online-changed", () => {
      if ($("adminPanel").style.display === "block") {
        loadPanel();
      }
    });
  }

  checkStatus();
  setInterval(checkStatus, 8000);
})();
