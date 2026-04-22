"use strict";

/********************** 0) Supabase Config ************************/
// ✅ Using YOUR values (public publishable key)
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
      setNotice("authNotice", "✅ Reset link sent! Check your email inbox.");
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
            alert("✅ Account created! Please check your email inbox and click the confirmation link to activate your account.");
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

  $("btnEditPlan")?.addEventListener("click", async () => {
    setNotice("planNotice", "");
    const session = await updateAuthUI();
    if (!session) {
      openAuthModal("login");
      return;
    }
    const plan = await fetchLatestPlan(session.user.id);
    if (plan) {
      if ($("planStart")) $("planStart").value = (plan.start_date || "").slice(0, 10);
      if ($("planEnd")) $("planEnd").value = (plan.end_date || "").slice(0, 10);
      if ($("planDetails")) $("planDetails").value = plan.plan_details || "";
    } else {
      $("planForm")?.reset();
    }
    openOverlay("planOverlay");
  });
  $("planClose")?.addEventListener("click", () => closeOverlay("planOverlay"));
  $("planCancel")?.addEventListener("click", () => closeOverlay("planOverlay"));

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
      high:   { bg: "rgba(220,38,38,.15)",  border: "rgba(220,38,38,.40)",  text: "#b91c1c",  label: "🔴 HIGH" },
      normal: { bg: "rgba(249,115,22,.12)", border: "rgba(249,115,22,.35)", text: "#c2410c",  label: "🟠 NORMAL" },
      low:    { bg: "rgba(22,163,74,.12)",  border: "rgba(22,163,74,.35)",  text: "#15803d",  label: "🟢 LOW" },
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
            <span>${t.due_date ? "📅 " + fmtShort(t.due_date) : "No due date"}</span>
            <span style="padding:2px 8px;border-radius:8px;font-size:11px;font-weight:800;background:${pc.bg};border:1px solid ${pc.border};color:${pc.text};">${pc.label}</span>
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

  await sb
    .from("tasks")
    .update({ is_done: newDone, progress_percent: newProgress })
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
      <div class="meta">
        📅 ${ex.exam_time ? new Date(ex.exam_time).toLocaleString(undefined,{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"}) : fmtShort(ex.exam_date)}
        ${ex.reminder_datetime ? " · 🔔 Reminder set" : ""}
        ${ex.score != null ? ` · 🎯 Score: <strong>${ex.score}%</strong>` : ""}
        ${done ? " · ✅ Completed" : ""}
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

/********************** 8) Data: Study plans ************************/
async function fetchLatestPlan(userId) {
  const base = sb.from("study_plans").select("*").eq("user_id", userId).limit(1);
  const { data, error } = await safeOrderQuery(base, "created_at", "plan_id");
  if (error) throw error;
  return (data && data[0]) || null;
}

async function loadPlan(userId) {
  const plan = await fetchLatestPlan(userId);
  if ($("planRange")) {
    $("planRange").textContent = plan
      ? fmtDate(plan.start_date) + " → " + fmtDate(plan.end_date)
      : "—";
  }
  if ($("planText")) {
    $("planText").textContent = plan?.plan_details || "No plan yet.";
  }
}

async function savePlan(e) {
  e.preventDefault();
  const session = await updateAuthUI();
  if (!session) {
    openAuthModal("login");
    return;
  }

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

    const { error } = await sb.from("study_plans").insert(payload);
    if (error) throw error;

    closeOverlay("planOverlay");
    await loadPlan(session.user.id);
  } catch (err) {
    setNotice("planNotice", err?.message || "Failed to save plan.", true);
  }
}

/********************** 9) Data: Performance ************************/
let perfCache = [];

// ✅ Conversions
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

// ✅ Update modal UI based on selected scale
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
          <div class="meta" style="margin-top:3px;">
            ${r.notes ? "📝 " + escapeHtml(r.notes) : ""}${cumulStr}
          </div>
          <div class="meta" style="font-size:11px;opacity:.65;margin-top:2px;">🕐 ${r.updated_at ? fmtShort(r.updated_at) : ""}</div>
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

  if ($("perfCount")) $("perfCount").textContent = String(perfCache.length);

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
      updated_at: new Date().toISOString(),
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
    const typeIcons = { info: "ℹ️", warning: "⚠️", success: "✅", task: "✅", exam: "🗓️" };
    const icon = typeIcons[n.type] || "🔔";

    const isRead = !!n.is_read;
    div.style.opacity = isRead ? "0.70" : "1";
    div.style.borderLeft = isRead ? "" : "3px solid rgba(79,141,255,.55)";

    div.innerHTML = `
      <div class="left">
        <div class="dot" style="${isRead ? "" : "background:rgba(79,141,255,.55)"}"></div>
        <div>
          <div class="title">${icon} ${escapeHtml(n.title || "Notification")}${isRead ? "" : ' <span style="font-size:10px;padding:2px 6px;border-radius:6px;background:rgba(79,141,255,.18);color:#4f8dff;font-weight:900;">NEW</span>'}</div>
          <div class="meta">${escapeHtml(n.message || "")}</div>
          ${scheduledStr ? `<div class="meta" style="margin-top:3px;font-size:11px;opacity:.80;">📅 Scheduled: ${scheduledStr}</div>` : ""}
          ${timeStr ? `<div class="meta" style="margin-top:2px;font-size:11px;opacity:.65;">🕐 Created: ${timeStr}</div>` : ""}
        </div>
      </div>
      <div class="actions">
        ${!isRead ? `<button class="small-btn primary" type="button" data-act="read" data-id="${n.notification_id}" title="Mark as read">✓ Read</button>` : ""}
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
      .update({ completion_rate_percent: taskCompletion, updated_at: new Date().toISOString() })
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

  // 3 datasets: Exam scores, Daily tasks done, Focus minutes
  const { data: allTasks } = await sb.from("tasks").select("*").eq("user_id", userId);
  const dailyMap = {};
  if (allTasks) {
    allTasks.forEach((t) => {
      if (!t.is_done) return;
      const day = (t.due_date || new Date().toISOString()).slice(0,10);
      dailyMap[day] = (dailyMap[day] || 0) + 1;
    });
  }

  // Focus sessions from performance_records
  const { data: focusRecs } = await sb.from("performance_records")
    .select("*").eq("user_id", userId).eq("grade_scale","focus");
  const focusMap = {};
  if (focusRecs) {
    focusRecs.forEach((r) => {
      const day = (r.updated_at || "").slice(0,10);
      const mins = parseInt((r.notes || "0").replace(/[^0-9]/g,"")) || 0;
      focusMap[day] = (focusMap[day] || 0) + mins;
    });
  }

  // Merge all days
  const allDays = [...new Set([...Object.keys(dailyMap), ...Object.keys(focusMap)])].sort();
  allDays.forEach((day) => {
    labels.push(new Date(day).toLocaleDateString(undefined,{month:"short",day:"numeric"}));
    completionData.push(dailyMap[day] || null);
    examScoreData.push(null);
    focusData.push(focusMap[day] || null);
  });

  // Add exam scores
  if (exams && exams.length) {
    exams.forEach((ex) => {
      if (ex.score != null) {
        labels.push(ex.subject ? ex.subject : "Exam");
        completionData.push(null);
        examScoreData.push(Number(ex.score));
        focusData.push(null);
      }
    });
  }

  const canvas = document.getElementById("performanceChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (window.performanceChartInstance) {
    window.performanceChartInstance.destroy();
  }

  // Only show exams with scores + manual perf records (skip auto records)
  const filteredLabels = [];
  const filteredExamData = [];
  const filteredCompletionData = [];

  labels.forEach((lbl, i) => {
    const hasExam = examScoreData[i] != null;
    const hasCompletion = completionData[i] != null;
    if (hasExam || hasCompletion) {
      filteredLabels.push(lbl);
      filteredExamData.push(examScoreData[i]);
      filteredCompletionData.push(completionData[i]);
    }
  });

  window.performanceChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: filteredLabels,
      datasets: [
        {
          label: "Exam Scores",
          data: filteredExamData,
          borderColor: "#4f8dff",
          backgroundColor: "rgba(79,141,255,0.08)",
          pointBackgroundColor: "#4f8dff",
          pointBorderColor: "#fff",
          pointRadius: 5,
          pointHoverRadius: 7,
          borderWidth: 2.5,
          tension: 0.35,
          fill: false,
          spanGaps: true,
        },
        {
          label: "Tasks Done / Day",
          data: filteredCompletionData,
          borderColor: "#94a3b8",
          backgroundColor: "rgba(148,163,184,0.08)",
          pointBackgroundColor: "#94a3b8",
          pointBorderColor: "#fff",
          pointRadius: 5,
          pointHoverRadius: 7,
          borderWidth: 2.5,
          tension: 0.35,
          fill: false,
          spanGaps: true,
        },
        {
          label: "Focus (min)",
          data: (filteredLabels || labels).map((_,i) => focusData ? focusData[i] : null),
          borderColor: "#a855f7",
          backgroundColor: "rgba(168,85,247,0.08)",
          pointBackgroundColor: "#a855f7",
          pointBorderColor: "#fff",
          pointRadius: 5,
          pointHoverRadius: 7,
          borderWidth: 2.5,
          tension: 0.35,
          fill: false,
          spanGaps: true,
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
          labels: { font: { weight: "700", size: 12 }, padding: 18, usePointStyle: true, pointStyleWidth: 10 }
        },
        tooltip: {
          backgroundColor: "rgba(15,25,45,0.90)",
          titleColor: "#fff",
          bodyColor: "rgba(255,255,255,.80)",
          borderColor: "rgba(255,255,255,.10)",
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label === "Exam Scores") return `  Exam Score: ${ctx.parsed.y ?? "—"}%`;
              if (ctx.dataset.label === "Focus (min)") return `  Focus: ${ctx.parsed.y ?? "—"} min`;
              return `  Tasks Done: ${ctx.parsed.y ?? "—"}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#6b7a96" } },
        y: { min: 0, grid: { color: "rgba(107,122,150,0.10)" }, ticks: { font: { size: 11 }, color: "#6b7a96" } },
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

  // Daily tasks done
  const { data: allTasksDash } = await sb.from("tasks").select("*").eq("user_id", userId);
  const dailyMapDash = {};
  if (allTasksDash) {
    allTasksDash.forEach((t) => {
      if (!t.is_done) return;
      const day = (t.due_date || new Date().toISOString()).slice(0,10);
      dailyMapDash[day] = (dailyMapDash[day] || 0) + 1;
    });
  }

  // Focus sessions
  const { data: focusRecsDash } = await sb.from("performance_records")
    .select("*").eq("user_id", userId).eq("grade_scale","focus");
  const focusMapDash = {};
  if (focusRecsDash) {
    focusRecsDash.forEach((r) => {
      const day = (r.updated_at || "").slice(0,10);
      const mins = parseInt((r.notes || "0").replace(/[^0-9]/g,"")) || 0;
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
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Exam Scores",
          data: examScoreData,
          borderColor: "#4f8dff",
          backgroundColor: "rgba(79,141,255,0.08)",
          pointBackgroundColor: "#4f8dff",
          pointBorderColor: "#fff",
          pointRadius: 5,
          pointHoverRadius: 7,
          borderWidth: 2.5,
          tension: 0.35,
          fill: false,
          spanGaps: true,
        },
        {
          label: "Tasks Done / Day",
          data: completionData,
          borderColor: "#94a3b8",
          backgroundColor: "rgba(148,163,184,0.08)",
          pointBackgroundColor: "#94a3b8",
          pointBorderColor: "#fff",
          pointRadius: 5,
          pointHoverRadius: 7,
          borderWidth: 2.5,
          tension: 0.35,
          fill: false,
          spanGaps: true,
        },
        {
          label: "Focus (min)",
          data: focusDataDash,
          borderColor: "#a855f7",
          backgroundColor: "rgba(168,85,247,0.08)",
          pointBackgroundColor: "#a855f7",
          pointBorderColor: "#fff",
          pointRadius: 5,
          pointHoverRadius: 7,
          borderWidth: 2.5,
          tension: 0.35,
          fill: false,
          spanGaps: true,
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
          labels: { font: { weight: "700", size: 12 }, padding: 16, usePointStyle: true, pointStyleWidth: 10 }
        },
        tooltip: {
          backgroundColor: "rgba(15,25,45,0.90)",
          titleColor: "#fff",
          bodyColor: "rgba(255,255,255,.80)",
          borderColor: "rgba(255,255,255,.10)",
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label === "Exam Scores") return `  Score: ${ctx.parsed.y ?? "—"}%`;
              if (ctx.dataset.label === "Focus (min)") return `  Focus: ${ctx.parsed.y ?? "—"} min`;
              return `  Tasks Done: ${ctx.parsed.y ?? "—"}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#6b7a96" } },
        y: { min: 0, grid: { color: "rgba(107,122,150,0.10)" }, ticks: { font: { size: 11 }, color: "#6b7a96" } },
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
}

/********************** 12) Misc ************************/
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
        <div style="font-size:32px;margin-bottom:8px;">🔒</div>
        <div style="font-weight:800;margin-bottom:6px;">Sign in to view your tasks</div>
        <button class="small-btn primary" onclick="openAuthModal('login')" style="margin-top:4px;">Login / Sign Up</button>
      </div>`;
    }
    if ($("examsList")) {
      $("examsList").innerHTML = `<div style="text-align:center;padding:24px 0;">
        <div style="font-size:32px;margin-bottom:8px;">🔒</div>
        <div style="font-weight:800;margin-bottom:6px;">Sign in to view your exams</div>
        <button class="small-btn primary" onclick="openAuthModal('login')" style="margin-top:4px;">Login / Sign Up</button>
      </div>`;
    }
    if ($("notifList")) renderNotifs([]);
    if ($("perfList")) {
      $("perfList").innerHTML = `<div style="text-align:center;padding:24px 0;">
        <div style="font-size:32px;margin-bottom:8px;">🔒</div>
        <div style="font-weight:800;margin-bottom:6px;">Sign in to view your performance</div>
        <button class="small-btn primary" onclick="openAuthModal('login')" style="margin-top:4px;">Login / Sign Up</button>
      </div>`;
    }
    if ($("planText")) $("planText").textContent = "Please login to see your plan.";
    if ($("planRange")) $("planRange").textContent = "—";

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
    await loadPlan(userId);
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
  // Save focus minutes as a performance note
  await sb.from("performance_records").insert({
    user_id: session.user.id,
    average_grade: 0,
    completion_rate_percent: 0,
    notes: `Focus session: ${minutes} min`,
    grade_scale: "focus",
    updated_at: new Date().toISOString(),
  });
}

/********************** 14) Wire events ************************/
document.addEventListener("DOMContentLoaded", async () => {
  updateDateTime();
  setInterval(updateDateTime, 30_000);

  $("btnOpenNotifications")?.addEventListener("click", () => (location.href = "notifications.html"));
  $("btnOpenMail")?.addEventListener("click", () => window.open("mailto:raghdq111@gmail.com?subject=Planova Support", "_blank"));
  $("btnMarkAllRead")?.addEventListener("click", markAllNotifsRead);

  // ✅ Restore session early
  await restoreSessionFromStorage();

  await loadAllForCurrentPage();

  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    checkUpcomingDeadlines(user.id);
    checkScheduledNotifications(user.id);
    // Check scheduled notifs every 5 minutes
    setInterval(() => checkScheduledNotifications(user.id), 5 * 60 * 1000);
  }
  bindAuthUI();
  bindCommonModals();
  bindProfileModal();
  bindFocusTimer();

  $("taskForm")?.addEventListener("submit", saveTask);
  $("examForm")?.addEventListener("submit", saveExam);
  $("planForm")?.addEventListener("submit", savePlan);
  $("perfForm")?.addEventListener("submit", savePerf);
  $("notifForm")?.addEventListener("submit", saveNotif);

  // ✅ Performance scale change (only exists on performance page)
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

  const icons = { info: "🔔", warning: "⚠️", success: "✅", task: "✅", exam: "🗓️" };
  const colors = {
    info:    { bg: "rgba(255,255,255,0.96)", border: "rgba(79,141,255,0.35)",  icon: "#4f8dff" },
    warning: { bg: "rgba(255,255,255,0.96)", border: "rgba(251,146,60,0.40)",  icon: "#c2410c" },
    success: { bg: "rgba(255,255,255,0.96)", border: "rgba(34,197,94,0.35)",   icon: "#15803d" },
    task:    { bg: "rgba(255,255,255,0.96)", border: "rgba(79,141,255,0.35)",  icon: "#4f8dff" },
    exam:    { bg: "rgba(255,255,255,0.96)", border: "rgba(251,146,60,0.40)",  icon: "#c2410c" },
  };
  const c = colors[type] || colors.info;
  const icon = icons[type] || "🔔";

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
    <span style="font-size:20px;flex-shrink:0;margin-top:1px;">${icon}</span>
    <span>${message}</span>
  `;

  popup.addEventListener("click", () => {
    popup.style.opacity = "0";
    popup.style.transform = "translateX(20px)";
    setTimeout(() => popup.remove(), 300);
  });

  document.body.appendChild(popup);

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
      const typeIcons = { info: "ℹ️", warning: "⚠️", success: "✅" };
      showPopupNotification(`${n.title}: ${n.message}`, n.type || "info");
      // Mark as read
      await sb.from("notifications").update({ is_read: true }).eq("notification_id", n.notification_id);
    }
  }
}

// Check upcoming deadlines
async function checkUpcomingDeadlines(userId) {
  const now = new Date();

  // -------- Tasks --------
  const { data: tasks } = await sb.from("tasks").select("*").eq("user_id", userId);

  if (tasks) {
    for (const task of tasks) {
      if (!task.due_date || task.is_done) continue;

      const due = new Date(task.due_date);
      const diff = due - now;
      const hours = diff / (1000 * 60 * 60);

      // Check 48h and 24h windows
      const alerts = [];
      if (hours <= 48 && hours > 24) alerts.push({ label: "in 2 days", key: "48h" });
      if (hours <= 24 && hours > 0)  alerts.push({ label: "tomorrow", key: "24h" });

      for (const alert of alerts) {
        const dueTime = due.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        const message = `Task "${task.title}" is due ${alert.label} at ${dueTime}`;

        const { data: existing } = await sb.from("notifications").select("notification_id")
          .eq("user_id", userId).eq("message", message).eq("type", "task");

        if (!existing || existing.length === 0) {
          await sb.from("notifications").insert({
            user_id: userId,
            title: "Task Reminder",
            message,
            type: "task",
            is_read: false,
            created_at: new Date().toISOString(),
          });
          showPopupNotification(message, "task");
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
      const diff = examDate - now;
      const hours = diff / (1000 * 60 * 60);

      const alerts = [];
      if (hours <= 48 && hours > 24) alerts.push({ label: "in 2 days", key: "48h" });
      if (hours <= 24 && hours > 0)  alerts.push({ label: "tomorrow", key: "24h" });

      for (const alert of alerts) {
        const examTime = examDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        const message = `Exam "${exam.subject}" is ${alert.label} at ${examTime}`;

        const { data: existing } = await sb.from("notifications").select("notification_id")
          .eq("user_id", userId).eq("message", message).eq("type", "exam");

        if (!existing || existing.length === 0) {
          await sb.from("notifications").insert({
            user_id: userId,
            title: "Exam Reminder",
            message,
            type: "exam",
            is_read: false,
            created_at: new Date().toISOString(),
          });
          showPopupNotification(message, "exam");
        }
      }
    }
  }
}