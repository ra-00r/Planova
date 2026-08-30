"use strict";

/********************** 0) Supabase Config ************************/
// Using YOUR values (public publishable key)
const SUPABASE_URL = "https://qcfnilswrabwtkitbofj.supabase.co/";
const SUPABASE_ANON_KEY = "sb_publishable_v4TO8Lh2upbkp9byJRBgUA_PSarae05";

// Avoid double-init
const sb =
  window.__planova_sb ||
  (window.__planova_sb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        // iOS WebKit can hang with locks/session persistence
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: true,
      },
    }
  ));

/********************** 1A) Session persistence (safe for iOS WebKit) **********************/
const PLANOVA_SESSION_KEY = "planova.session.v1";

function saveSessionTokens(session) {
  if (!session?.access_token || !session?.refresh_token) return;
  const payload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  };
  localStorage.setItem(PLANOVA_SESSION_KEY, JSON.stringify(payload));
}

function clearSessionTokens() {
  localStorage.removeItem(PLANOVA_SESSION_KEY);
}

async function restoreSessionFromStorage() {
  const raw = localStorage.getItem(PLANOVA_SESSION_KEY);
  if (!raw) return null;

  try {
    const { access_token, refresh_token } = JSON.parse(raw);
    if (!access_token || !refresh_token) {
      clearSessionTokens();
      return null;
    }

    const { data, error } = await sb.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      clearSessionTokens();
      return null;
    }

    if (data?.session) saveSessionTokens(data.session);
    return data?.session || null;
  } catch (e) {
    clearSessionTokens();
    return null;
  }
}

/********************** 1) Helpers ************************/
const $ = (id) => document.getElementById(id);
// Returns "YYYY-MM-DD" in the user's LOCAL timezone (fixes UTC offset bug)
function localDateStr(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const pageName = () => document.body?.dataset?.page || "";
const show = (el) => {
  if (el) el.style.display = "";
};
const hide = (el) => {
  if (el) el.style.display = "none";
};

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
function fmtShort(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function setNotice(id, msg, isError = false) {
  const el = $(id);
  if (!el) return;
  el.style.display = msg ? "block" : "none";
  el.textContent = msg || "";
  el.style.borderColor = isError
    ? "rgba(255,90,90,.35)"
    : "rgba(255,255,255,.14)";
}

/********************** 2) Date/time ************************/
function updateDateTime() {
  const el = $("dateTime");
  if (!el) return;
  const now = new Date();
  el.textContent =
    now.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }) +
    " · " +
    now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/********************** 3) Auth Modal ************************/
let authMode = "login"; // login | signup

function openAuthModal(mode = "login") {
  authMode = mode;
  const overlay = $("authOverlay");
  if (!overlay) return;
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden", "false");

  const tLogin = $("tabLogin");
  const tSignup = $("tabSignup");
  const tForgot = $("tabForgot");

  if (tLogin) tLogin.classList.toggle("active", mode === "login");
  if (tSignup) tSignup.classList.toggle("active", mode === "signup");
  if (tForgot) tForgot.classList.toggle("active", mode === "forgot");

  const extra = $("signupExtra");
  if (extra) extra.style.display = mode === "signup" ? "block" : "none";

  // Show/hide forgot vs login/signup
  const forgotSection = $("forgotSection");
  const loginSignupSection = $("loginSignupSection");
  const mainForm = $("authForm")?.querySelector(".form:not(#signupExtra .form)");

  if (mode === "forgot") {
    if (forgotSection) forgotSection.style.display = "block";
    if (loginSignupSection) loginSignupSection.style.display = "none";
    // Hide main email/password fields
    const forms = $("authForm")?.querySelectorAll(":scope > .form");
    forms?.forEach(f => f.style.display = "none");
    if (extra) extra.style.display = "none";
  } else {
    if (forgotSection) forgotSection.style.display = "none";
    if (loginSignupSection) loginSignupSection.style.display = "block";
    const forms = $("authForm")?.querySelectorAll(":scope > .form");
    forms?.forEach(f => f.style.display = "");
    if (extra) extra.style.display = mode === "signup" ? "block" : "none";
  }

  const submit = $("authSubmit");
  if (submit) submit.textContent = mode === "signup" ? "Sign Up" : "Login";

  setNotice("authNotice", "");
}
function closeAuthModal() {
  const overlay = $("authOverlay");
  if (!overlay) return;
  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");
  const form = $("authForm");
  if (form) form.reset();
  setNotice("authNotice", "");
}

/********************** 4) Profiles ************************/
async function ensureProfile(session) {
  if (!session?.user?.id) return;
  const user = session.user;

  const fullName =
    user.user_metadata?.full_name || user.user_metadata?.name || "";
  const payload = {
    id: user.id,
    full_name: fullName,
    email: user.email || "",
  };

  await sb.from("profiles").upsert(payload, { onConflict: "id" });
}

// ===================== Profile Modal =====================
function openProfileModal() {
  const overlay = $("profileOverlay");
  if (!overlay) return;
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden", "false");
  setNotice("profileNotice", "");
  loadProfileData();
}

function closeProfileModal() {
  const overlay = $("profileOverlay");
  if (!overlay) return;
  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");
}

async function loadProfileData() {
  const session = await getSessionSafe();
  if (!session) return;

  const { data } = await sb
    .from("profiles")
    .select("full_name, email, avatar_url")
    .eq("id", session.user.id)
    .maybeSingle();

  if ($("profileName")) $("profileName").value = data?.full_name || "";
  if ($("profileEmail")) $("profileEmail").value = data?.email || session.user.email || "";

  // Show avatar preview if exists
  if (data?.avatar_url) {
    updateAvatarDisplay(data.avatar_url);
  }
}

function updateAvatarDisplay(url) {
  // Update all avatar elements
  const avatarMini = $("avatarMini");
  if (avatarMini) {
    if (url) {
      avatarMini.style.backgroundImage = `url(${url})`;
      avatarMini.style.backgroundSize = "cover";
      avatarMini.style.backgroundPosition = "center";
    }
  }
  const profilePreview = $("profileAvatarPreview");
  if (profilePreview) {
    profilePreview.src = url;
    profilePreview.style.display = "block";
  }
}

async function saveProfile(e) {
  e.preventDefault();
  const session = await getSessionSafe();
  if (!session) {
    openAuthModal("login");
    return;
  }

  setNotice("profileNotice", "Saving...");

  try {
    const newName = $("profileName")?.value?.trim();
    const avatarFile = $("profileAvatarInput")?.files?.[0];

    let avatarUrl = null;

    // Upload avatar if selected
    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const fileName = `${session.user.id}/avatar.${ext}`;
      const { error: uploadError } = await sb.storage
        .from("avatars")
        .upload(fileName, avatarFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = sb.storage.from("avatars").getPublicUrl(fileName);
      avatarUrl = urlData?.publicUrl || null;
    }

    // Update profile
    const updatePayload = { full_name: newName };
    if (avatarUrl) updatePayload.avatar_url = avatarUrl;

    const { error } = await sb
      .from("profiles")
      .update(updatePayload)
      .eq("id", session.user.id);

    if (error) throw error;

    // Update auth metadata
    await sb.auth.updateUser({ data: { full_name: newName } });

    // Update password if provided
    const newPassword = $("profilePassword")?.value?.trim();
    if (newPassword) {
      if (newPassword.length < 6) {
        setNotice("profileNotice", "Password must be at least 6 characters.", true);
        return;
      }
      const { error: passError } = await sb.auth.updateUser({ password: newPassword });
      if (passError) throw passError;
    }

    setNotice("profileNotice", "Profile updated successfully!");

    // Refresh UI
    await updateAuthUI();
    if (avatarUrl) updateAvatarDisplay(avatarUrl);

    setTimeout(() => closeProfileModal(), 1200);
  } catch (err) {
    setNotice("profileNotice", err?.message || "Failed to update profile.", true);
  }
}

function bindProfileModal() {
  // Attach to avatar click or profile-mini click
  $("avatarMini")?.addEventListener("click", async () => {
    const session = await getSessionSafe();
    if (!session) { openAuthModal("login"); return; }
    openProfileModal();
  });
  $("sidebarName")?.addEventListener("click", async () => {
    const session = await getSessionSafe();
    if (!session) { openAuthModal("login"); return; }
    openProfileModal();
  });
  $("profileClose")?.addEventListener("click", closeProfileModal);
  $("profileCancel")?.addEventListener("click", closeProfileModal);
  $("profileForm")?.addEventListener("submit", saveProfile);

  // Avatar file preview
  $("profileAvatarInput")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const preview = $("profileAvatarPreview");
      if (preview) { preview.src = ev.target.result; preview.style.display = "block"; }
    };
    reader.readAsDataURL(file);
  });
}

async function getDisplayName(session) {
  if (!session?.user) return "Guest";

  const { data } = await sb
    .from("profiles")
    .select("full_name,email")
    .eq("id", session.user.id)
    .maybeSingle();

  const name = data?.full_name?.trim();
  if (name) return name;

  const meta = session.user.user_metadata || {};
  return meta.full_name || meta.name || session.user.email || "User";
}

/********************** 4B) Robust session getter ************************/
async function getSessionSafe() {
  // 1) Try normal
  let { data } = await sb.auth.getSession();
  let session = data?.session || null;

  // 2) If not found, restore from our storage
  if (!session) {
    session = await restoreSessionFromStorage();
    const res = await sb.auth.getSession();
    session = res.data?.session || session || null;
  }

  return session;
}

async function updateAuthUI() {
  const session = await getSessionSafe();

  if (session) await ensureProfile(session);

  const name = await getDisplayName(session);

  if ($("userName")) $("userName").textContent = name;
  if ($("sidebarName")) $("sidebarName").textContent = name;
  if ($("welcomeName")) $("welcomeName").textContent = name;

  const email = session?.user?.email || "Not signed in";
  if ($("userEmail")) $("userEmail").textContent = email;
  if ($("sidebarEmail")) $("sidebarEmail").textContent = email;

  // Load avatar on every page
  if (session?.user?.id) {
    const { data: prof } = await sb.from("profiles").select("avatar_url").eq("id", session.user.id).maybeSingle();
    if (prof?.avatar_url) updateAvatarDisplay(prof.avatar_url);
  }

  const btnLogin = $("btnLogin");
  const btnSignup = $("btnSignup");
  const btnLogout = $("btnLogout");

  if (session) {
    hide(btnLogin);
    hide(btnSignup);
    show(btnLogout);
  } else {
    show(btnLogin);
    show(btnSignup);
    hide(btnLogout);
  }

  return session;
}

function bindAuthUI() {
  $("btnLogin")?.addEventListener("click", () => openAuthModal("login"));
  $("btnSignup")?.addEventListener("click", () => openAuthModal("signup"));
  $("btnLogout")?.addEventListener("click", async () => {
    await sb.auth.signOut();
    clearSessionTokens();
    await updateAuthUI();
  });

  $("authClose")?.addEventListener("click", closeAuthModal);
  $("authCancel")?.addEventListener("click", closeAuthModal);

  $("tabLogin")?.addEventListener("click", () => openAuthModal("login"));
  $("tabSignup")?.addEventListener("click", () => openAuthModal("signup"));
  $("tabForgot")?.addEventListener("click", () => openAuthModal("forgot"));

  $("forgotCancel")?.addEventListener("click", () => openAuthModal("login"));
  $("forgotSubmit")?.addEventListener("click", async () => {
    const email = $("forgotEmail")?.value?.trim();
    if (!email) {
      setNotice("authNotice", "Please enter your email.", true);
      return;
    }
    setNotice("authNotice", "Sending reset link...");
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: "https://ra-00r.github.io/Planova/reset-password.html",
      });
      if (error) throw error;
      setNotice("authNotice", "Reset link sent! Check your email inbox.");
    } catch (err) {
      setNotice("authNotice", err?.message || "Failed to send reset link.", true);
    }
  });

  $("authForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = $("authEmail")?.value?.trim();
    const password = $("authPassword")?.value;
    const fullName = $("authFullName")?.value?.trim();

    if (!email || !password) {
      setNotice("authNotice", "Please enter email and password.", true);
      return;
    }

    setNotice("authNotice", "Working...");

    try {
      if (authMode === "signup") {
        if (!fullName) {
          setNotice("authNotice", "Please enter your full name.", true);
          return;
        }

        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: "https://ra-00r.github.io/Planova/confirm-email.html",
          },
        });
        if (error) throw error;

        if (data?.session) {
          saveSessionTokens(data.session);
          await updateAuthUI();
          closeAuthModal();
        } else {
          // Email confirmation required
          closeAuthModal();
          setNotice("authNotice", "");
          // Show confirmation message
          setTimeout(() => {
            alert("Account created! Please check your email inbox and click the confirmation link to activate your account.");
          }, 300);
        }

        // Check if admin and redirect
        const { data: prof } = await sb.from("profiles").select("is_admin").eq("id", data.session.user.id).maybeSingle();
        if (prof?.is_admin) {
          const goAdmin = confirm("Admin account detected. Go to Admin Panel?");
          if (goAdmin) location.href = "admin.html";
        }
      } else {
        const { data, error } = await sb.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        if (data?.session) saveSessionTokens(data.session);

        await updateAuthUI();
        closeAuthModal();

        // Check if admin and redirect
        const { data: loginProf } = await sb.from("profiles").select("is_admin").eq("id", data.session.user.id).maybeSingle();
        if (loginProf?.is_admin) {
          const goAdmin = confirm("Admin account detected. Go to Admin Panel?");
          if (goAdmin) location.href = "admin.html";
        }
      }
    } catch (err) {
      setNotice("authNotice", err?.message || "Auth failed.", true);
    }
  });

  // Keep UI in sync across pages/tabs
  sb.auth.onAuthStateChange(async (event, session) => {
    if (session) saveSessionTokens(session);
    if (event === "SIGNED_OUT") clearSessionTokens();
    await updateAuthUI();
    await loadAllForCurrentPage();
  });
}

/********************** 5) Modals (Tasks/Exams/Plan/Perf/Notif) ************************/
function openOverlay(id) {
  const el = $(id);
  if (el) {
    el.style.display = "flex";
    el.setAttribute("aria-hidden", "false");
  }
}
function closeOverlay(id) {
  const el = $(id);
  if (el) {
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
  }
}

function bindCommonModals() {
  $("btnAddTask")?.addEventListener("click", async () => {
    const session = await getSessionSafe();
    if (!session) { openAuthModal("login"); setNotice("authNotice", "Please sign in to add tasks."); return; }
    editingTaskId = null;
    setNotice("taskNotice", "");
    $("taskForm")?.reset();
    const overlay = $("taskOverlay");
    if (overlay) overlay.querySelector(".head h3").textContent = "New Task";
    if ($("taskSave")) $("taskSave").textContent = "Save";
    openOverlay("taskOverlay");
  });
  $("taskClose")?.addEventListener("click", () => {
    editingTaskId = null;
    const overlay = $("taskOverlay");
    if (overlay) overlay.querySelector(".head h3").textContent = "New Task";
    if ($("taskSave")) $("taskSave").textContent = "Save";
    closeOverlay("taskOverlay");
  });
  $("taskCancel")?.addEventListener("click", () => {
    editingTaskId = null;
    const overlay = $("taskOverlay");
    if (overlay) overlay.querySelector(".head h3").textContent = "New Task";
    if ($("taskSave")) $("taskSave").textContent = "Save";
    closeOverlay("taskOverlay");
  });

  $("btnAddExam")?.addEventListener("click", async () => {
    const session = await getSessionSafe();
    if (!session) { openAuthModal("login"); setNotice("authNotice", "Please sign in to add exams."); return; }
    editingExamId = null;
    setNotice("examNotice", "");
    $("examForm")?.reset();
    const overlay = $("examOverlay");
    if (overlay) overlay.querySelector(".head h3").textContent = "New Exam";
    if ($("examSave")) $("examSave").textContent = "Save";
    openOverlay("examOverlay");
  });
  $("examClose")?.addEventListener("click", () => {
    editingExamId = null;
    const overlay = $("examOverlay");
    if (overlay) overlay.querySelector(".head h3").textContent = "New Exam";
    if ($("examSave")) $("examSave").textContent = "Save";
    closeOverlay("examOverlay");
  });
  $("examCancel")?.addEventListener("click", () => {
    editingExamId = null;
    const overlay = $("examOverlay");
    if (overlay) overlay.querySelector(".head h3").textContent = "New Exam";
    if ($("examSave")) $("examSave").textContent = "Save";
    closeOverlay("examOverlay");
  });

  $("btnAddPerf")?.addEventListener("click", async () => {
    const session = await updateAuthUI();
    if (!session) {
      openAuthModal("login");
      return;
    }
    editingPerfId = null;
    setNotice("perfNotice", "");
    $("perfForm")?.reset();
    const perfOv = $("perfOverlay");
    if (perfOv) perfOv.querySelector(".head h3").textContent = "Add Performance Record";
    if ($("perfSave")) $("perfSave").textContent = "Save";
    applyPerfScaleUI();
    openOverlay("perfOverlay");
  });
  $("perfClose")?.addEventListener("click", () => { editingPerfId = null; closeOverlay("perfOverlay"); });
  $("perfCancel")?.addEventListener("click", () => { editingPerfId = null; closeOverlay("perfOverlay"); });

  $("btnAddNotif")?.addEventListener("click", async () => {
    const session = await updateAuthUI();
    if (!session) {
      openAuthModal("login");
      return;
    }
    setNotice("notifNotice", "");
    $("notifForm")?.reset();
    openOverlay("notifOverlay");
  });
  $("notifClose")?.addEventListener("click", () => closeOverlay("notifOverlay"));
  $("notifCancel")?.addEventListener("click", () => closeOverlay("notifOverlay"));
}

/********************** 6) Data helpers: safe order ************************/
async function safeOrderQuery(queryBuilder, preferredColumn, fallbackColumn) {
  let res = await queryBuilder.order(preferredColumn, { ascending: false });
  if (!res.error) return res;

  const msg = String(res.error?.message || "");
  if (msg.includes(preferredColumn) && fallbackColumn) {
    res = await queryBuilder.order(fallbackColumn, { ascending: false });
  }
  return res;
}

/********************** 6) Data: Tasks ************************/
let tasksCache = [];

function renderTasks(list) {
  const wrap = $("tasksList");
  const empty = $("tasksEmpty");
  if (!wrap) return;

  wrap.innerHTML = "";
  if (!list || list.length === 0) {
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";

  list.forEach((t) => {
    const done = !!t.is_done;
    const priority = (t.priority || "normal").toLowerCase();
    const priorityColors = {
      high:   { bg: "rgba(220,38,38,.15)",  border: "rgba(220,38,38,.40)",  text: "#b91c1c",  label: "HIGH" },
      normal: { bg: "rgba(249,115,22,.12)", border: "rgba(249,115,22,.35)", text: "#c2410c",  label: "NORMAL" },
      low:    { bg: "rgba(22,163,74,.12)",  border: "rgba(22,163,74,.35)",  text: "#15803d",  label: "LOW" },
    };
    const pc = priorityColors[priority] || priorityColors.normal;

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="left">
        <div class="dot" style="${done ? "background: rgba(79,141,255,.55)" : ""}"></div>
        <div>
          <div class="title" style="${done ? "text-decoration: line-through; opacity:.85" : ""}">${escapeHtml(t.title || "")}</div>
          <div class="meta" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:3px;">
            <span style="display:inline-flex;align-items:center;gap:4px;">${t.due_date ? `<i data-lucide="calendar" style="width:11px;height:11px;"></i> ${fmtShort(t.due_date)}` : "No due date"}</span>
            <span style="padding:2px 8px;border-radius:8px;font-size:11px;font-weight:800;background:${pc.bg};border:1px solid ${pc.border};color:${pc.text};display:inline-flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:${pc.text};display:inline-block;"></span>${pc.label}</span>
            <span style="font-size:12px;">${Math.round(t.progress_percent ?? t.progress ?? 0)}%</span>
          </div>
        </div>
      </div>
      <div class="actions">
        <button class="small-btn primary" type="button" data-act="edit" data-id="${t.task_id}">Edit</button>
        <button class="small-btn primary" type="button" data-act="toggle" data-id="${t.task_id}">${done ? "Undone" : "Done"}</button>
        <button class="small-btn danger" type="button" data-act="del" data-id="${t.task_id}">Delete</button>
      </div>
    `;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");
      if (!id) return;
      if (act === "del") await deleteTask(id);
      if (act === "toggle") await toggleTask(id);
      if (act === "edit") openEditTaskModal(id);
    });
  });
}

async function loadTasks(userId) {
  const { data, error } = await sb.from("tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;

  tasksCache = data || [];
  renderTasks(tasksCache);
  updateDashboardStats();
  if (window.lucide) lucide.createIcons();
}

async function saveTask(e) {
  e.preventDefault();
  const session = await updateAuthUI();
  if (!session) {
    openAuthModal("login");
    return;
  }

  try {
    setNotice("taskNotice", "Saving...");
    const progress = Number($("taskProgress")?.value || 0);
    const payload = {
      user_id: session.user.id,
      title: $("taskTitle")?.value?.trim(),
      due_date: $("taskDue")?.value || null,
      priority: $("taskPriority")?.value || "normal",
      progress_percent: progress,
      is_done: progress >= 100 ? true : false,
      completed_at: progress >= 100 ? localDateStr() : null,
    };
    if (!payload.title) {
      setNotice("taskNotice", "Title is required.", true);
      return;
    }

    if (editingTaskId) {
      // Update existing task
      const { error } = await sb.from("tasks").update(payload).eq("task_id", editingTaskId).eq("user_id", session.user.id);
      if (error) throw error;
    } else {
      // Insert new task
      payload.is_done = false;
      const { error } = await sb.from("tasks").insert(payload);
      if (error) throw error;
    }

    editingTaskId = null;
    closeOverlay("taskOverlay");
    // Reset modal title
    const overlay = $("taskOverlay");
    if (overlay) overlay.querySelector(".head h3").textContent = "New Task";
    if ($("taskSave")) $("taskSave").textContent = "Save";
    await loadTasks(session.user.id);
  } catch (err) {
    setNotice("taskNotice", err?.message || "Failed to save task.", true);
  }
}

async function deleteTask(taskId) {
  const session = await updateAuthUI();
  if (!session) {
    openAuthModal("login");
    return;
  }
  await sb.from("tasks").delete().eq("task_id", taskId).eq("user_id", session.user.id);
  await loadTasks(session.user.id);
}

async function toggleTask(taskId) {
  const session = await updateAuthUI();
  if (!session) {
    openAuthModal("login");
    return;
  }
  const t = tasksCache.find((x) => x.task_id === taskId);
  if (!t) return;

  const newDone = !t.is_done;
  const newProgress = newDone ? 100 : (t.progress_percent || t.progress || 0);
  const completedAt = newDone ? localDateStr() : null;

  await sb
    .from("tasks")
    .update({ is_done: newDone, progress_percent: newProgress, completed_at: completedAt })
    .eq("task_id", taskId)
    .eq("user_id", session.user.id);

  await loadTasks(session.user.id);
  await calculatePerformance(session.user.id);
}

let editingTaskId = null;

function openEditTaskModal(taskId) {
  const t = tasksCache.find((x) => x.task_id === taskId);
  if (!t) return;

  editingTaskId = taskId;

  const overlay = $("taskOverlay");
  if (!overlay) return;

  overlay.querySelector(".head h3").textContent = "Edit Task";
  $("taskSave").textContent = "Update";

  if ($("taskTitle")) $("taskTitle").value = t.title || "";
  if ($("taskDue")) $("taskDue").value = (t.due_date || "").slice(0, 10);
  if ($("taskPriority")) $("taskPriority").value = t.priority || "normal";
  if ($("taskProgress")) $("taskProgress").value = t.progress_percent ?? t.progress ?? 0;

  setNotice("taskNotice", "");
  openOverlay("taskOverlay");
}

/********************** 7) Data: Exams ************************/
let examsCache = [];

function renderExams(list) {
  const wrap = $("examsList");
  const empty = $("examsEmpty");
  if (!wrap) return;

  wrap.innerHTML = "";
  if (!list || list.length === 0) {
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";

  list.forEach((ex) => {
    const done = !!ex.is_done;
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
  <div class="left">
    <div class="dot" style="${done ? "background: rgba(79,141,255,.55)" : ""}"></div>
    <div>
      <div class="title" style="${done ? "text-decoration: line-through; opacity:.85" : ""}">${escapeHtml(ex.subject || "")}</div>
      <div class="meta" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
        <i data-lucide="calendar" style="width:11px;height:11px;"></i> ${ex.exam_time ? new Date(ex.exam_time).toLocaleString(undefined,{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"}) : fmtShort(ex.exam_date)}
        ${ex.reminder_datetime ? ` <span style="opacity:.5;">·</span> <i data-lucide="bell" style="width:11px;height:11px;"></i> Reminder set` : ""}
        ${ex.score != null ? ` <span style="opacity:.5;">·</span> <i data-lucide="target" style="width:11px;height:11px;"></i> Score: <strong>${ex.score}%</strong>` : ""}
        ${done ? ` <span style="opacity:.5;">·</span> <i data-lucide="check-circle" style="width:11px;height:11px;color:#15803d;"></i> Completed` : ""}
      </div>
    </div>
  </div>
  <div class="actions">
    <button class="small-btn primary" type="button" data-act="edit" data-id="${ex.exam_id}">Edit</button>
    <button class="small-btn primary" type="button" data-act="toggle" data-id="${ex.exam_id}" style="${done ? "opacity:.7" : ""}">${done ? "Undone" : "Done"}</button>
    <button class="small-btn danger" type="button" data-act="del" data-id="${ex.exam_id}">Delete</button>
  </div>
`;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");
      if (!id) return;
      if (act === "del") await deleteExam(id);
      if (act === "edit") openEditExamModal(id);
      if (act === "toggle") await toggleExam(id);
    });
  });
}

async function loadExams(userId) {
  const { data, error } = await sb
    .from("exams")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  examsCache = data || [];
  renderExams(examsCache);
  updateDashboardStats();
  if (window.lucide) lucide.createIcons();
}

async function saveExam(e) {
  e.preventDefault();
  const session = await updateAuthUI();
  if (!session) {
    openAuthModal("login");
    return;
  }

  try {
    setNotice("examNotice", "Saving...");

    const rawScore = $("examScore")?.value;
    const score =
      rawScore !== undefined && rawScore !== null && rawScore !== ""
        ? Math.max(0, Math.min(100, Number(rawScore)))
        : null;

    const examDateVal = $("examDate")?.value || null;
    const payload = {
      user_id: session.user.id,
      subject: $("examSubject")?.value?.trim(),
      exam_date: examDateVal ? new Date(examDateVal).toISOString().slice(0,10) : null,
      reminder_datetime: $("examReminder")?.value
        ? new Date($("examReminder").value).toISOString()
        : null,
      score: Number.isFinite(score) ? score : null,
      exam_time: examDateVal || null,
    };

    if (!payload.subject || !payload.exam_date) {
      setNotice("examNotice", "Subject and exam date are required.", true);
      return;
    }

    if (editingExamId) {
      const { error } = await sb.from("exams").update(payload).eq("exam_id", editingExamId).eq("user_id", session.user.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from("exams").insert(payload);
      if (error) throw error;
    }

    editingExamId = null;
    closeOverlay("examOverlay");
    const overlay = $("examOverlay");
    if (overlay) overlay.querySelector(".head h3").textContent = "New Exam";
    if ($("examSave")) $("examSave").textContent = "Save";
    await loadExams(session.user.id);
  } catch (err) {
    setNotice("examNotice", err?.message || "Failed to save exam.", true);
  }
}

async function deleteExam(examId) {
  const session = await updateAuthUI();
  if (!session) {
    openAuthModal("login");
    return;
  }
  await sb.from("exams").delete().eq("exam_id", examId).eq("user_id", session.user.id);
  await loadExams(session.user.id);
}

async function toggleExam(examId) {
  const session = await updateAuthUI();
  if (!session) { openAuthModal("login"); return; }
  const ex = examsCache.find((x) => x.exam_id === examId);
  if (!ex) return;
  await sb.from("exams").update({ is_done: !ex.is_done }).eq("exam_id", examId).eq("user_id", session.user.id);
  await loadExams(session.user.id);
}

let editingExamId = null;

function openEditExamModal(examId) {
  const ex = examsCache.find((x) => x.exam_id === examId);
  if (!ex) return;

  editingExamId = examId;

  const overlay = $("examOverlay");
  if (!overlay) return;

  overlay.querySelector(".head h3").textContent = "Edit Exam";
  $("examSave").textContent = "Update";

  if ($("examSubject")) $("examSubject").value = ex.subject || "";
  // Set datetime-local: combine exam_date + time from exam_time if available
  if ($("examDate")) {
    if (ex.exam_time) {
      const dt = new Date(ex.exam_time);
      const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0,16);
      $("examDate").value = local;
    } else {
      $("examDate").value = (ex.exam_date || "").slice(0, 10);
    }
  }
  if ($("examReminder") && ex.reminder_datetime) {
    const dt = new Date(ex.reminder_datetime);
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    $("examReminder").value = local;
  }
  if ($("examScore")) $("examScore").value = ex.score != null ? ex.score : "";

  setNotice("examNotice", "");
  openOverlay("examOverlay");
}

/********************** 8) Data: Study plans (Multi-plan) ************************/
let plansCache = [];
let editingPlanId = null;

async function loadPlans(userId) {
  const { data, error } = await sb.from("study_plans").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  plansCache = data || [];
  renderPlans(plansCache);
  // Also update dashboard single-plan view (latest plan)
  const latest = plansCache[0] || null;
  if ($("planRange")) $("planRange").textContent = latest ? fmtDate(latest.start_date) + " → " + fmtDate(latest.end_date) : "—";
  if ($("planText")) $("planText").textContent = latest?.plan_details || "No plan yet.";
}

// Keep backward compat for pages that still call loadPlan
async function loadPlan(userId) { return loadPlans(userId); }
async function fetchLatestPlan(userId) {
  const { data } = await sb.from("study_plans").select("*").eq("user_id", userId).order("created_at",{ascending:false}).limit(1);
  return (data && data[0]) || null;
}

function renderPlans(list) {
  const wrap = $("plansList");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (!list || !list.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:32px;color:var(--muted);font-size:14px;"><i data-lucide="book-open" style="width:32px;height:32px;opacity:.4;display:block;margin:0 auto 10px;"></i>No study plans yet. Add one!</div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }
  list.forEach(plan => {
    const div = document.createElement("div");
    div.className = "item";
    div.style.cssText = "align-items:flex-start;flex-direction:column;gap:10px;";
    div.innerHTML = `
      <div style="display:flex;width:100%;align-items:center;justify-content:space-between;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
          <div class="dot" style="flex-shrink:0;"></div>
          <div style="min-width:0;">
            <div class="title" style="font-weight:800;">${fmtDate(plan.start_date)} → ${fmtDate(plan.end_date)}</div>
            <div class="meta">${plan.plan_details ? plan.plan_details.slice(0,80)+(plan.plan_details.length>80?"…":"") : "No details"}</div>
          </div>
        </div>
        <div class="actions" style="flex-shrink:0;">
          <button class="small-btn" onclick="openEditPlan('${plan.plan_id}')" style="display:inline-flex;align-items:center;gap:4px;"><i data-lucide="pencil" style="width:13px;height:13px;"></i> Edit</button>
          <button class="small-btn danger" onclick="deletePlan('${plan.plan_id}')" style="display:inline-flex;align-items:center;gap:4px;"><i data-lucide="trash-2" style="width:13px;height:13px;"></i></button>
        </div>
      </div>
      ${plan.plan_details ? `<div style="padding:10px 14px;background:rgba(79,141,255,.06);border-radius:12px;border:1px solid rgba(79,141,255,.12);font-size:13px;color:var(--text);line-height:1.6;width:100%;white-space:pre-wrap;">${plan.plan_details}</div>` : ""}
    `;
    wrap.appendChild(div);
  });
  if (window.lucide) lucide.createIcons();
}

function openAddPlan() {
  editingPlanId = null;
  if ($("planModalTitle")) $("planModalTitle").textContent = "New Study Plan";
  if ($("planStart")) $("planStart").value = "";
  if ($("planEnd")) $("planEnd").value = "";
  if ($("planDetails")) $("planDetails").value = "";
  setNotice("planNotice", "");
  openOverlay("planOverlay");
}

function openEditPlan(planId) {
  const plan = plansCache.find(p => p.plan_id === planId);
  if (!plan) return;
  editingPlanId = planId;
  if ($("planModalTitle")) $("planModalTitle").textContent = "Edit Study Plan";
  if ($("planStart")) $("planStart").value = plan.start_date || "";
  if ($("planEnd")) $("planEnd").value = plan.end_date || "";
  if ($("planDetails")) $("planDetails").value = plan.plan_details || "";
  setNotice("planNotice", "");
  openOverlay("planOverlay");
}

async function deletePlan(planId) {
  if (!confirm("Delete this study plan?")) return;
  const session = await updateAuthUI();
  if (!session) return;
  const { error } = await sb.from("study_plans").delete().eq("plan_id", planId).eq("user_id", session.user.id);
  if (error) { showPopupNotification("Failed to delete plan.", "error"); return; }
  showPopupNotification("Plan deleted.", "info");
  await loadPlans(session.user.id);
}

async function savePlan(e) {
  e.preventDefault();
  const session = await updateAuthUI();
  if (!session) { openAuthModal("login"); return; }
  try {
    setNotice("planNotice", "Saving...");
    const payload = {
      user_id: session.user.id,
      start_date: $("planStart")?.value || null,
      end_date: $("planEnd")?.value || null,
      plan_details: $("planDetails")?.value || "",
      generated_by: "manual",
    };
    if (!payload.start_date || !payload.end_date) {
      setNotice("planNotice", "Start and end dates are required.", true);
      return;
    }
    if (editingPlanId) {
      const { error } = await sb.from("study_plans").update({ start_date: payload.start_date, end_date: payload.end_date, plan_details: payload.plan_details }).eq("plan_id", editingPlanId).eq("user_id", session.user.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from("study_plans").insert(payload);
      if (error) throw error;
    }
    editingPlanId = null;
    closeOverlay("planOverlay");
    await loadPlans(session.user.id);
  } catch (err) {
    setNotice("planNotice", err?.message || "Failed to save plan.", true);
  }
}

/********************** 9) Data: Performance ************************/
let perfCache = [];

// Conversions
function clamp(num, min, max) {
  const n = Number(num);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
function gpa5ToPercent(gpa) {
  return (Number(gpa) / 5) * 100;
}
function percentToGpa5(pct) {
  return (Number(pct) / 100) * 5;
}

// Update modal UI based on selected scale
function applyPerfScaleUI() {
  const scaleEl = $("perfScale");
  const gradeEl = $("perfGradeValue");
  const hintEl = $("perfGradeHint");
  if (!scaleEl || !gradeEl || !hintEl) return;

  const scale = scaleEl.value || "100";
  if (scale === "5") {
    gradeEl.min = "0";
    gradeEl.max = "5";
    gradeEl.step = "0.01";
    gradeEl.placeholder = "4.25";
    hintEl.textContent = "Enter a value from 0 to 5";
  } else {
    gradeEl.min = "0";
    gradeEl.max = "100";
    gradeEl.step = "0.01";
    gradeEl.placeholder = "87";
    hintEl.textContent = "Enter a value from 0 to 100";
  }
}

function renderPerf(list) {
  const wrap = $("perfList");
  const empty = $("perfEmpty");
  if (!wrap) return;

  wrap.innerHTML = "";

  const manualRecords = (list || []).filter(
    (r) => r.average_grade != null && Number(r.average_grade) > 0
  );

  if (manualRecords.length === 0) {
    if (empty) empty.style.display = "block";
    return;
  }

  if (empty) empty.style.display = "none";

  manualRecords.forEach((r) => {
    const pct = Number(r.average_grade || 0);
    const gpa = r.gpa_5 != null ? Number(r.gpa_5) : percentToGpa5(pct);

    // Grade color
    let gradeColor = "#15803d"; // green
    if (pct < 60) gradeColor = "#b91c1c";
    else if (pct < 75) gradeColor = "#c2410c";
    else if (pct < 90) gradeColor = "#1d4ed8";

    // Cumulative display
    let cumulStr = "";
    if (r.cumulative_gpa != null && r.cumulative_percent != null) {
      cumulStr = ` · Cumulative: ${Number(r.cumulative_gpa).toFixed(2)}/5 · ${Number(r.cumulative_percent).toFixed(0)}%`;
    } else if (r.cumulative_gpa != null) {
      cumulStr = ` · Cumulative GPA: ${Number(r.cumulative_gpa).toFixed(2)}/5`;
    }

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="left">
        <div class="dot" style="background:${gradeColor};border-color:${gradeColor};"></div>
        <div>
          <div class="title" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-size:20px;font-weight:900;color:${gradeColor};">${pct.toFixed(0)}%</span>
            <span style="font-size:14px;color:var(--muted);font-weight:700;">${gpa.toFixed(2)} / 5 GPA</span>
          </div>
          <div class="meta" style="margin-top:3px;display:flex;align-items:center;gap:4px;">
            ${r.notes ? `<i data-lucide="file-text" style="width:11px;height:11px;flex-shrink:0;"></i> ${escapeHtml(r.notes)}` : ""}${cumulStr}
          </div>
          <div class="meta" style="font-size:11px;opacity:.65;margin-top:2px;display:flex;align-items:center;gap:4px;"><i data-lucide="clock" style="width:11px;height:11px;"></i> ${r.updated_at ? fmtShort(r.updated_at) : ""}</div>
        </div>
      </div>
      <div class="actions">
        <button class="small-btn primary" type="button" data-act="edit" data-id="${r.record_id}">Edit</button>
        <button class="small-btn danger" type="button" data-act="del" data-id="${r.record_id}">Delete</button>
      </div>
    `;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");
      if (!id) return;
      if (act === "del") await deletePerf(id);
      if (act === "edit") openEditPerfModal(id);
    });
  });
}

async function loadPerf(userId) {
  const base = sb.from("performance_records").select("*").eq("user_id", userId);
  const { data, error } = await safeOrderQuery(base, "updated_at", "record_id");
  if (error) throw error;

  perfCache = data || [];
  renderPerf(perfCache);
  if (window.lucide) lucide.createIcons();

  if ($("perfCount")) $("perfCount").textContent = String(perfCache.length);

  // Load motivational quote
  loadMotivationalQuote(userId);

  const latest = perfCache.find(
    (r) => r.average_grade != null && Number(r.average_grade) > 0
  );

  if (latest) {
    const latestPct = Number(latest.average_grade || 0);
    const latestGpa =
      latest.gpa_5 != null ? Number(latest.gpa_5) : percentToGpa5(latestPct);

    if ($("perfAvg")) $("perfAvg").textContent = latestPct.toFixed(0) + "%";
    if ($("perfGpa")) $("perfGpa").textContent = latestGpa.toFixed(2) + " / 5 GPA";

    if ($("perfCumulative")) {
      if (latest.cumulative_gpa != null && latest.cumulative_percent != null) {
        $("perfCumulative").textContent = `${Number(latest.cumulative_gpa).toFixed(2)} / 5 · ${Number(latest.cumulative_percent).toFixed(0)}%`;
      } else if (latest.cumulative_gpa != null) {
        $("perfCumulative").textContent = `${Number(latest.cumulative_gpa).toFixed(2)} / 5`;
      } else if (latest.cumulative_percent != null) {
        $("perfCumulative").textContent = `${Number(latest.cumulative_percent).toFixed(0)}%`;
      } else {
        $("perfCumulative").textContent = "—";
      }
    }
  } else {
    if ($("perfAvg")) $("perfAvg").textContent = "—";
    if ($("perfGpa")) $("perfGpa").textContent = "— / 5 GPA";
    if ($("perfCumulative")) $("perfCumulative").textContent = "—";
  }
}

async function savePerf(e) {
  e.preventDefault();
  const session = await updateAuthUI();
  if (!session) {
    openAuthModal("login");
    return;
  }

  try {
    setNotice("perfNotice", "Saving...");

    const scale = $("perfScale")?.value || "100";
    const rawGrade = Number($("perfGradeValue")?.value || 0);

    let percent = 0;
    let gpa5 = 0;

    if (scale === "5") {
      gpa5 = clamp(rawGrade, 0, 5);
      percent = clamp(gpa5ToPercent(gpa5), 0, 100);
    } else {
      percent = clamp(rawGrade, 0, 100);
      gpa5 = clamp(percentToGpa5(percent), 0, 5);
    }

    const cumulativeGpaRaw = $("perfCumulativeGpa")?.value;
    const cumulativePercentRaw = $("perfCumulativePercent")?.value;

    const cumulativeGpa =
      cumulativeGpaRaw !== undefined &&
      cumulativeGpaRaw !== null &&
      cumulativeGpaRaw !== ""
        ? clamp(Number(cumulativeGpaRaw), 0, 5)
        : null;

    const cumulativePercent =
      cumulativePercentRaw !== undefined &&
      cumulativePercentRaw !== null &&
      cumulativePercentRaw !== ""
        ? clamp(Number(cumulativePercentRaw), 0, 100)
        : null;

    const payload = {
      user_id: session.user.id,
      average_grade: percent,
      gpa_5: gpa5,
      completion_rate_percent: 0,
      cumulative_gpa: cumulativeGpa,
      cumulative_percent: cumulativePercent,
      notes: $("perfNotes")?.value || "",
      updated_at: localDateStr(),
      grade_scale: scale,
    };

    if (editingPerfId) {
      const { error } = await sb.from("performance_records").update(payload).eq("record_id", editingPerfId).eq("user_id", session.user.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from("performance_records").insert(payload);
      if (error) throw error;
    }

    editingPerfId = null;
    const perfOverlay = $("perfOverlay");
    if (perfOverlay) perfOverlay.querySelector(".head h3").textContent = "Add Performance Record";
    if ($("perfSave")) $("perfSave").textContent = "Save";
    closeOverlay("perfOverlay");
    await loadPerf(session.user.id);
  } catch (err) {
    setNotice("perfNotice", err?.message || "Failed to save record.", true);
  }
}

async function deletePerf(id) {
  const session = await updateAuthUI();
  if (!session) {
    openAuthModal("login");
    return;
  }
  await sb.from("performance_records").delete().eq("record_id", id).eq("user_id", session.user.id);
  await loadPerf(session.user.id);
}

let editingPerfId = null;

function openEditPerfModal(recordId) {
  const r = perfCache.find((x) => x.record_id === recordId);
  if (!r) return;

  editingPerfId = recordId;

  const overlay = $("perfOverlay");
  if (overlay) overlay.querySelector(".head h3").textContent = "Edit Performance Record";
  if ($("perfSave")) $("perfSave").textContent = "Update";

  // Set scale based on saved grade_scale
  const scale = r.grade_scale || "100";
  if ($("perfScale")) $("perfScale").value = scale;
  applyPerfScaleUI();

  if ($("perfGradeValue")) $("perfGradeValue").value = scale === "5" ? (r.gpa_5 || 0) : (r.average_grade || 0);
  if ($("perfCumulativeGpa")) $("perfCumulativeGpa").value = r.cumulative_gpa != null ? r.cumulative_gpa : "";
  if ($("perfCumulativePercent")) $("perfCumulativePercent").value = r.cumulative_percent != null ? r.cumulative_percent : "";
  if ($("perfNotes")) $("perfNotes").value = r.notes || "";

  setNotice("perfNotice", "");
  openOverlay("perfOverlay");
}

/********************** 10) Data: Notifications ************************/
let notifCache = [];

function renderNotifs(list) {
  const wrap = $("notifList");
  const empty = $("notifEmpty");
  if (!wrap) return;

  wrap.innerHTML = "";
  if (!list || list.length === 0) {
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";

  list.forEach((n) => {
    const div = document.createElement("div");
    div.className = "item";

    // Format created_at
    let timeStr = "";
    if (n.created_at) {
      const d = new Date(n.created_at);
      timeStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
        " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }

    // Format scheduled_at
    let scheduledStr = "";
    if (n.scheduled_at) {
      const sd = new Date(n.scheduled_at);
      scheduledStr = sd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
        " " + sd.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }

    // Type icon
    const typeIcons = { info: "info", warning: "alert-triangle", success: "check-circle", task: "check-square", exam: "calendar-check" };
    const icon = typeIcons[n.type] || "bell";

    const isRead = !!n.is_read;
    div.style.opacity = isRead ? "0.70" : "1";
    div.style.borderLeft = isRead ? "" : "3px solid rgba(79,141,255,.55)";

    div.innerHTML = `
      <div class="left">
        <div class="dot" style="${isRead ? "" : "background:rgba(79,141,255,.55)"}"></div>
        <div>
          <div class="title" style="display:flex;align-items:center;gap:6px;"><i data-lucide="${icon}" style="width:14px;height:14px;flex-shrink:0;"></i> ${escapeHtml(n.title || "Notification")}${isRead ? "" : ' <span style="font-size:10px;padding:2px 6px;border-radius:6px;background:rgba(79,141,255,.18);color:#4f8dff;font-weight:900;">NEW</span>'}</div>
          <div class="meta">${escapeHtml(n.message || "")}</div>
          ${scheduledStr ? `<div class="meta" style="margin-top:3px;font-size:11px;opacity:.80;display:flex;align-items:center;gap:4px;"><i data-lucide="calendar" style="width:11px;height:11px;"></i> Scheduled: ${scheduledStr}</div>` : ""}
          ${timeStr ? `<div class="meta" style="margin-top:2px;font-size:11px;opacity:.65;display:flex;align-items:center;gap:4px;"><i data-lucide="clock" style="width:11px;height:11px;"></i> Created: ${timeStr}</div>` : ""}
        </div>
      </div>
      <div class="actions">
        ${!isRead ? `<button class="small-btn primary" type="button" data-act="read" data-id="${n.notification_id}" title="Mark as read" style="display:inline-flex;align-items:center;gap:4px;"><i data-lucide="check" style="width:12px;height:12px;"></i> Read</button>` : ""}
        <button class="small-btn danger" type="button" data-act="del" data-id="${n.notification_id}">Delete</button>
      </div>
    `;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");
      if (!id) return;
      if (act === "del") await deleteNotif(id);
      if (act === "read") await markNotifRead(id);
    });
  });
  if (window.lucide) lucide.createIcons();
}

async function loadNotifs(userId) {
  const base = sb.from("notifications").select("*").eq("user_id", userId);
  const { data, error } = await safeOrderQuery(base, "created_at", "notification_id");
  if (error) throw error;

  notifCache = data || [];
  renderNotifs(notifCache);
  updateNotifBadge();
}

function updateNotifBadge() {
  const unread = notifCache.filter((n) => !n.is_read).length;
  // Update all notification bell buttons
  document.querySelectorAll("#btnOpenNotifications").forEach((btn) => {
    let badge = btn.querySelector(".notif-badge");
    if (unread > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "notif-badge";
        badge.style.cssText = "position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;font-size:10px;font-weight:900;border-radius:50%;width:16px;height:16px;display:grid;place-items:center;line-height:1;";
        btn.style.position = "relative";
        btn.appendChild(badge);
      }
      badge.textContent = unread > 9 ? "9+" : String(unread);
    } else {
      if (badge) badge.remove();
    }
  });
}

async function saveNotif(e) {
  e.preventDefault();
  const session = await updateAuthUI();
  if (!session) {
    openAuthModal("login");
    return;
  }

  try {
    setNotice("notifNotice", "Saving...");

    const scheduledVal = $("notifScheduled")?.value;
    const scheduledAt = scheduledVal ? new Date(scheduledVal).toISOString() : null;

    const payload = {
      user_id: session.user.id,
      title: $("notifTitle")?.value?.trim(),
      message: $("notifMsg")?.value || "",
      type: $("notifType")?.value || "info",
      is_read: false,
      created_at: new Date().toISOString(),
      scheduled_at: scheduledAt,
    };
    if (!payload.title) {
      setNotice("notifNotice", "Title is required.", true);
      return;
    }

    const { error } = await sb.from("notifications").insert(payload);
    if (error) throw error;

    closeOverlay("notifOverlay");
    await loadNotifs(session.user.id);
  } catch (err) {
    setNotice("notifNotice", err?.message || "Failed to save notification.", true);
  }
}

async function deleteNotif(id) {
  const session = await updateAuthUI();
  if (!session) {
    openAuthModal("login");
    return;
  }
  await sb.from("notifications").delete().eq("notification_id", id).eq("user_id", session.user.id);
  await loadNotifs(session.user.id);
}

async function markNotifRead(id) {
  const session = await updateAuthUI();
  if (!session) return;
  await sb.from("notifications").update({ is_read: true }).eq("notification_id", id).eq("user_id", session.user.id);
  // Update cache locally for instant UI update
  const n = notifCache.find((x) => x.notification_id === id);
  if (n) n.is_read = true;
  renderNotifs(notifCache);
  updateNotifBadge();
}

async function markAllNotifsRead() {
  const session = await updateAuthUI();
  if (!session) return;
  const unread = notifCache.filter((n) => !n.is_read);
  if (unread.length === 0) return;
  await sb.from("notifications").update({ is_read: true }).in("notification_id", unread.map((n) => n.notification_id));
  notifCache.forEach((n) => (n.is_read = true));
  renderNotifs(notifCache);
  updateNotifBadge();
}

async function calculatePerformance(userId) {
  const { data: tasks } = await sb.from("tasks").select("*").eq("user_id", userId);
  if (!tasks) return;

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.is_done).length;
  const taskCompletion = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Try to find latest manual record and update its completion_rate
  const { data: existing } = await sb
    .from("performance_records")
    .select("record_id, average_grade")
    .eq("user_id", userId)
    .not("average_grade", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) {
    // Update the latest record's completion rate
    await sb.from("performance_records")
      .update({ completion_rate_percent: taskCompletion, updated_at: localDateStr() })
      .eq("record_id", existing[0].record_id);
  }
  // Don't insert auto records — only update existing manual ones
}

async function drawPerformanceChart(userId) {
  const { data: perfData } = await sb
    .from("performance_records")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: true });

  const { data: exams } = await sb
    .from("exams")
    .select("*")
    .eq("user_id", userId)
    .order("exam_date", { ascending: true });

  const labels = [];
  const completionData = [];
  const examScoreData = [];
  const focusData = [];

  // Tasks done by day (using completed_at)
  const { data: allTasks } = await sb.from("tasks").select("*").eq("user_id", userId);
  const dailyMap = {};
  if (allTasks) {
    allTasks.forEach((t) => {
      if (!t.is_done) return;
      const day = localDateStr(t.completed_at || t.due_date || null);
      dailyMap[day] = (dailyMap[day] || 0) + 1;
    });
  }

  // Focus by day
  const { data: focusRecs } = await sb.from("performance_records")
    .select("*").eq("user_id", userId).eq("grade_scale","focus");
  const focusMap = {};
  if (focusRecs) {
    focusRecs.forEach((r) => {
      const day = r.focus_date || localDateStr(r.updated_at || null);
      const mins = r.focus_minutes || parseInt((r.notes || "0").replace(/[^0-9]/g,"")) || 0;
      focusMap[day] = (focusMap[day] || 0) + mins;
    });
  }

  // Build unified sorted day labels
  const allDays = [...new Set([...Object.keys(dailyMap), ...Object.keys(focusMap)])].sort();
  const dayLabels = allDays.map(d => new Date(d).toLocaleDateString(undefined,{month:"short",day:"numeric"}));
  const dayTasksData = allDays.map(d => dailyMap[d] || null);
  const dayFocusData = allDays.map(d => focusMap[d] || null);

  // Build exam labels + scores separately
  const examLabels = [];
  const examScores = [];
  if (exams && exams.length) {
    exams.forEach((ex) => {
      if (ex.score != null) {
        examLabels.push(ex.subject || "Exam");
        examScores.push(Number(ex.score));
      }
    });
  }

  const canvas = document.getElementById("performanceChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (window.performanceChartInstance) window.performanceChartInstance.destroy();

  // Merge all labels: days first, then exam names
  const filteredLabels = [...dayLabels, ...examLabels];
  const filteredCompletionData = [...dayTasksData, ...examLabels.map(() => null)];
  const filteredFocusData = [...dayFocusData, ...examLabels.map(() => null)];
  const filteredExamData = [...allDays.map(() => null), ...examScores];

  window.performanceChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: filteredLabels,
      datasets: [
        {
          type: "line",
          label: "Exam Score",
          data: filteredExamData,
          borderColor: "#223a5f",
          backgroundColor: "rgba(34,58,95,0.10)",
          pointBackgroundColor: "#223a5f",
          pointBorderColor: "#fff",
          pointRadius: 6,
          pointHoverRadius: 8,
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          spanGaps: true,
          yAxisID: "yScore",
          order: 1,
        },
        {
          type: "bar",
          label: "Tasks Done",
          data: filteredCompletionData,
          backgroundColor: "rgba(79,141,255,0.65)",
          borderColor: "rgba(79,141,255,1)",
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          yAxisID: "yCount",
          order: 2,
        },
        {
          type: "bar",
          label: "Focus (min)",
          data: filteredFocusData,
          backgroundColor: "rgba(122,168,255,0.60)",
          borderColor: "rgba(122,168,255,1)",
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          yAxisID: "yCount",
          order: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: { font: { weight: "700", size: 12 }, padding: 18, usePointStyle: true, pointStyleWidth: 12 }
        },
        tooltip: {
          backgroundColor: "rgba(15,25,45,0.92)",
          titleColor: "#fff",
          bodyColor: "rgba(255,255,255,.85)",
          borderColor: "rgba(79,141,255,.25)",
          borderWidth: 1,
          padding: 14,
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label.includes("Exam")) return `  Exam Score: ${ctx.parsed.y ?? "—"}%`;
              if (ctx.dataset.label.includes("Focus")) return `  Focus: ${ctx.parsed.y ?? "—"} min`;
              return `  Tasks Done: ${ctx.parsed.y ?? "—"}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#6b7a96", maxRotation: 30 } },
        yScore: {
          type: "linear",
          position: "left",
          min: 0,
          max: 100,
          grid: { color: "rgba(107,122,150,0.10)" },
          ticks: { font: { size: 11 }, color: "#223a5f", callback: (v) => v + "%" },
          title: { display: true, text: "Score %", color: "#223a5f", font: { size: 11, weight: "700" } },
        },
        yCount: {
          type: "linear",
          position: "right",
          min: 0,
          grid: { drawOnChartArea: false },
          ticks: { font: { size: 11 }, color: "#6b7a96", stepSize: 1 },
          title: { display: true, text: "Count / min", color: "#6b7a96", font: { size: 11, weight: "700" } },
        },
      },
    },
  });
}

async function drawDashboardPerformanceChart(userId) {
  const { data: perfData } = await sb
    .from("performance_records")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: true });

  const { data: exams } = await sb
    .from("exams")
    .select("*")
    .eq("user_id", userId)
    .order("exam_date", { ascending: true });

  const labels = [];
  const completionData = [];
  const examScoreData = [];

  // Daily tasks done (by completed_at)
  const { data: allTasksDash } = await sb.from("tasks").select("*").eq("user_id", userId);
  const dailyMapDash = {};
  if (allTasksDash) {
    allTasksDash.forEach((t) => {
      if (!t.is_done) return;
      const day = localDateStr(t.completed_at || t.due_date || null);
      dailyMapDash[day] = (dailyMapDash[day] || 0) + 1;
    });
  }

  // Focus sessions - use focus_minutes column if available
  const { data: focusRecsDash } = await sb.from("performance_records")
    .select("*").eq("user_id", userId).eq("grade_scale","focus");
  const focusMapDash = {};
  if (focusRecsDash) {
    focusRecsDash.forEach((r) => {
      const day = r.focus_date || localDateStr(r.updated_at || null);
      const mins = r.focus_minutes || parseInt((r.notes || "0").replace(/[^0-9]/g,"")) || 0;
      focusMapDash[day] = (focusMapDash[day] || 0) + mins;
    });
  }

  const focusDataDash = [];

  // Merge all days
  const allDaysDash = [...new Set([...Object.keys(dailyMapDash), ...Object.keys(focusMapDash)])].sort();
  allDaysDash.forEach((day) => {
    labels.push(new Date(day).toLocaleDateString(undefined,{month:"short",day:"numeric"}));
    completionData.push(dailyMapDash[day] || null);
    examScoreData.push(null);
    focusDataDash.push(focusMapDash[day] || null);
  });

  // Add exam scores
  if (exams && exams.length) {
    exams.forEach((ex) => {
      if (ex.score != null) {
        labels.push(ex.subject ? ex.subject : "Exam");
        completionData.push(null);
        examScoreData.push(Number(ex.score));
        focusDataDash.push(null);
      }
    });
  }

  const canvas = document.getElementById("dashboardPerformanceChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (window.dashboardPerformanceChartInstance) {
    window.dashboardPerformanceChartInstance.destroy();
  }

  window.dashboardPerformanceChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          // Line: Exam Scores
          type: "line",
          label: "Exam Score",
          data: examScoreData,
          borderColor: "#223a5f",
          backgroundColor: "rgba(34,58,95,0.10)",
          pointBackgroundColor: "#223a5f",
          pointBorderColor: "#fff",
          pointRadius: 6,
          pointHoverRadius: 8,
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          spanGaps: true,
          yAxisID: "yScore",
          order: 1,
        },
        {
          // Bar: Tasks Done
          type: "bar",
          label: "Tasks Done",
          data: completionData,
          backgroundColor: "rgba(79,141,255,0.65)",
          borderColor: "rgba(79,141,255,1)",
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          yAxisID: "yCount",
          order: 2,
        },
        {
          // Bar: Focus Minutes
          type: "bar",
          label: "Focus (min)",
          data: focusDataDash,
          backgroundColor: "rgba(122,168,255,0.60)",
          borderColor: "rgba(122,168,255,1)",
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          yAxisID: "yCount",
          order: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            font: { weight: "700", size: 12 },
            padding: 18,
            usePointStyle: true,
            pointStyleWidth: 12,
          }
        },
        tooltip: {
          backgroundColor: "rgba(15,25,45,0.92)",
          titleColor: "#fff",
          bodyColor: "rgba(255,255,255,.85)",
          borderColor: "rgba(79,141,255,.25)",
          borderWidth: 1,
          padding: 14,
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label.includes("Exam")) return `  Exam Score: ${ctx.parsed.y ?? "—"}%`;
              if (ctx.dataset.label.includes("Focus")) return `  Focus: ${ctx.parsed.y ?? "—"} min`;
              return `  Tasks Done: ${ctx.parsed.y ?? "—"}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: "#6b7a96", maxRotation: 30 },
        },
        yScore: {
          type: "linear",
          position: "left",
          min: 0,
          max: 100,
          grid: { color: "rgba(107,122,150,0.10)" },
          ticks: { font: { size: 11 }, color: "#4f8dff", callback: (v) => v + "%" },
          title: { display: true, text: "Score %", color: "#4f8dff", font: { size: 11, weight: "700" } },
        },
        yCount: {
          type: "linear",
          position: "right",
          min: 0,
          grid: { drawOnChartArea: false },
          ticks: { font: { size: 11 }, color: "#6b7a96", stepSize: 1 },
          title: { display: true, text: "Count / min", color: "#6b7a96", font: { size: 11, weight: "700" } },
        },
      },
    },
  });
}
/********************** 11) Dashboard Stats ************************/
function updateDashboardStats() {
  if (pageName() !== "Dashboard") return;

  const done = tasksCache.filter((t) => t.is_done).length;
  const total = tasksCache.length;
  const completion = total ? Math.round((done / total) * 100) : 0;

  if ($("statDone")) $("statDone").textContent = String(done);
  if ($("statCompletion")) $("statCompletion").textContent = completion + "%";
  if ($("statExams")) $("statExams").textContent = String(examsCache.filter(e => !e.is_done).length);

  const now = new Date();
  const week = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const due = tasksCache.filter((t) => {
    if (!t.due_date) return false;
    const d = new Date(t.due_date);
    return d >= now && d <= week && !t.is_done;
  }).length;

  if ($("tasksDueCount")) $("tasksDueCount").textContent = String(due);

  // Dashboard: incomplete (newest first, max 4) + last 3 completed (strikethrough) below
  const notDoneTasks = tasksCache.filter((t) => !t.is_done).slice(0, 4);
  const doneTasks = tasksCache.filter((t) => t.is_done).slice(0, 3);
  const dashTasks = [...notDoneTasks, ...doneTasks];

  // Exams: upcoming (not done, max 3) + last 2 completed below
  const notDoneExams = examsCache.filter((ex) => !ex.is_done).slice(0, 3);
  const doneExams = examsCache.filter((ex) => ex.is_done).slice(0, 2);
  const dashExams = [...notDoneExams, ...doneExams];

  renderTasks(dashTasks);
  renderExams(dashExams);
  if (window.lucide) lucide.createIcons();
}

/********************** 12) Misc ************************/
// ===================== Motivational Quote =====================
async function loadMotivationalQuote(userId) {
  const quoteEl = $("motivationalQuote");
  const editBtn = $("btnEditQuote");
  if (!quoteEl) return;

  const { data } = await sb.from("profiles").select("motivational_quote").eq("id", userId).maybeSingle();
  const quote = data?.motivational_quote || "Don't stop until you're proud.";
  quoteEl.textContent = quote;
}

async function saveMotivationalQuote() {
  const session = await getSessionSafe();
  if (!session) return;
  const input = $("quoteInput");
  const quoteEl = $("motivationalQuote");
  if (!input || !quoteEl) return;
  const newQuote = input.value.trim();
  if (!newQuote) return;

  await sb.from("profiles").update({ motivational_quote: newQuote }).eq("id", session.user.id);
  quoteEl.textContent = newQuote;
  $("quoteEditArea").style.display = "none";
  $("btnEditQuote").style.display = "inline-flex";
}

function bindQuoteEditor() {
  $("btnEditQuote")?.addEventListener("click", () => {
    const quoteEl = $("motivationalQuote");
    const input = $("quoteInput");
    if (input) input.value = quoteEl?.textContent || "";
    $("quoteEditArea").style.display = "flex";
    $("btnEditQuote").style.display = "none";
    input?.focus();
  });
  $("btnSaveQuote")?.addEventListener("click", saveMotivationalQuote);
  $("btnCancelQuote")?.addEventListener("click", () => {
    $("quoteEditArea").style.display = "none";
    $("btnEditQuote").style.display = "inline-flex";
  });
}

// ===================== Auth Guard =====================
function requireAuth(callback) {
  return async function(...args) {
    const session = await getSessionSafe();
    if (!session) {
      openAuthModal("login");
      setNotice("authNotice", "Please sign in to use this feature.", false);
      return;
    }
    return callback(...args);
  };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[s]));
}

async function loadAllForCurrentPage() {
  const session = await updateAuthUI();
  const userId = session?.user?.id;

  // Admin redirect check on every page load
  if (userId && pageName() !== "Admin") {
    const { data: adminCheck } = await sb.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
    if (adminCheck?.is_admin) {
      // Show admin button on dashboard
      const btnAdmin = $("btnAdminPanel");
      if (btnAdmin) btnAdmin.style.display = "";
    }
    if (adminCheck?.is_admin && !sessionStorage.getItem("adminPromptShown")) {
      sessionStorage.setItem("adminPromptShown", "1");
      const goAdmin = confirm("Admin account detected. Go to Admin Panel?");
      if (goAdmin) { location.href = "admin.html"; return; }
    }
  }

  if (!userId) {
    if ($("tasksList")) {
      $("tasksList").innerHTML = `<div style="text-align:center;padding:24px 0;">
        <i data-lucide="lock" style="width:32px;height:32px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;opacity:.55;"></i>
        <div style="font-weight:800;margin-bottom:6px;">Sign in to view your tasks</div>
        <button class="small-btn primary" onclick="openAuthModal('login')" style="margin-top:4px;">Login / Sign Up</button>
      </div>`;
    }
    if ($("examsList")) {
      $("examsList").innerHTML = `<div style="text-align:center;padding:24px 0;">
        <i data-lucide="lock" style="width:32px;height:32px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;opacity:.55;"></i>
        <div style="font-weight:800;margin-bottom:6px;">Sign in to view your exams</div>
        <button class="small-btn primary" onclick="openAuthModal('login')" style="margin-top:4px;">Login / Sign Up</button>
      </div>`;
    }
    if ($("notifList")) renderNotifs([]);
    if ($("perfList")) {
      $("perfList").innerHTML = `<div style="text-align:center;padding:24px 0;">
        <i data-lucide="lock" style="width:32px;height:32px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;opacity:.55;"></i>
        <div style="font-weight:800;margin-bottom:6px;">Sign in to view your performance</div>
        <button class="small-btn primary" onclick="openAuthModal('login')" style="margin-top:4px;">Login / Sign Up</button>
      </div>`;
    }
    if ($("planText")) $("planText").textContent = "Please login to see your plan.";
    if ($("planRange")) $("planRange").textContent = "—";
    if ($("plansList")) {
      $("plansList").innerHTML = `<div style="text-align:center;padding:24px 0;">
        <i data-lucide="lock" style="width:32px;height:32px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;opacity:.55;"></i>
        <div style="font-weight:800;margin-bottom:6px;">Sign in to view your study plans</div>
        <button class="small-btn primary" onclick="openAuthModal('login')" style="margin-top:4px;">Login / Sign Up</button>
      </div>`;
    }
    if (window.lucide) lucide.createIcons();

    if (pageName() === "Dashboard") {
      if ($("statDone")) $("statDone").textContent = "0";
      if ($("statExams")) $("statExams").textContent = "0";
      if ($("statCompletion")) $("statCompletion").textContent = "0%";
      if ($("tasksDueCount")) $("tasksDueCount").textContent = "0";
    }
    return;
  }

  // Always load notifs for badge on every page
  await loadNotifs(userId);

  if (pageName() === "Dashboard") {
    await loadTasks(userId);
    await loadExams(userId);
    await loadPlan(userId);
    await drawDashboardPerformanceChart(userId);
  } else if (pageName() === "Tasks") {
    await loadTasks(userId);
  } else if (pageName() === "Exams") {
    await loadExams(userId);
  } else if (pageName() === "Study Plan") {
    await loadPlans(userId);
  } else if (pageName() === "Performance") {
    await loadPerf(userId);
    await drawPerformanceChart(userId);
  }
}

/********************** 13) Focus Timer ************************/
let focusInterval = null;
let focusSeconds = parseInt(localStorage.getItem("planova.focus.seconds") || "0");
let focusRunning = false;
let focusSessionSaved = false;
const FOCUS_KEY = "planova.focus.seconds";
const FOCUS_RUNNING_KEY = "planova.focus.running";
const FOCUS_START_KEY = "planova.focus.startTime";

function formatFocusTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

function bindFocusTimer() {
  const btnStart = $("btnFocusStart");
  const btnReset = $("btnFocusReset");
  const display = $("focusDisplay");
  const status = $("focusStatus");
  if (!btnStart) return;

  // Restore state on page load
  if (display) display.textContent = formatFocusTime(focusSeconds);

  // If was running before navigation, resume
  const wasRunning = localStorage.getItem(FOCUS_RUNNING_KEY) === "1";
  const startTime = localStorage.getItem(FOCUS_START_KEY);
  if (wasRunning && startTime) {
    const elapsed = Math.floor((Date.now() - parseInt(startTime)) / 1000);
    focusSeconds += elapsed;
    localStorage.setItem(FOCUS_KEY, String(focusSeconds));
    localStorage.removeItem(FOCUS_START_KEY);
    if (display) display.textContent = formatFocusTime(focusSeconds);
  }

  if (wasRunning) {
    focusRunning = true;
    btnStart.textContent = "⏸ Pause";
    if (status) status.textContent = "Focusing...";
    focusInterval = setInterval(() => {
      focusSeconds++;
      localStorage.setItem(FOCUS_KEY, String(focusSeconds));
      if (display) display.textContent = formatFocusTime(focusSeconds);
    }, 1000);
  } else if (focusSeconds > 0) {
    btnStart.textContent = "▶ Resume";
    if (status) status.textContent = `Paused · ${formatFocusTime(focusSeconds)}`;
  }

  btnStart.addEventListener("click", () => {
    if (!focusRunning) {
      focusRunning = true;
      focusSessionSaved = false;
      btnStart.textContent = "⏸ Pause";
      if (status) status.textContent = "Focusing...";
      localStorage.setItem(FOCUS_RUNNING_KEY, "1");
      localStorage.setItem(FOCUS_START_KEY, String(Date.now()));
      focusInterval = setInterval(() => {
        focusSeconds++;
        localStorage.setItem(FOCUS_KEY, String(focusSeconds));
        if (display) display.textContent = formatFocusTime(focusSeconds);
      }, 1000);
    } else {
      focusRunning = false;
      clearInterval(focusInterval);
      localStorage.setItem(FOCUS_KEY, String(focusSeconds));
      localStorage.removeItem(FOCUS_RUNNING_KEY);
      localStorage.removeItem(FOCUS_START_KEY);
      btnStart.textContent = "▶ Resume";
      if (status) status.textContent = `Paused · ${formatFocusTime(focusSeconds)}`;
      if (focusSeconds >= 60 && !focusSessionSaved) saveFocusSession();
    }
  });

  btnReset.addEventListener("click", () => {
    focusRunning = false;
    clearInterval(focusInterval);
    localStorage.removeItem(FOCUS_RUNNING_KEY);
    localStorage.removeItem(FOCUS_START_KEY);
    if (focusSeconds >= 60 && !focusSessionSaved) saveFocusSession();
    focusSeconds = 0;
    focusSessionSaved = false;
    localStorage.setItem(FOCUS_KEY, "0");
    if (display) display.textContent = "00:00";
    btnStart.textContent = "▶ Start";
    if (status) status.textContent = "Press Start to focus";
  });

  // Save start time when leaving page
  window.addEventListener("beforeunload", () => {
    if (focusRunning) {
      localStorage.setItem(FOCUS_RUNNING_KEY, "1");
      localStorage.setItem(FOCUS_START_KEY, String(Date.now()));
    }
  });
}

async function saveFocusSession() {
  const session = await getSessionSafe();
  if (!session) return;
  focusSessionSaved = true;
  const minutes = Math.round(focusSeconds / 60);
  await sb.from("performance_records").insert({
    user_id: session.user.id,
    average_grade: 0,
    completion_rate_percent: 0,
    notes: `Focus session: ${minutes} min`,
    grade_scale: "focus",
    focus_minutes: minutes,
    focus_date: localDateStr(),
    updated_at: localDateStr(),
  });
}

/********************** 14) Wire events ************************/
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  updateDateTime();
  setInterval(updateDateTime, 30_000);

  $("btnOpenNotifications")?.addEventListener("click", () => (location.href = "notifications.html"));
  $("btnOpenMail")?.addEventListener("click", () => window.open("mailto:raghdq111@gmail.com?subject=Planova Support", "_blank"));
  $("btnMarkAllRead")?.addEventListener("click", markAllNotifsRead);

  // Restore session early
  await restoreSessionFromStorage();

  await loadAllForCurrentPage();

  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    checkUpcomingDeadlinesWithPush(user.id);
    checkScheduledNotifications(user.id);
    setInterval(() => checkScheduledNotifications(user.id), 5 * 60 * 1000);
  }
  bindAuthUI();
  bindCommonModals();
  bindProfileModal();
  bindFocusTimer();
  bindStudyPlanShare();
  bindPomodoroTimer();

  // Show "Enable Notifications" button if permission not yet granted/denied
  const pushBtn = document.getElementById("btnEnablePush");
  if (pushBtn && "Notification" in window && Notification.permission === "default") {
    pushBtn.style.display = "";
    pushBtn.classList.add("has-badge");
  }
  // Re-register service worker if permission already granted (covers returning visits)
  if ("Notification" in window && Notification.permission === "granted" && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(async (reg) => {
      // Best-effort: Periodic Background Sync (Chrome/Edge installed PWA only).
      // Lets the SW check for upcoming deadlines on a schedule even when the tab is closed.
      try {
        if ("periodicSync" in reg) {
          const status = await navigator.permissions.query({ name: "periodic-background-sync" });
          if (status.state === "granted") {
            await reg.periodicSync.register("planova-deadline-check", { minInterval: 60 * 60 * 1000 });
          }
        }
      } catch (e) { /* not supported in this browser, safe to ignore */ }
    }).catch(()=>{});
  }
  bindQuoteEditor();

  $("taskForm")?.addEventListener("submit", saveTask);
  $("examForm")?.addEventListener("submit", saveExam);
  $("planForm")?.addEventListener("submit", savePlan);
  $("btnAddPlan")?.addEventListener("click", openAddPlan);
  $("planCancel")?.addEventListener("click", () => closeOverlay("planOverlay"));
  $("planClose")?.addEventListener("click", () => closeOverlay("planOverlay"));
  $("perfForm")?.addEventListener("submit", savePerf);
  $("notifForm")?.addEventListener("submit", saveNotif);

  // Performance scale change (only exists on performance page)
  $("perfScale")?.addEventListener("change", applyPerfScaleUI);
  applyPerfScaleUI();

  $("tasksSearch")?.addEventListener("input", (e) => {
    const q = (e.target.value || "").toLowerCase();
    renderTasks(tasksCache.filter((t) => (t.title || "").toLowerCase().includes(q)));
  });

  $("examsSearch")?.addEventListener("input", (e) => {
    const q = (e.target.value || "").toLowerCase();
    renderExams(examsCache.filter((x) => (x.subject || "").toLowerCase().includes(q)));
  });

  await loadAllForCurrentPage();
});
function showPopupNotification(message, type = "info") {
  // Stack popups
  const existing = document.querySelectorAll(".planova-popup");
  const offset = existing.length * 80;

  const popup = document.createElement("div");
  popup.className = "planova-popup";

  const icons = { info: "bell", warning: "alert-triangle", success: "check-circle", task: "check-square", exam: "calendar-check" };
  const colors = {
    info:    { bg: "rgba(255,255,255,0.96)", border: "rgba(79,141,255,0.35)",  icon: "#4f8dff" },
    warning: { bg: "rgba(255,255,255,0.96)", border: "rgba(251,146,60,0.40)",  icon: "#c2410c" },
    success: { bg: "rgba(255,255,255,0.96)", border: "rgba(34,197,94,0.35)",   icon: "#15803d" },
    task:    { bg: "rgba(255,255,255,0.96)", border: "rgba(79,141,255,0.35)",  icon: "#4f8dff" },
    exam:    { bg: "rgba(255,255,255,0.96)", border: "rgba(251,146,60,0.40)",  icon: "#c2410c" },
  };
  const c = colors[type] || colors.info;
  const icon = icons[type] || "bell";

  popup.style.cssText = `
    position:fixed; top:${20 + offset}px; right:20px;
    background:${c.bg};
    color:#172033;
    border:1px solid ${c.border};
    border-left: 4px solid ${c.icon};
    padding:14px 16px;
    border-radius:16px;
    box-shadow:0 12px 36px rgba(15,35,80,0.14);
    z-index:99999;
    font-size:13px;
    font-weight:600;
    max-width:300px;
    line-height:1.5;
    opacity:0;
    transform:translateX(20px);
    transition:all 0.3s cubic-bezier(0.34,1.56,0.64,1);
    display:flex; align-items:flex-start; gap:10px;
    cursor:pointer;
  `;

  popup.innerHTML = `
    <i data-lucide="${icon}" style="width:20px;height:20px;flex-shrink:0;margin-top:1px;color:${c.icon};"></i>
    <span>${message}</span>
  `;

  popup.addEventListener("click", () => {
    popup.style.opacity = "0";
    popup.style.transform = "translateX(20px)";
    setTimeout(() => popup.remove(), 300);
  });

  document.body.appendChild(popup);
  if (window.lucide) lucide.createIcons();

  requestAnimationFrame(() => {
    popup.style.opacity = "1";
    popup.style.transform = "translateX(0)";
  });

  setTimeout(() => {
    popup.style.opacity = "0";
    popup.style.transform = "translateX(20px)";
    setTimeout(() => popup.remove(), 300);
  }, 5000);
}
// Check scheduled notifications
async function checkScheduledNotifications(userId) {
  const now = new Date();
  const { data: notifs } = await sb.from("notifications")
    .select("*")
    .eq("user_id", userId)
    .eq("is_read", false);

  if (!notifs) return;

  for (const n of notifs) {
    if (!n.scheduled_at) continue;
    const scheduledTime = new Date(n.scheduled_at);
    const diff = now - scheduledTime; // positive = past due
    // Show if scheduled time has passed within last 10 minutes
    if (diff >= 0 && diff <= 10 * 60 * 1000) {
      showPopupNotification(`${n.title}: ${n.message}`, n.type || "info");
      // Mark as read
      await sb.from("notifications").update({ is_read: true }).eq("notification_id", n.notification_id);
    }
  }
}

// Initialize Lucide icons after DOM loads
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();
});


/* ============================================================
   DARK MODE
   ============================================================ */
function applyTheme(mode) {
  document.documentElement.setAttribute("data-theme", mode);
  document.querySelectorAll("#btnDarkMode").forEach(btn => {
    const icon = btn.querySelector("i[data-lucide]");
    if (icon) icon.setAttribute("data-lucide", mode === "dark" ? "sun" : "moon");
  });
  if (window.lucide) lucide.createIcons();
}
function toggleDarkMode() {
  const current = localStorage.getItem("planova.theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  localStorage.setItem("planova.theme", next);
  applyTheme(next);
}
function initTheme() {
  applyTheme(localStorage.getItem("planova.theme") || "light");
}

/* ============================================================
   FEATURE 1: Browser Push Notifications
   ============================================================ */
async function requestPushPermission() {
  if (!("Notification" in window)) { showPopupNotification("Browser does not support notifications.", "error"); return; }
  if (Notification.permission === "granted") { showPopupNotification("Notifications already enabled!", "info"); return; }
  if (Notification.permission === "denied") { showPopupNotification("Notifications blocked. Allow in browser settings.", "error"); return; }
  const result = await Notification.requestPermission();
  const btn = document.getElementById("btnEnablePush");
  if (result === "granted") {
    showPopupNotification("Browser notifications enabled!", "success");
    if (btn) btn.style.display = "none";
    if ("serviceWorker" in navigator) {
      try { await navigator.serviceWorker.register("sw.js"); } catch(e) {}
    }
  } else {
    showPopupNotification("Notification permission denied.", "error");
  }
}
function sendBrowserNotification(title, body, icon = "assets/logo.png") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try { new Notification(title, { body, icon, tag: title }); } catch(e) {}
}
async function checkUpcomingDeadlinesWithPush(userId) {
  const now = new Date();

  // -------- Tasks --------
  const { data: tasks } = await sb.from("tasks").select("*").eq("user_id", userId);
  if (tasks) {
    for (const task of tasks) {
      if (!task.due_date || task.is_done) continue;
      const due = new Date(task.due_date);
      const hours = (due - now) / 3600000;

      const alerts = [];
      if (hours <= 48 && hours > 24) alerts.push("in 2 days");
      if (hours <= 24 && hours > 0)  alerts.push("tomorrow");

      for (const label of alerts) {
        const dueTime = due.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        const message = `Task "${task.title}" is due ${label} at ${dueTime}`;

        const { data: existing } = await sb.from("notifications").select("notification_id")
          .eq("user_id", userId).eq("message", message).eq("type", "task");

        if (!existing || existing.length === 0) {
          await sb.from("notifications").insert({
            user_id: userId, title: "Task Reminder", message,
            type: "task", is_read: false, created_at: new Date().toISOString(),
          });
          showPopupNotification(message, "task");
          sendBrowserNotification("Task Reminder", message);
        }
      }
    }
  }

  // -------- Exams --------
  const { data: exams } = await sb.from("exams").select("*").eq("user_id", userId);
  if (exams) {
    for (const exam of exams) {
      if (!exam.exam_date || exam.is_done) continue;
      const examDate = new Date(exam.exam_date);
      const hours = (examDate - now) / 3600000;

      const alerts = [];
      if (hours <= 48 && hours > 24) alerts.push("in 2 days");
      if (hours <= 24 && hours > 0)  alerts.push("tomorrow");

      for (const label of alerts) {
        const examTime = examDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        const message = `Exam "${exam.subject}" is ${label} at ${examTime}`;

        const { data: existing } = await sb.from("notifications").select("notification_id")
          .eq("user_id", userId).eq("message", message).eq("type", "exam");

        if (!existing || existing.length === 0) {
          await sb.from("notifications").insert({
            user_id: userId, title: "Exam Reminder", message,
            type: "exam", is_read: false, created_at: new Date().toISOString(),
          });
          showPopupNotification(message, "exam");
          sendBrowserNotification("Exam Reminder", message);
        }
      }
    }
  }
}

/* ============================================================
   FEATURE 2: Study Plan Sharing
   ============================================================ */
function bindStudyPlanShare() {
  const shareBtn = document.getElementById("btnSharePlan");
  if (!shareBtn) return;
  shareBtn.addEventListener("click", async () => {
    const planText = document.getElementById("planText")?.textContent || (plansCache && plansCache[0]?.plan_details) || "";
    const planRange = document.getElementById("planRange")?.textContent || "";
    if (!planText || planText === "No plan yet.") { showPopupNotification("No study plan to share yet!", "warning"); return; }
    const shareText = `My Study Plan (${planRange}):\n\n${planText}\n\n— Shared via Planova`;
    if (navigator.share) { try { await navigator.share({ title: "My Study Plan", text: shareText }); return; } catch(e) {} }
    try { await navigator.clipboard.writeText(shareText); showPopupNotification("Study plan copied to clipboard!", "success"); }
    catch(e) { showShareModal(shareText); }
  });
}
function showShareModal(text) {
  let m = document.getElementById("shareModal"); if (m) m.remove();
  m = document.createElement("div"); m.id = "shareModal";
  m.style.cssText = "position:fixed;inset:0;background:rgba(5,10,20,.55);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:99999;padding:18px;";
  m.innerHTML = `<div style="background:var(--nav,#223a5f);color:#fff;border-radius:24px;border:1px solid rgba(255,255,255,.12);box-shadow:0 30px 80px rgba(0,0,0,.4);padding:24px;width:min(480px,100%);">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <h3 style="margin:0;font-size:18px;display:flex;align-items:center;gap:8px;"><i data-lucide="share-2" style="width:18px;height:18px;"></i> Share Study Plan</h3>
      <button onclick="document.getElementById('shareModal').remove()" style="width:34px;height:34px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.10);color:#fff;cursor:pointer;display:grid;place-items:center;"><i data-lucide="x" style="width:15px;height:15px;"></i></button>
    </div>
    <textarea id="sharePlanText" readonly style="width:100%;height:130px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:14px;color:#fff;padding:12px;font-size:13px;resize:none;outline:none;"></textarea>
    <div style="display:flex;gap:10px;margin-top:14px;">
      <button id="shareCopyBtn" style="flex:1;padding:11px;border-radius:14px;border:1px solid rgba(79,141,255,.4);background:rgba(79,141,255,.2);color:#fff;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;"><i data-lucide="clipboard" style="width:14px;height:14px;"></i> Copy</button>
      <button id="shareWaBtn" style="flex:1;padding:11px;border-radius:14px;border:1px solid rgba(37,211,102,.4);background:rgba(37,211,102,.15);color:#fff;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;"><i data-lucide="message-circle" style="width:14px;height:14px;"></i> WhatsApp</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  document.getElementById("sharePlanText").value = text;
  document.getElementById("shareCopyBtn").onclick = async () => { await navigator.clipboard.writeText(text).catch(()=>{}); showPopupNotification("Copied!", "success"); m.remove(); };
  document.getElementById("shareWaBtn").onclick = () => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank");
  m.addEventListener("click", e => { if(e.target===m) m.remove(); });
  if (window.lucide) lucide.createIcons();
}

/* ============================================================
   FEATURE 3: Pomodoro Timer (Custom durations)
   ============================================================ */
let pomodoroInterval = null, pomodoroSeconds = 0, pomodoroRunning = false;
let pomodoroMode = "work", pomodoroRound = 1;
let POMODORO_WORK = 25 * 60, POMODORO_BREAK = 5 * 60;

function loadPomodoroDurations() {
  POMODORO_WORK  = parseInt(localStorage.getItem("planova.pomo.work")  || "25") * 60;
  POMODORO_BREAK = parseInt(localStorage.getItem("planova.pomo.break") || "5")  * 60;
}
function fmtPomo(s) { return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`; }
function updatePomodoroUI() {
  const d=document.getElementById("pomodoroDisplay"), l=document.getElementById("pomodoroLabel");
  const p=document.getElementById("pomodoroProgress"), r=document.getElementById("pomodoroRound");
  if (!d) return;
  d.textContent = fmtPomo(pomodoroSeconds);
  if (l) l.innerHTML = pomodoroMode==="work"
    ? '<i data-lucide="target" style="width:12px;height:12px;vertical-align:middle;margin-right:3px;"></i>Focus Time'
    : '<i data-lucide="coffee" style="width:12px;height:12px;vertical-align:middle;margin-right:3px;"></i>Break Time';
  if (r) r.textContent = `Round ${pomodoroRound}`;
  const total = pomodoroMode==="work" ? POMODORO_WORK : POMODORO_BREAK;
  const pct = Math.round(((total-pomodoroSeconds)/total)*100);
  if (p) { p.style.width=pct+"%"; p.style.background=pomodoroMode==="work"?"linear-gradient(90deg,#4f8dff,#7aa8ff)":"linear-gradient(90deg,#22c55e,#4ade80)"; }
  if (window.lucide) lucide.createIcons();
}
function openPomodoroSettings() {
  const w=Math.round(POMODORO_WORK/60), b=Math.round(POMODORO_BREAK/60);
  let m=document.getElementById("pomodoroSettingsModal"); if(m) m.remove();
  m=document.createElement("div"); m.id="pomodoroSettingsModal";
  m.style.cssText="position:fixed;inset:0;background:rgba(5,10,20,.55);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:99999;padding:18px;";
  m.innerHTML=`<div style="background:var(--nav,#223a5f);color:#fff;border-radius:24px;border:1px solid rgba(255,255,255,.15);box-shadow:0 30px 80px rgba(0,0,0,.4);padding:24px;width:min(340px,100%);">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
      <h3 style="margin:0;font-size:17px;display:flex;align-items:center;gap:8px;"><i data-lucide="settings-2" style="width:17px;height:17px;"></i> Timer Settings</h3>
      <button onclick="document.getElementById('pomodoroSettingsModal').remove()" style="width:34px;height:34px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.10);color:#fff;cursor:pointer;display:grid;place-items:center;"><i data-lucide="x" style="width:15px;height:15px;"></i></button>
    </div>
    <div style="display:flex;flex-direction:column;gap:18px;">
      <div>
        <div style="font-size:12px;font-weight:800;opacity:.75;margin-bottom:8px;">Focus Duration (minutes)</div>
        <div style="display:flex;align-items:center;gap:12px;">
          <input type="range" id="workSlider" min="5" max="90" step="5" value="${w}" style="flex:1;accent-color:#4f8dff;" oninput="document.getElementById('workVal').textContent=this.value">
          <span id="workVal" style="font-size:22px;font-weight:900;min-width:36px;text-align:center;">${w}</span>
        </div>
      </div>
      <div>
        <div style="font-size:12px;font-weight:800;opacity:.75;margin-bottom:8px;">Break Duration (minutes)</div>
        <div style="display:flex;align-items:center;gap:12px;">
          <input type="range" id="breakSlider" min="1" max="30" step="1" value="${b}" style="flex:1;accent-color:#22c55e;" oninput="document.getElementById('breakVal').textContent=this.value">
          <span id="breakVal" style="font-size:22px;font-weight:900;min-width:36px;text-align:center;">${b}</span>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:20px;">
      <button onclick="document.getElementById('pomodoroSettingsModal').remove()" style="flex:1;padding:11px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.10);color:#fff;font-weight:800;cursor:pointer;">Cancel</button>
      <button id="pomodoroSaveSettings" style="flex:1;padding:11px;border-radius:14px;border:none;background:linear-gradient(135deg,#4f8dff,#7aa8ff);color:#fff;font-weight:900;cursor:pointer;">Save & Reset</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  if(window.lucide) lucide.createIcons();
  document.getElementById("pomodoroSaveSettings").onclick=()=>{
    const nw=parseInt(document.getElementById("workSlider").value);
    const nb=parseInt(document.getElementById("breakSlider").value);
    localStorage.setItem("planova.pomo.work",nw);
    localStorage.setItem("planova.pomo.break",nb);
    POMODORO_WORK=nw*60; POMODORO_BREAK=nb*60;
    pomodoroRunning=false; clearInterval(pomodoroInterval);
    pomodoroMode="work"; pomodoroRound=1; pomodoroSeconds=POMODORO_WORK;
    const sb2=document.getElementById("btnPomodoroStart");
    if(sb2) { sb2.innerHTML='<i data-lucide="play" style="width:13px;height:13px;"></i> Start'; }
    updatePomodoroUI(); m.remove();
    showPopupNotification(`Timer: ${nw} min focus · ${nb} min break`, "success");
  };
  m.addEventListener("click",e=>{if(e.target===m)m.remove();});
}
function bindPomodoroTimer() {
  const startBtn=document.getElementById("btnPomodoroStart");
  const resetBtn=document.getElementById("btnPomodoroReset");
  const skipBtn=document.getElementById("btnPomodoroSkip");
  const settBtn=document.getElementById("btnPomodoroSettings");
  if (!startBtn) return;
  loadPomodoroDurations();
  pomodoroSeconds=POMODORO_WORK;
  updatePomodoroUI();
  startBtn.addEventListener("click",()=>{
    if (!pomodoroRunning) {
      pomodoroRunning=true;
      startBtn.innerHTML='<i data-lucide="pause" style="width:13px;height:13px;"></i> Pause';
      if(window.lucide) lucide.createIcons();
      pomodoroInterval=setInterval(()=>{
        pomodoroSeconds--;
        updatePomodoroUI();
        if (pomodoroSeconds<=0) {
          clearInterval(pomodoroInterval); pomodoroRunning=false;
          startBtn.innerHTML='<i data-lucide="play" style="width:13px;height:13px;"></i> Start';
          if(window.lucide) lucide.createIcons();
          if (pomodoroMode==="work") {
            sendBrowserNotification("Pomodoro Done!",`Take a ${Math.round(POMODORO_BREAK/60)}-minute break.`);
            showPopupNotification("Focus session done! Take a break.","success");
            pomodoroMode="break"; pomodoroSeconds=POMODORO_BREAK;
          } else {
            sendBrowserNotification("Break Over!","Ready for another focus session?");
            showPopupNotification("Break over! Ready to focus again?","info");
            pomodoroMode="work"; pomodoroRound++; pomodoroSeconds=POMODORO_WORK;
          }
          updatePomodoroUI();
        }
      },1000);
    } else {
      pomodoroRunning=false; clearInterval(pomodoroInterval);
      startBtn.innerHTML='<i data-lucide="play" style="width:13px;height:13px;"></i> Resume';
      if(window.lucide) lucide.createIcons();
    }
  });
  resetBtn?.addEventListener("click",()=>{
    pomodoroRunning=false; clearInterval(pomodoroInterval);
    pomodoroMode="work"; pomodoroRound=1; pomodoroSeconds=POMODORO_WORK;
    startBtn.innerHTML='<i data-lucide="play" style="width:13px;height:13px;"></i> Start';
    if(window.lucide) lucide.createIcons();
    updatePomodoroUI();
  });
  skipBtn?.addEventListener("click",()=>{
    pomodoroRunning=false; clearInterval(pomodoroInterval);
    startBtn.innerHTML='<i data-lucide="play" style="width:13px;height:13px;"></i> Start';
    if(window.lucide) lucide.createIcons();
    pomodoroMode = pomodoroMode==="work" ? "break" : "work";
    if (pomodoroMode==="work") pomodoroRound++;
    pomodoroSeconds = pomodoroMode==="work" ? POMODORO_WORK : POMODORO_BREAK;
    updatePomodoroUI();
  });
  settBtn?.addEventListener("click",()=>openPomodoroSettings());
}
