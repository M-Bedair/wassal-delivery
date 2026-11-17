import {
  db,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from "./firebase-config.js";

// حالة التطبيق اللحظية (تتحدث تلقائياً من السحابة)
const state = {
  riders: [],
  merchants: [],
  orders: [],
  expenses: [],
  selectedRiderFilter: null,
  searchQuery: ""
};

// دوال مساعدة للتاريخ والوقت
const todayStr = () => new Date().toISOString().split("T")[0];
const monthPrefix = () => todayStr().slice(0, 7);
const formatTime12 = (ts) => {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
};
const diffMins = (start, end = Date.now()) => {
  if (!start) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
};

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add("hidden"), 3200);
}

// ==========================================
// 1. الاستماع اللحظي لقاعدة بيانات Firebase
// ==========================================
function initRealtimeListeners() {
  onSnapshot(collection(db, "riders"), (snap) => {
    state.riders = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id));
    renderAll();
  });

  onSnapshot(collection(db, "merchants"), (snap) => {
    state.merchants = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  });

  onSnapshot(collection(db, "orders"), (snap) => {
    state.orders = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.pickupTs - a.pickupTs);
    renderAll();
  });

  onSnapshot(collection(db, "expenses"), (snap) => {
    state.expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.id.localeCompare(a.id));
    renderAll();
  });
}

// ==========================================
// 2. تهيئة البيانات الأساسية للـ 10 مناديب
// ==========================================
async function seedInitialData() {
  const sampleRiders = Array.from({ length: 10 }, (_, i) => {
    const num = String(i + 1).padStart(2, "0");
    const names = [
      "أحمد محمود", "كريم عادل", "مصطفى حسن", "إسلام طارق", "محمود سعيد",
      "عمر خالد", "يوسف إبراهيم", "محمد أشرف", "حسام علي", "طارق نبيل"
    ];
    return {
      id: `R-${num}`,
      name: names[i],
      phone: `010000000${num}`,
      bikeModel: `موتوسيكل #${i + 1}`,
      status: "available"
    };
  });

  const sampleMerchants = [
    { id: "M-01", name: "مطعم حضرموت", category: "مطعم", phone: "01112223344" },
    { id: "M-02", name: "صيدليات العزبي", category: "صيدلية", phone: "01223334455" },
    { id: "M-03", name: "سوبر ماركت المحمل", category: "سوبر ماركت", phone: "01556667788" }
  ];

  for (const r of sampleRiders) await setDoc(doc(db, "riders", r.id), r);
  for (const m of sampleMerchants) await setDoc(doc(db, "merchants", m.id), m);
  showToast("✅ تم تهيئة الـ 10 مناديب والمتاجر على السحابة!");
}

// ==========================================
// 3. دورة حياة الطلب والتوقيتات
// ==========================================
async function createOrder(formData) {
  const id = `WSL-${Math.floor(1000 + Math.random() * 9000)}`;
  const riderId = formData.get("riderId");
  const now = Date.now();

  const order = {
    id,
    date: todayStr(),
    merchantId: formData.get("merchantId"),
    riderId,
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone"),
    customerAddress: formData.get("customerAddress"),
    orderPrincipal: Number(formData.get("orderPrincipal")),
    deliveryFee: Number(formData.get("deliveryFee")),
    status: "picked_up",
    pickupTs: now,
    transitTs: null,
    deliveryTs: null,
    waitMins: null,
    roadMins: null,
    totalMins: null
  };

  await setDoc(doc(db, "orders", id), order);
  await updateDoc(doc(db, "riders", riderId), { status: "busy" });
  showToast(`🚀 تم تسجيل الطلب ${id} وتحويل المندوب إلى (في مهمة)`);
}

async function advanceOrderStage(orderId) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return;
  const now = Date.now();

  if (order.status === "picked_up") {
    await updateDoc(doc(db, "orders", orderId), {
      status: "in_transit",
      transitTs: now,
      waitMins: diffMins(order.pickupTs, now)
    });
    showToast(`🛵 الطلب ${orderId} الآن في الطريق للعميل`);
  } else if (order.status === "in_transit") {
    const transitStart = order.transitTs || order.pickupTs;
    await updateDoc(doc(db, "orders", orderId), {
      status: "delivered",
      deliveryTs: now,
      roadMins: diffMins(transitStart, now),
      totalMins: diffMins(order.pickupTs, now)
    });

    // التحقق هل لدى المندوب طلبات أخرى جارية أم يعود للمكتب
    const otherActive = state.orders.some(
      (o) => o.id !== orderId && o.riderId === order.riderId && o.status !== "delivered"
    );
    if (!otherActive) {
      await updateDoc(doc(db, "riders", order.riderId), { status: "available" });
    }
    showToast(`✅ تم تسليم ${orderId} وعاد المندوب متاحاً بالمكتب`);
  }
}

function copyWhatsAppUpdate(orderId) {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o) return;
  const merchant = state.merchants.find((m) => m.id === o.merchantId)?.name || "متجر";
  const rider = state.riders.find((r) => r.id === o.riderId)?.name || "مندوب";
  const statusAr = o.status === "picked_up" ? "تم الاستلام 📦" : o.status === "in_transit" ? "في الطريق 🛵" : "تم التسليم ✅";

  const text = [
    `🛵 *تحديث أوردر #${o.id} | WASSAL - وصّل*`,
    `• *الحالة:* ${statusAr}`,
    `• *المتجر:* ${merchant}`,
    `• *العميل:* ${o.customerName} (${o.customerAddress})`,
    `• *المندوب:* ${rider}`,
    `• *التوقيتات:* استلام ${formatTime12(o.pickupTs)} | تحرك ${formatTime12(o.transitTs)} | تسليم ${formatTime12(o.deliveryTs)}`,
    o.totalMins !== null ? `• *إجمالي المدة:* ${o.totalMins} دقيقة` : `• *الوقت المنقضي:* ${diffMins(o.pickupTs)} دقيقة`,
    `• *الإجمالي للتحصيل:* ${o.orderPrincipal + o.deliveryFee} ج.م`
  ].join("\n");

  navigator.clipboard.writeText(text);
  showToast("📋 تم نسخ رسالة الواتساب! الصقها في الجروب الآن");
}

// ==========================================
// 4. رسم الواجهات والتقارير
// ==========================================
function renderAll() {
  renderKPIs();
  renderOperations();
  renderRiders();
  renderMerchants();
  renderAccounting();
}

function renderKPIs() {
  const today = todayStr();
  const month = monthPrefix();
  const todayOrders = state.orders.filter((o) => o.date === today);
  const monthOrders = state.orders.filter((o) => o.date?.startsWith(month));
  const activeCount = state.orders.filter((o) => o.status !== "delivered").length;
  const availableRiders = state.riders.filter((r) => r.status === "available").length;

  // حساب أكثر تاجر عملاً في الشهر
  const merchantCounts = {};
  monthOrders.forEach((o) => {
    merchantCounts[o.merchantId] = (merchantCounts[o.merchantId] || 0) + 1;
  });
  let topMerchantName = "—";
  let topMerchantCount = 0;
  Object.entries(merchantCounts).forEach(([mId, cnt]) => {
    if (cnt > topMerchantCount) {
      topMerchantCount = cnt;
      topMerchantName = state.merchants.find((m) => m.id === mId)?.name || mId;
    }
  });

  const todayRev = todayOrders.filter((o) => o.status === "delivered").reduce((s, o) => s + o.deliveryFee, 0);
  const todayExp = state.expenses.filter((e) => e.date === today).reduce((s, e) => s + e.amount, 0);

  document.getElementById("kpi-bar").innerHTML = `
    <div class="glass-card p-3 rounded-2xl"><div class="text-xs text-gray-400">أوردرات اليوم / الشهر</div><div class="text-xl font-black text-white mt-1 tabular-nums">${todayOrders.length} <span class="text-xs text-[#FF9E00]">/ ${monthOrders.length}</span></div></div>
    <div class="glass-card p-3 rounded-2xl"><div class="text-xs text-gray-400">طلبات جارية الآن</div><div class="text-xl font-black text-blue-400 mt-1 tabular-nums">${activeCount}</div></div>
    <div class="glass-card p-3 rounded-2xl"><div class="text-xs text-gray-400">مناديب متاحون</div><div class="text-xl font-black text-emerald-400 mt-1 tabular-nums">${availableRiders} / ${state.riders.length}</div></div>
    <div class="glass-card p-3 rounded-2xl"><div class="text-xs text-gray-400">👑 أكثر تاجر عملاً</div><div class="text-sm font-black text-[#FF9E00] mt-1 truncate">${topMerchantName} (${topMerchantCount})</div></div>
    <div class="glass-card p-3 rounded-2xl"><div class="text-xs text-gray-400">إيراد توصيل اليوم</div><div class="text-xl font-black text-white mt-1 tabular-nums">${todayRev} ج.م</div></div>
    <div class="glass-card p-3 rounded-2xl"><div class="text-xs text-gray-400">صافي ربح اليوم</div><div class="text-xl font-black ${todayRev - todayExp >= 0 ? "text-emerald-400" : "text-red-400"} mt-1 tabular-nums">${todayRev - todayExp} ج.م</div></div>
  `;
}

function renderOperations() {
  // شريط المناديب
  document.getElementById("fleet-ribbon").innerHTML = state.riders.map((r) => {
    const isSelected = state.selectedRiderFilter === r.id;
    const dot = r.status === "available" ? "bg-emerald-400" : r.status === "busy" ? "bg-[#FF6B00]" : "bg-gray-500";
    return `
      <button data-action="filter-rider" data-id="${r.id}" class="shrink-0 glass-card px-3 py-2 rounded-xl flex items-center gap-2 text-xs transition ${isSelected ? "border-[#FF6B00] bg-[#FF6B00]/15" : ""}">
        <span class="w-2.5 h-2.5 rounded-full ${dot}"></span>
        <span class="font-bold text-white">${r.name}</span>
      </button>
    `;
  }).join("");

  // تصفية الطلبات
  const q = state.searchQuery.toLowerCase();
  const filtered = state.orders.filter((o) => {
    if (state.selectedRiderFilter && o.riderId !== state.selectedRiderFilter) return false;
    if (!q) return true;
    const mName = state.merchants.find((m) => m.id === o.merchantId)?.name || "";
    const rName = state.riders.find((r) => r.id === o.riderId)?.name || "";
    return [o.id, o.customerName, o.customerAddress, mName, rName].some((v) => v?.toLowerCase().includes(q));
  });

  const cols = { picked_up: [], in_transit: [], delivered: [] };
  filtered.forEach((o) => cols[o.status]?.push(o));

  document.getElementById("count-picked").textContent = cols.picked_up.length;
  document.getElementById("count-transit").textContent = cols.in_transit.length;
  document.getElementById("count-delivered").textContent = cols.delivered.length;

  const renderCard = (o) => {
    const mName = state.merchants.find((m) => m.id === o.merchantId)?.name || "متجر";
    const rName = state.riders.find((r) => r.id === o.riderId)?.name || "مندوب";
    const elapsed = o.status === "delivered" ? o.totalMins : diffMins(o.pickupTs);
    const isLate = o.status !== "delivered" && elapsed > 35;

    return `
      <div class="bg-[#0B0D12]/90 border ${isLate ? "border-red-500" : "border-white/10"} rounded-xl p-3 space-y-2">
        <div class="flex justify-between items-center text-xs">
          <span class="font-black text-[#FF9E00]">#${o.id}</span>
          <span class="px-2 py-0.5 rounded-full font-bold tabular-nums ${isLate ? "bg-red-500/20 text-red-400 animate-pulse" : "bg-white/10 text-gray-300"}">
            ⏱ ${o.status === "delivered" ? `استغرق ${elapsed} د` : `منذ ${elapsed} د`}
          </span>
        </div>
        <div class="text-sm font-bold text-white">${mName} ⬅️ ${o.customerName}</div>
        <div class="text-xs text-gray-400">📍 ${o.customerAddress} | 🏍️ ${rName}</div>
        <div class="flex justify-between text-[11px] text-gray-400 bg-white/5 px-2 py-1 rounded-lg tabular-nums">
          <span>استلام: ${formatTime12(o.pickupTs)}</span>
          <span>تحرك: ${formatTime12(o.transitTs)}</span>
          <span>تسليم: ${formatTime12(o.deliveryTs)}</span>
        </div>
        <div class="flex justify-between items-center pt-1 text-xs font-bold">
          <span class="text-emerald-400 tabular-nums">التحصيل: ${o.orderPrincipal + o.deliveryFee} ج.م</span>
          <div class="flex gap-1.5">
            <button data-action="copy-wa" data-id="${o.id}" class="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30">واتساب</button>
            ${o.status !== "delivered" ? `
              <button data-action="advance-order" data-id="${o.id}" class="px-3 py-1.5 rounded-lg brand-gradient text-black font-extrabold">
                ${o.status === "picked_up" ? "تحرك للعميل ➔" : "تم التسليم ✓"}
              </button>
            ` : ""}
          </div>
        </div>
      </div>
    `;
  };

  document.getElementById("col-picked").innerHTML = cols.picked_up.map(renderCard).join("");
  document.getElementById("col-transit").innerHTML = cols.in_transit.map(renderCard).join("");
  document.getElementById("col-delivered").innerHTML = cols.delivered.map(renderCard).join("");
}

function renderRiders() {
  const today = todayStr();
  const month = monthPrefix();

  document.getElementById("riders-grid").innerHTML = state.riders.map((r) => {
    const rToday = state.orders.filter((o) => o.riderId === r.id && o.date === today && o.status === "delivered");
    const rMonth = state.orders.filter((o) => o.riderId === r.id && o.date?.startsWith(month) && o.status === "delivered");
    const avgMins = rMonth.length ? Math.round(rMonth.reduce((s, o) => s + (o.totalMins || 0), 0) / rMonth.length) : 0;

    return `
      <div class="glass-card p-4 rounded-2xl space-y-3">
        <div class="flex justify-between items-center">
          <div>
            <h3 class="font-bold text-white text-base">${r.name}</h3>
            <p class="text-xs text-gray-400">${r.bikeModel} • ${r.phone}</p>
          </div>
          <select data-action="change-rider-status" data-id="${r.id}" class="bg-[#0B0D12] border border-white/10 rounded-lg px-2 py-1 text-xs text-white">
            <option value="available" ${r.status === "available" ? "selected" : ""}>🟢 متاح</option>
            <option value="busy" ${r.status === "busy" ? "selected" : ""}>🟠 في مهمة</option>
            <option value="off" ${r.status === "off" ? "selected" : ""}>⚪ إجازة</option>
          </select>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center bg-[#0B0D12]/60 p-2.5 rounded-xl tabular-nums">
          <div><div class="text-[11px] text-gray-400">أوردرات اليوم</div><div class="font-black text-lg text-white">${rToday.length}</div></div>
          <div><div class="text-[11px] text-gray-400">أوردرات الشهر</div><div class="font-black text-lg text-[#FF9E00]">${rMonth.length}</div></div>
          <div><div class="text-[11px] text-gray-400">متوسط السرعة</div><div class="font-black text-lg text-blue-400">${avgMins} د</div></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderMerchants() {
  const month = monthPrefix();
  const ranked = state.merchants.map((m) => {
    const mOrders = state.orders.filter((o) => o.merchantId === m.id && o.date?.startsWith(month));
    const remitted = mOrders.filter((o) => o.status === "delivered").reduce((s, o) => s + o.orderPrincipal, 0);
    return { ...m, monthCount: mOrders.length, remitted };
  }).sort((a, b) => b.monthCount - a.monthCount);

  document.getElementById("merchants-grid").innerHTML = ranked.map((m, idx) => `
    <div class="glass-card p-4 rounded-2xl space-y-2 ${idx === 0 ? "border-[#FF6B00]" : ""}">
      <div class="flex justify-between items-center">
        <span class="font-bold text-white">${idx === 0 ? "👑 " : ""}${m.name}</span>
        <span class="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300">${m.category}</span>
      </div>
      <div class="flex justify-between text-xs text-gray-400 pt-2 tabular-nums">
        <span>أوردرات الشهر: <strong class="text-[#FF9E00]">${m.monthCount}</strong></span>
        <span>مبالغ مُورّدة: <strong class="text-emerald-400">${m.remitted} ج.م</strong></span>
      </div>
    </div>
  `).join("");
}

function renderAccounting() {
  const month = monthPrefix();
  const deliveredMonth = state.orders.filter((o) => o.date?.startsWith(month) && o.status === "delivered");
  const codRemitted = deliveredMonth.reduce((s, o) => s + o.orderPrincipal, 0);
  const grossRevenue = deliveredMonth.reduce((s, o) => s + o.deliveryFee, 0);
  const totalExpenses = state.expenses.filter((e) => e.date?.startsWith(month)).reduce((s, e) => s + e.amount, 0);
  const netProfit = grossRevenue - totalExpenses;

  document.getElementById("pnl-summary").innerHTML = `
    <div class="glass-card p-4 rounded-2xl"><div class="text-xs text-gray-400">عهدة التجار المُورّدة (الشهر)</div><div class="text-xl font-black text-gray-200 mt-1 tabular-nums">${codRemitted} ج.م</div></div>
    <div class="glass-card p-4 rounded-2xl"><div class="text-xs text-gray-400">إيرادات التوصيل (الشهر)</div><div class="text-xl font-black text-blue-400 mt-1 tabular-nums">${grossRevenue} ج.م</div></div>
    <div class="glass-card p-4 rounded-2xl"><div class="text-xs text-gray-400">إجمالي المصروفات (الشهر)</div><div class="text-xl font-black text-red-400 mt-1 tabular-nums">${totalExpenses} ج.م</div></div>
    <div class="glass-card p-4 rounded-2xl"><div class="text-xs text-gray-400">صافي ربح الشركة (الشهر)</div><div class="text-xl font-black text-emerald-400 mt-1 tabular-nums">${netProfit} ج.م</div></div>
  `;

  document.getElementById("expenses-tbody").innerHTML = state.expenses.map((e) => `
    <tr>
      <td class="py-2 text-gray-400">${e.date}</td>
      <td class="font-bold text-[#FF9E00]">${e.category}</td>
      <td>${e.description}</td>
      <td class="font-bold text-red-400 tabular-nums">${e.amount} ج.م</td>
      <td class="no-print"><button data-action="delete-expense" data-id="${e.id}" class="text-red-400 hover:underline">حذف</button></td>
    </tr>
  `).join("");

  document.getElementById("audit-tbody").innerHTML = state.orders.map((o) => {
    const mName = state.merchants.find((m) => m.id === o.merchantId)?.name || "—";
    const rName = state.riders.find((r) => r.id === o.riderId)?.name || "—";
    return `
      <tr>
        <td class="py-2 font-bold text-[#FF9E00]">${o.id}</td>
        <td>${mName}</td>
        <td>${o.customerName}</td>
        <td>${rName}</td>
        <td>${formatTime12(o.pickupTs)}</td>
        <td>${formatTime12(o.transitTs)}</td>
        <td>${formatTime12(o.deliveryTs)}</td>
        <td>${o.waitMins ?? "—"} د</td>
        <td>${o.roadMins ?? "—"} د</td>
        <td class="font-bold">${o.totalMins ?? "—"} د</td>
        <td>${o.orderPrincipal} ج.م</td>
        <td class="text-emerald-400 font-bold">${o.deliveryFee} ج.م</td>
      </tr>
    `;
  }).join("");
}

function exportCSV() {
  const headers = ["رقم الطلب", "التاريخ", "المتجر", "العميل", "المندوب", "استلام", "تحرك", "تسليم", "المدة(د)", "قيمة الأوردر", "رسوم التوصيل"];
  const rows = state.orders.map((o) => [
    o.id,
    o.date,
    state.merchants.find((m) => m.id === o.merchantId)?.name || "",
    o.customerName,
    state.riders.find((r) => r.id === o.riderId)?.name || "",
    formatTime12(o.pickupTs),
    formatTime12(o.transitTs),
    formatTime12(o.deliveryTs),
    o.totalMins ?? "",
    o.orderPrincipal,
    o.deliveryFee
  ]);
  const csv = "\uFEFF" + [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `wassal-report-${todayStr()}.csv`;
  a.click();
}

// ==========================================
// 5. إدارة الأحداث الموحدة (Event Delegation)
// ==========================================
document.addEventListener("click", async (e) => {
  const tabBtn = e.target.closest("[data-tab]");
  if (tabBtn) {
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.remove("bg-[#FF6B00]", "text-black");
      b.classList.add("text-gray-300");
    });
    tabBtn.classList.add("bg-[#FF6B00]", "text-black");
    tabBtn.classList.remove("text-gray-300");
    document.querySelectorAll(".view-section").forEach((s) => s.classList.add("hidden"));
    document.getElementById(`view-${tabBtn.dataset.tab}`).classList.remove("hidden");
    return;
  }

  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;
  const { action, id } = actionEl.dataset;

  if (action === "seed-demo") await seedInitialData();
  if (action === "advance-order") await advanceOrderStage(id);
  if (action === "copy-wa") copyWhatsAppUpdate(id);
  if (action === "export-csv") exportCSV();
  if (action === "delete-expense") await deleteDoc(doc(db, "expenses", id));

  if (action === "filter-rider") {
    state.selectedRiderFilter = state.selectedRiderFilter === id ? null : id;
    renderOperations();
  }

  if (action === "open-order-modal") {
    document.getElementById("order-merchant").innerHTML = state.merchants.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
    const avail = state.riders.filter((r) => r.status === "available");
    document.getElementById("order-rider").innerHTML = avail.length
      ? avail.map((r) => `<option value="${r.id}">${r.name} (${r.bikeModel})</option>`).join("")
      : `<option value="">لا يوجد مناديب متاحون حالياً</option>`;
    document.getElementById("order-modal").classList.replace("hidden", "flex");
  }

  if (action === "open-merchant-modal") {
    document.getElementById("merchant-modal").classList.replace("hidden", "flex");
  }

  if (action === "close-modals") {
    document.getElementById("order-modal").classList.replace("flex", "hidden");
    document.getElementById("merchant-modal").classList.replace("flex", "hidden");
  }
});

document.addEventListener("change", async (e) => {
  const el = e.target.closest("[data-action='change-rider-status']");
  if (el) {
    await updateDoc(doc(db, "riders", el.dataset.id), { status: el.value });
    showToast("تم تحديث حالة المندوب");
  }
});

document.getElementById("search-input").addEventListener("input", (e) => {
  state.searchQuery = e.target.value;
  renderOperations();
});

document.getElementById("order-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  if (!fd.get("riderId")) return showToast("⚠️ يجب اختيار مندوب متاح أولاً");
  await createOrder(fd);
  e.target.reset();
  document.getElementById("order-modal").classList.replace("flex", "hidden");
});

document.getElementById("merchant-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = `M-${Date.now()}`;
  await setDoc(doc(db, "merchants", id), {
    id,
    name: fd.get("name"),
    category: fd.get("category"),
    phone: fd.get("phone")
  });
  e.target.reset();
  document.getElementById("merchant-modal").classList.replace("flex", "hidden");
  showToast("✅ تم إضافة المتجر بنجاح");
});

document.getElementById("expense-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = `EXP-${Date.now()}`;
  await setDoc(doc(db, "expenses", id), {
    id,
    date: todayStr(),
    category: fd.get("category"),
    description: fd.get("description"),
    amount: Number(fd.get("amount"))
  });
  e.target.reset();
  showToast("💸 تم تسجيل المصروف");
});

// تحديث العداد الحي كل 30 ثانية
setInterval(() => renderOperations(), 30000);

// بدء الاتصال اللحظي بفايربيز
initRealtimeListeners();