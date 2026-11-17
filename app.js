import { stateRef, connectedRef, set, onValue } from './firebase-config.js';

const LOCAL_KEY = 'wassal_ops_v1';

const defaultRiders = [
    { id: 'r1', name: 'أحمد محمود', phone: '01012345678', vehicle: 'موتوسيكل', active: true },
    { id: 'r2', name: 'كريم عادل', phone: '01123456789', vehicle: 'موتوسيكل', active: true },
    { id: 'r3', name: 'مصطفى حسن', phone: '01234567890', vehicle: 'سكوتر', active: true }
];

let state = {
    riders: defaultRiders,
    orders: [],
    expenses: [],
    orderCounter: 1001
};

let activeDrawerOrderId = null;
let currentTab = 'dispatch';
let isInitialCloudLoaded = false;

// --- CLOUD SYNC STATUS ---
function setSyncStatus(status) {
    const configs = {
        connecting: { text: 'جاري الاتصال بالسحابة...', color: 'bg-amber-400 animate-pulse', textColor: 'text-amber-400' },
        online: { text: 'متصل بالسحابة (مباشر)', color: 'bg-emerald-400', textColor: 'text-emerald-400' },
        offline: { text: 'وضع عدم الاتصال (محلي)', color: 'bg-rose-400', textColor: 'text-rose-400' }
    };
    const cfg = configs[status];
    ['desktop', 'mobile'].forEach(prefix => {
        const dot = document.getElementById(`${prefix}-sync-dot`);
        const txt = document.getElementById(`${prefix}-sync-text`);
        if (dot && txt) {
            dot.className = `w-2 h-2 rounded-full ${cfg.color}`;
            txt.className = `text-xs font-bold ${cfg.textColor}`;
            txt.textContent = cfg.text;
        }
    });
}

onValue(connectedRef, (snap) => {
    setSyncStatus(snap.val() === true ? 'online' : 'offline');
});

onValue(stateRef, (snapshot) => {
    const cloudData = snapshot.val();
    if (cloudData) {
        state = {
            riders: Array.isArray(cloudData.riders) ? cloudData.riders : Object.values(cloudData.riders || defaultRiders),
            orders: cloudData.orders ? (Array.isArray(cloudData.orders) ? cloudData.orders : Object.values(cloudData.orders)) : [],
            expenses: cloudData.expenses ? (Array.isArray(cloudData.expenses) ? cloudData.expenses : Object.values(cloudData.expenses)) : [],
            orderCounter: cloudData.orderCounter || 1001
        };
        localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
    } else if (!isInitialCloudLoaded) {
        const localSaved = localStorage.getItem(LOCAL_KEY);
        if (localSaved) {
            try {
                const parsed = JSON.parse(localSaved);
                state = {
                    riders: parsed.riders || defaultRiders,
                    orders: parsed.orders || [],
                    expenses: parsed.expenses || [],
                    orderCounter: parsed.orderCounter || 1001
                };
            } catch (e) {}
        }
        saveState();
    }
    isInitialCloudLoaded = true;
    renderAll();
}, (error) => {
    console.error("Firebase Sync Error:", error);
    setSyncStatus('offline');
    const localSaved = localStorage.getItem(LOCAL_KEY);
    if (localSaved) {
        state = JSON.parse(localSaved);
        renderAll();
    }
});

function saveState() {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
    set(stateRef, state).catch(err => {
        console.error("Failed to save to Firebase:", err);
        showToast('تم الحفظ محلياً (تعذر المزامنة السحابية)');
    });
}

// --- UTILITIES ---
function formatTime(isoString) {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function getTodayStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getCurrentMonthStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function diffMinutes(startIso, endIso = new Date().toISOString()) {
    if (!startIso) return 0;
    return Math.max(0, Math.floor((new Date(endIso) - new Date(startIso)) / 60000));
}

function formatDuration(mins) {
    if (mins < 60) return `${mins} د`;
    return `${Math.floor(mins / 60)} س ${mins % 60} د`;
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-msg').textContent = msg;
    toast.classList.remove('translate-y-24', 'opacity-0');
    setTimeout(() => toast.classList.add('translate-y-24', 'opacity-0'), 3000);
}

// --- NAVIGATION ---
window.switchTab = function(tabName) {
    currentTab = tabName;
    ['dispatch', 'riders', 'accounting'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tabName);
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.className = btn.dataset.tab === tabName
            ? 'nav-btn w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm transition-all bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
            : 'nav-btn w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm text-slate-400 hover:text-white hover:bg-slate-800/70 transition-all';
    });

    if (window.innerWidth < 1024) toggleMobileMenu(false);
    renderAll();
};

window.toggleMobileMenu = function(force) {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const isOpen = !sidebar.classList.contains('translate-x-full');
    const shouldOpen = force !== undefined ? force : !isOpen;

    sidebar.classList.toggle('translate-x-full', !shouldOpen);
    backdrop.classList.toggle('hidden', !shouldOpen);
};

document.getElementById('mobile-menu-btn').addEventListener('click', () => toggleMobileMenu());

// --- RENDER FUNCTIONS ---
function renderAll() {
    document.getElementById('sidebar-date').textContent = new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
    renderFleetRibbon();
    if (currentTab === 'dispatch') renderDispatch();
    if (currentTab === 'riders') renderRiders();
    if (currentTab === 'accounting') renderAccounting();
    if (activeDrawerOrderId) renderOrderDrawer(activeDrawerOrderId);
    if (window.lucide) window.lucide.createIcons();
}

function renderFleetRibbon() {
    const ribbon = document.getElementById('fleet-ribbon');
    ribbon.innerHTML = state.riders.map(r => {
        const activeOrders = state.orders.filter(o => o.riderId === r.id && o.status !== 'delivered');
        const isBusy = activeOrders.length > 0;
        return `
            <div class="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${isBusy ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'}">
                <span class="w-2 h-2 rounded-full ${isBusy ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}"></span>
                <span>${r.name}</span>
                <span class="text-[10px] opacity-75">(${isBusy ? `في مهمة (${activeOrders.length})` : 'متاح'})</span>
            </div>
        `;
    }).join('');
}

function renderDispatch() {
    const today = getTodayStr();
    const todayOrders = state.orders.filter(o => o.dateStr === today);
    const activeOrders = state.orders.filter(o => o.status !== 'delivered');
    const completedToday = todayOrders.filter(o => o.status === 'delivered');

    const todayRevenue = completedToday.reduce((sum, o) => sum + Number(o.deliveryFee || 0), 0);
    const avgTime = completedToday.length 
        ? Math.round(completedToday.reduce((sum, o) => sum + diffMinutes(o.createdAt, o.deliveredAt), 0) / completedToday.length)
        : 0;

    document.getElementById('dispatch-kpis').innerHTML = `
        <div class="glass-panel p-4 rounded-2xl border-r-4 border-amber-500">
            <div class="text-xs text-slate-400 font-bold">طلبات نشطة حالياً</div>
            <div class="text-2xl font-black text-white mt-1 tabular-nums">${activeOrders.length}</div>
            <div class="text-[11px] text-amber-400 mt-1">قيد المتابعة الحية</div>
        </div>
        <div class="glass-panel p-4 rounded-2xl border-r-4 border-emerald-500">
            <div class="text-xs text-slate-400 font-bold">تم توصيله اليوم</div>
            <div class="text-2xl font-black text-white mt-1 tabular-nums">${completedToday.length}</div>
            <div class="text-[11px] text-emerald-400 mt-1">من إجمالي ${todayOrders.length} طلب اليوم</div>
        </div>
        <div class="glass-panel p-4 rounded-2xl border-r-4 border-sky-500">
            <div class="text-xs text-slate-400 font-bold">إيراد التوصيل اليوم</div>
            <div class="text-2xl font-black text-white mt-1 tabular-nums">${todayRevenue} <span class="text-xs font-bold text-slate-400">ج.م</span></div>
            <div class="text-[11px] text-sky-400 mt-1">صافي رسوم التوصيل</div>
        </div>
        <div class="glass-panel p-4 rounded-2xl border-r-4 border-purple-500">
            <div class="text-xs text-slate-400 font-bold">متوسط سرعة التوصيل</div>
            <div class="text-2xl font-black text-white mt-1 tabular-nums">${avgTime} <span class="text-xs font-bold text-slate-400">دقيقة</span></div>
            <div class="text-[11px] text-purple-400 mt-1">من الطلب حتى باب العميل</div>
        </div>
    `;

    document.getElementById('active-count-badge').textContent = activeOrders.length;

    const grid = document.getElementById('active-orders-grid');
    if (activeOrders.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full glass-panel rounded-2xl p-10 text-center space-y-3">
                <div class="w-14 h-14 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto text-slate-400">
                    <i data-lucide="coffee" class="w-7 h-7"></i>
                </div>
                <h4 class="text-base font-bold text-slate-200">لا توجد طلبات نشطة حالياً</h4>
                <p class="text-xs text-slate-400 max-w-sm mx-auto">اضغط على "تسجيل طلب جديد" لإسناد طلب لأحد المناديب وبدء تتبع الوقت وإرسال التفاصيل عبر واتساب.</p>
            </div>
        `;
    } else {
        grid.innerHTML = activeOrders.map(order => {
            const rider = state.riders.find(r => r.id === order.riderId) || { name: 'غير محدد' };
            const elapsedTotal = diffMinutes(order.createdAt);
            const isLate = elapsedTotal > 35;

            let statusBadge = '';
            let nextActionBtn = '';

            if (order.status === 'assigned') {
                statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/30">في الطريق للمتجر / انتظار</span>`;
                nextActionBtn = `
                    <button onclick="advanceOrderStatus('${order.id}', 'picked_up')" class="flex-1 py-2.5 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition-all">
                        <i data-lucide="shopping-bag" class="w-4 h-4"></i>
                        <span>تم الاستلام من المتجر</span>
                    </button>
                `;
            } else if (order.status === 'picked_up') {
                statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-extrabold bg-sky-500/15 text-sky-400 border border-sky-500/30">جاري التوصيل للعميل</span>`;
                nextActionBtn = `
                    <button onclick="advanceOrderStatus('${order.id}', 'delivered')" class="flex-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition-all">
                        <i data-lucide="check-circle" class="w-4 h-4"></i>
                        <span>تأكيد التسليم للعميل</span>
                    </button>
                `;
            }

            const waitMins = order.pickedUpAt ? diffMinutes(order.createdAt, order.pickedUpAt) : diffMinutes(order.createdAt);
            const roadMins = order.pickedUpAt ? diffMinutes(order.pickedUpAt) : 0;

            return `
                <div class="glass-panel rounded-2xl p-5 flex flex-col justify-between gap-4 border ${isLate ? 'border-rose-500/60 shadow-lg shadow-rose-500/10' : 'border-slate-800'}">
                    <div class="space-y-3">
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-2">
                                <span class="font-black text-sm text-amber-400">#${order.number}</span>
                                <span class="text-xs text-slate-500 tabular-nums">${formatTime(order.createdAt)}</span>
                            </div>
                            ${statusBadge}
                        </div>

                        <div>
                            <div class="text-base font-black text-white flex items-center gap-1.5">
                                <i data-lucide="store" class="w-4 h-4 text-amber-400 shrink-0"></i>
                                <span class="truncate">${order.vendor}</span>
                            </div>
                            <div class="text-xs text-slate-300 mt-1 flex items-center gap-1.5">
                                <i data-lucide="user" class="w-3.5 h-3.5 text-slate-400 shrink-0"></i>
                                <span>${order.customerName}</span>
                                <span class="text-slate-500">•</span>
                                <span class="text-slate-400 truncate">${order.address}</span>
                            </div>
                        </div>

                        <div class="grid grid-cols-3 gap-2 bg-slate-950/90 p-2.5 rounded-xl border border-slate-800/80 text-center tabular-nums">
                            <div>
                                <div class="text-[10px] text-slate-400">انتظار المتجر</div>
                                <div class="text-xs font-extrabold ${!order.pickedUpAt && waitMins > 15 ? 'text-amber-400' : 'text-slate-200'}">${waitMins} د</div>
                            </div>
                            <div class="border-x border-slate-800">
                                <div class="text-[10px] text-slate-400">وقت الطريق</div>
                                <div class="text-xs font-extrabold text-sky-400">${order.pickedUpAt ? roadMins + ' د' : '--'}</div>
                            </div>
                            <div>
                                <div class="text-[10px] text-slate-400">الإجمالي</div>
                                <div class="text-xs font-black ${isLate ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}">${elapsedTotal} د</div>
                            </div>
                        </div>

                        <div class="flex items-center justify-between text-xs pt-1">
                            <div class="flex items-center gap-1.5 text-slate-300 font-bold">
                                <i data-lucide="bike" class="w-4 h-4 text-amber-400"></i>
                                <span>${rider.name}</span>
                            </div>
                            <div class="font-bold text-slate-300 tabular-nums">
                                التحصيل: <span class="text-white font-black">${Number(order.orderValue) + Number(order.deliveryFee)} ج.م</span>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                        ${nextActionBtn}
                        <button onclick="openOrderDrawer('${order.id}')" title="التفاصيل ورسالة واتساب" class="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 transition-all">
                            <i data-lucide="message-circle" class="w-4 h-4"></i>
                        </button>
                        <button onclick="openOrderDrawer('${order.id}')" title="التوقيتات والتفاصيل" class="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all">
                            <i data-lucide="sliders-horizontal" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    const compBody = document.getElementById('completed-today-table');
    if (completedToday.length === 0) {
        compBody.innerHTML = `<tr><td colspan="9" class="py-6 text-center text-slate-500 text-xs">لم تكتمل أي طلبات اليوم بعد</td></tr>`;
    } else {
        compBody.innerHTML = completedToday.slice().reverse().map(o => {
            const rider = state.riders.find(r => r.id === o.riderId) || { name: '-' };
            const wait = o.pickedUpAt ? diffMinutes(o.createdAt, o.pickedUpAt) : 0;
            const road = o.pickedUpAt ? diffMinutes(o.pickedUpAt, o.deliveredAt) : diffMinutes(o.createdAt, o.deliveredAt);
            const total = diffMinutes(o.createdAt, o.deliveredAt);
            return `
                <tr class="hover:bg-slate-800/40 transition-colors tabular-nums">
                    <td class="py-3 px-4 font-bold text-amber-400">#${o.number}</td>
                    <td class="py-3 px-4 font-bold text-white">${o.vendor}</td>
                    <td class="py-3 px-4 text-slate-300">${o.customerName}</td>
                    <td class="py-3 px-4 text-slate-300">${rider.name}</td>
                    <td class="py-3 px-4 text-slate-400">${wait} د</td>
                    <td class="py-3 px-4 text-sky-400 font-bold">${road} د</td>
                    <td class="py-3 px-4 text-emerald-400 font-black">${total} د</td>
                    <td class="py-3 px-4 font-bold text-white">${o.deliveryFee} ج.م</td>
                    <td class="py-3 px-4 text-center">
                        <button onclick="openOrderDrawer('${o.id}')" class="text-xs text-slate-400 hover:text-amber-400 underline">التفاصيل</button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

function renderRiders() {
    const today = getTodayStr();
    const grid = document.getElementById('riders-grid');
    grid.innerHTML = state.riders.map(rider => {
        const riderOrdersToday = state.orders.filter(o => o.riderId === rider.id && o.dateStr === today && o.status === 'delivered');
        const activeOrders = state.orders.filter(o => o.riderId === rider.id && o.status !== 'delivered');
        const isBusy = activeOrders.length > 0;
        const totalFeesToday = riderOrdersToday.reduce((s, o) => s + Number(o.deliveryFee || 0), 0);
        const totalCashCollected = riderOrdersToday.reduce((s, o) => s + Number(o.orderValue || 0) + Number(o.deliveryFee || 0), 0);

        return `
            <div class="glass-panel rounded-2xl p-5 space-y-4">
                <div class="flex items-start justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 font-black text-lg">
                            ${rider.name.charAt(0)}
                        </div>
                        <div>
                            <h3 class="font-extrabold text-base text-white">${rider.name}</h3>
                            <div class="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                                <span>${rider.vehicle}</span>
                                <span>•</span>
                                <span dir="ltr">${rider.phone}</span>
                            </div>
                        </div>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-xs font-bold ${isBusy ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}">
                        ${isBusy ? `في مهمة (${activeOrders.length})` : 'متاح للعمل'}
                    </span>
                </div>

                <div class="grid grid-cols-3 gap-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-center tabular-nums">
                    <div>
                        <div class="text-[11px] text-slate-400">طلبات اليوم</div>
                        <div class="text-sm font-black text-white mt-0.5">${riderOrdersToday.length}</div>
                    </div>
                    <div class="border-x border-slate-800">
                        <div class="text-[11px] text-slate-400">إيراد التوصيل</div>
                        <div class="text-sm font-black text-emerald-400 mt-0.5">${totalFeesToday} ج.م</div>
                    </div>
                    <div>
                        <div class="text-[11px] text-slate-400">إجمالي التحصيل</div>
                        <div class="text-sm font-black text-amber-400 mt-0.5">${totalCashCollected} ج.م</div>
                    </div>
                </div>

                <div class="flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <a href="https://wa.me/2${rider.phone.replace(/^0+/, '0')}" target="_blank" class="text-xs font-bold text-emerald-400 hover:underline flex items-center gap-1">
                        <i data-lucide="message-circle" class="w-4 h-4"></i>
                        <span>مراسلة واتساب</span>
                    </a>
                    ${state.riders.length > 1 ? `
                        <button onclick="deleteRider('${rider.id}')" class="text-xs text-rose-400 hover:text-rose-300">حذف</button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

window.renderAccounting = function() {
    const picker = document.getElementById('report-month-picker');
    if (!picker.value) picker.value = getCurrentMonthStr();
    const selectedMonth = picker.value;

    const monthOrders = state.orders.filter(o => o.dateStr && o.dateStr.startsWith(selectedMonth));
    const deliveredOrders = monthOrders.filter(o => o.status === 'delivered');
    const monthExpenses = state.expenses.filter(e => e.dateStr && e.dateStr.startsWith(selectedMonth));

    const grossDeliveryRevenue = deliveredOrders.reduce((s, o) => s + Number(o.deliveryFee || 0), 0);
    const totalVendorValue = deliveredOrders.reduce((s, o) => s + Number(o.orderValue || 0), 0);
    const totalExpenses = monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const netProfit = grossDeliveryRevenue - totalExpenses;

    const avgDeliveryMins = deliveredOrders.length
        ? Math.round(deliveredOrders.reduce((s, o) => s + diffMinutes(o.createdAt, o.deliveredAt), 0) / deliveredOrders.length)
        : 0;

    document.getElementById('accounting-kpis').innerHTML = `
        <div class="glass-panel p-5 rounded-2xl border-r-4 border-emerald-500">
            <div class="text-xs text-slate-400 font-bold">إجمالي إيرادات التوصيل</div>
            <div class="text-2xl font-black text-emerald-400 mt-1 tabular-nums">${grossDeliveryRevenue.toLocaleString()} <span class="text-xs">ج.م</span></div>
            <div class="text-[11px] text-slate-400 mt-1">من ${deliveredOrders.length} طلب مكتمل</div>
        </div>
        <div class="glass-panel p-5 rounded-2xl border-r-4 border-rose-500">
            <div class="text-xs text-slate-400 font-bold">إجمالي المصروفات الشهرية</div>
            <div class="text-2xl font-black text-rose-400 mt-1 tabular-nums">${totalExpenses.toLocaleString()} <span class="text-xs">ج.م</span></div>
            <div class="text-[11px] text-slate-400 mt-1">${monthExpenses.length} بند مصروفات مسجل</div>
        </div>
        <div class="glass-panel p-5 rounded-2xl border-r-4 ${netProfit >= 0 ? 'border-amber-500' : 'border-rose-600'}">
            <div class="text-xs text-slate-400 font-bold">صافي ربح الشهر</div>
            <div class="text-2xl font-black ${netProfit >= 0 ? 'text-amber-400' : 'text-rose-500'} mt-1 tabular-nums">${netProfit.toLocaleString()} <span class="text-xs">ج.م</span></div>
            <div class="text-[11px] text-slate-400 mt-1">الإيرادات مطروحاً منها المصروفات</div>
        </div>
        <div class="glass-panel p-5 rounded-2xl border-r-4 border-sky-500">
            <div class="text-xs text-slate-400 font-bold">متوسط زمن التوصيل الشهري</div>
            <div class="text-2xl font-black text-sky-400 mt-1 tabular-nums">${avgDeliveryMins} <span class="text-xs">دقيقة</span></div>
            <div class="text-[11px] text-slate-400 mt-1">قيمة بضائع المتاجر: ${totalVendorValue.toLocaleString()} ج.م</div>
        </div>
    `;

    document.getElementById('income-statement-body').innerHTML = `
        <div class="flex justify-between py-2 border-b border-slate-800/80">
            <span class="text-slate-300">إيرادات رسوم التوصيل</span>
            <span class="font-bold text-emerald-400 tabular-nums">+ ${grossDeliveryRevenue.toLocaleString()} ج.م</span>
        </div>
        <div class="flex justify-between py-2 border-b border-slate-800/80">
            <span class="text-slate-300">المصروفات التشغيلية</span>
            <span class="font-bold text-rose-400 tabular-nums">- ${totalExpenses.toLocaleString()} ج.م</span>
        </div>
        <div class="flex justify-between py-3 px-3 rounded-xl bg-slate-950 font-black text-base">
            <span class="text-white">صافي الربح النهائي</span>
            <span class="${netProfit >= 0 ? 'text-amber-400' : 'text-rose-500'} tabular-nums">${netProfit.toLocaleString()} ج.م</span>
        </div>
        <div class="text-xs text-slate-400 pt-2 leading-relaxed">
            * هامش الربح التشغيلي: <strong class="text-white">${grossDeliveryRevenue > 0 ? Math.round((netProfit / grossDeliveryRevenue) * 100) : 0}%</strong>
        </div>
    `;

    const expBody = document.getElementById('expenses-table-body');
    if (monthExpenses.length === 0) {
        expBody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-500 text-xs">لا توجد مصروفات مسجلة في هذا الشهر</td></tr>`;
    } else {
        expBody.innerHTML = monthExpenses.slice().reverse().map(e => `
            <tr class="hover:bg-slate-800/40">
                <td class="py-2.5 px-3 text-slate-400 tabular-nums">${e.dateStr}</td>
                <td class="py-2.5 px-3 font-bold text-white">${e.title}</td>
                <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs">${e.category}</span></td>
                <td class="py-2.5 px-3 font-bold text-rose-400 tabular-nums">${Number(e.amount).toLocaleString()} ج.م</td>
                <td class="py-2.5 px-3 text-center no-print">
                    <button onclick="deleteExpense('${e.id}')" class="text-slate-500 hover:text-rose-400"><i data-lucide="trash-2" class="w-4 h-4 inline"></i></button>
                </td>
            </tr>
        `).join('');
    }

    const auditBody = document.getElementById('audit-table-body');
    if (monthOrders.length === 0) {
        auditBody.innerHTML = `<tr><td colspan="11" class="py-6 text-center text-slate-500 text-xs">لا توجد طلبات مسجلة في هذا الشهر</td></tr>`;
    } else {
        auditBody.innerHTML = monthOrders.slice().reverse().map(o => {
            const rider = state.riders.find(r => r.id === o.riderId) || { name: '-' };
            const totalDuration = o.deliveredAt ? formatDuration(diffMinutes(o.createdAt, o.deliveredAt)) : 'قيد التنفيذ';
            return `
                <tr class="hover:bg-slate-800/40">
                    <td class="py-2.5 px-3 text-slate-400">${o.dateStr}</td>
                    <td class="py-2.5 px-3 font-bold text-amber-400">#${o.number}</td>
                    <td class="py-2.5 px-3 font-bold text-white">${o.vendor}</td>
                    <td class="py-2.5 px-3 text-slate-300">${o.customerName}</td>
                    <td class="py-2.5 px-3 text-slate-300">${rider.name}</td>
                    <td class="py-2.5 px-3 text-slate-300">${formatTime(o.createdAt)}</td>
                    <td class="py-2.5 px-3 text-sky-400">${formatTime(o.pickedUpAt)}</td>
                    <td class="py-2.5 px-3 text-emerald-400">${formatTime(o.deliveredAt)}</td>
                    <td class="py-2.5 px-3 font-bold text-white">${totalDuration}</td>
                    <td class="py-2.5 px-3 text-slate-300">${o.orderValue} ج.م</td>
                    <td class="py-2.5 px-3 font-bold text-emerald-400">${o.deliveryFee} ج.م</td>
                </tr>
            `;
        }).join('');
    }
    if (window.lucide) window.lucide.createIcons();
};

// --- ORDER ACTIONS & WORKFLOW ---
window.openNewOrderModal = function() {
    const select = document.getElementById('ord-rider');
    select.innerHTML = state.riders.map(r => `<option value="${r.id}">${r.name} (${r.vehicle})</option>`).join('');
    document.getElementById('new-order-modal').classList.remove('hidden');
    document.getElementById('new-order-modal').classList.add('flex');
};

window.closeNewOrderModal = function() {
    document.getElementById('new-order-modal').classList.add('hidden');
    document.getElementById('new-order-modal').classList.remove('flex');
};

window.handleCreateOrder = function(e) {
    e.preventDefault();
    const nowIso = new Date().toISOString();
    const newOrder = {
        id: 'ord_' + Date.now(),
        number: state.orderCounter++,
        dateStr: getTodayStr(),
        vendor: document.getElementById('ord-vendor').value.trim(),
        riderId: document.getElementById('ord-rider').value,
        customerName: document.getElementById('ord-customer').value.trim(),
        customerPhone: document.getElementById('ord-phone').value.trim(),
        address: document.getElementById('ord-address').value.trim(),
        orderValue: Number(document.getElementById('ord-value').value) || 0,
        deliveryFee: Number(document.getElementById('ord-fee').value) || 0,
        notes: document.getElementById('ord-notes').value.trim(),
        status: 'assigned',
        createdAt: nowIso,
        pickedUpAt: null,
        deliveredAt: null
    };

    state.orders.push(newOrder);
    saveState();
    e.target.reset();
    document.getElementById('ord-fee').value = 25;
    closeNewOrderModal();
    renderAll();
    showToast(`تم إطلاق الطلب #${newOrder.number} ومزامنته سحابياً`);
    openOrderDrawer(newOrder.id);
};

window.advanceOrderStatus = function(orderId, nextStatus) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return;
    const nowIso = new Date().toISOString();

    if (nextStatus === 'picked_up') {
        order.status = 'picked_up';
        order.pickedUpAt = nowIso;
        showToast(`تم تسجيل استلام الطلب #${order.number} من المتجر`);
    } else if (nextStatus === 'delivered') {
        if (!order.pickedUpAt) order.pickedUpAt = nowIso;
        order.status = 'delivered';
        order.deliveredAt = nowIso;
        showToast(`تم تأكيد تسليم الطلب #${order.number} بنجاح`);
    }

    saveState();
    renderAll();
};

window.deleteOrder = function(orderId) {
    if (!confirm('هل أنت متأكد من حذف هذا الطلب نهائياً؟')) return;
    state.orders = state.orders.filter(o => o.id !== orderId);
    saveState();
    closeOrderDrawer();
    renderAll();
    showToast('تم حذف الطلب');
};

// --- ORDER DRAWER & WHATSAPP DISPATCH ---
window.openOrderDrawer = function(orderId) {
    activeDrawerOrderId = orderId;
    renderOrderDrawer(orderId);
    document.getElementById('order-drawer-backdrop').classList.remove('hidden');
    document.getElementById('order-drawer').classList.remove('-translate-x-full');
    if (window.lucide) window.lucide.createIcons();
};

window.closeOrderDrawer = function() {
    activeDrawerOrderId = null;
    document.getElementById('order-drawer-backdrop').classList.add('hidden');
    document.getElementById('order-drawer').classList.add('-translate-x-full');
};

function generateWhatsAppMessage(order) {
    const totalCollect = Number(order.orderValue) + Number(order.deliveryFee);
    return `🚀 *طلب توصيل جديد - WASSAL | وصّل*
🔢 رقم الطلب: *#${order.number}*
🏪 المتجر: *${order.vendor}*
👤 العميل: *${order.customerName}*
📱 هاتف العميل: ${order.customerPhone}
📍 العنوان: *${order.address}*
💵 قيمة الطلب للمتجر: ${order.orderValue} ج.م
🛵 رسوم التوصيل: ${order.deliveryFee} ج.م
💰 *إجمالي المطلوب تحصيله: ${totalCollect} ج.م*
${order.notes ? `📝 ملاحظات: ${order.notes}\n` : ''}⏰ وقت الطلب: ${formatTime(order.createdAt)}`;
}

function renderOrderDrawer(orderId) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return;
    const rider = state.riders.find(r => r.id === order.riderId) || { name: 'غير محدد', phone: '' };
    document.getElementById('drawer-order-id').textContent = `#${order.number}`;

    const waText = generateWhatsAppMessage(order);
    const cleanRiderPhone = rider.phone ? '2' + rider.phone.replace(/^0+/, '0') : '';
    const waUrl = `https://wa.me/${cleanRiderPhone}?text=${encodeURIComponent(waText)}`;

    const waitDuration = order.pickedUpAt ? `${diffMinutes(order.createdAt, order.pickedUpAt)} دقيقة` : 'جاري الانتظار...';
    const roadDuration = order.deliveredAt ? `${diffMinutes(order.pickedUpAt, order.deliveredAt)} دقيقة` : (order.pickedUpAt ? 'في الطريق الآن...' : '--');
    const totalDuration = order.deliveredAt ? `${diffMinutes(order.createdAt, order.deliveredAt)} دقيقة` : `${diffMinutes(order.createdAt)} دقيقة (مستمر)`;

    document.getElementById('drawer-content').innerHTML = `
        <div class="bg-slate-950 rounded-2xl p-4 border border-slate-800 space-y-3">
            <div class="text-xs font-extrabold text-amber-400 uppercase tracking-wider">سجل التوقيتات الدقيق</div>
            
            <div class="space-y-3 relative before:absolute before:right-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                <div class="flex items-center justify-between pr-6 relative">
                    <span class="w-2.5 h-2.5 rounded-full bg-amber-400 absolute right-1"></span>
                    <span class="text-xs text-slate-300">1. وقت تسجيل وإسناد الطلب</span>
                    <span class="text-xs font-black text-white tabular-nums">${formatTime(order.createdAt)}</span>
                </div>
                <div class="flex items-center justify-between pr-6 relative">
                    <span class="w-2.5 h-2.5 rounded-full ${order.pickedUpAt ? 'bg-sky-400' : 'bg-slate-700'} absolute right-1"></span>
                    <span class="text-xs text-slate-300">2. استلام المندوب من المتجر</span>
                    <span class="text-xs font-black text-sky-400 tabular-nums">${formatTime(order.pickedUpAt)}</span>
                </div>
                <div class="flex items-center justify-between pr-6 relative">
                    <span class="w-2.5 h-2.5 rounded-full ${order.deliveredAt ? 'bg-emerald-400' : 'bg-slate-700'} absolute right-1"></span>
                    <span class="text-xs text-slate-300">3. التسليم النهائي للعميل</span>
                    <span class="text-xs font-black text-emerald-400 tabular-nums">${formatTime(order.deliveredAt)}</span>
                </div>
            </div>

            <div class="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800 text-center text-xs">
                <div class="bg-slate-900 p-2 rounded-lg">
                    <div class="text-[10px] text-slate-400">انتظار المتجر</div>
                    <div class="font-bold text-slate-200 mt-0.5">${waitDuration}</div>
                </div>
                <div class="bg-slate-900 p-2 rounded-lg">
                    <div class="text-[10px] text-slate-400">مدة الطريق</div>
                    <div class="font-bold text-sky-400 mt-0.5">${roadDuration}</div>
                </div>
                <div class="bg-slate-900 p-2 rounded-lg">
                    <div class="text-[10px] text-slate-400">المدة الكلية</div>
                    <div class="font-black text-amber-400 mt-0.5">${totalDuration}</div>
                </div>
            </div>
        </div>

        ${order.status !== 'delivered' ? `
        <div class="space-y-2">
            <div class="text-xs font-bold text-slate-400">تحديث حالة الطلب:</div>
            <div class="flex gap-2">
                ${order.status === 'assigned' ? `
                    <button onclick="advanceOrderStatus('${order.id}', 'picked_up')" class="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs">تسجيل الاستلام من المتجر</button>
                ` : ''}
                <button onclick="advanceOrderStatus('${order.id}', 'delivered')" class="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs">تأكيد التسليم للعميل</button>
            </div>
        </div>
        ` : ''}

        <div class="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
            <div class="flex items-center justify-between">
                <span class="text-xs font-extrabold text-emerald-400 flex items-center gap-1.5">
                    <i data-lucide="message-circle" class="w-4 h-4"></i>
                    <span>رسالة إرسال الطلب للمندوب (${rider.name})</span>
                </span>
            </div>
            <pre class="text-xs text-slate-200 bg-slate-950/90 p-3 rounded-xl border border-slate-800 whitespace-pre-wrap font-sans leading-relaxed">${waText}</pre>
            <div class="flex gap-2">
                <a href="${waUrl}" target="_blank" class="flex-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5">
                    <i data-lucide="send" class="w-4 h-4"></i>
                    <span>إرسال عبر واتساب مباشرة</span>
                </a>
                <button onclick="copyWaMessage(\`${waText.replace(/`/g, '\\`')}\`)" class="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5">
                    <i data-lucide="copy" class="w-4 h-4"></i>
                    <span>نسخ</span>
                </button>
            </div>
        </div>

        <div class="bg-slate-950/60 rounded-2xl p-4 border border-slate-800 space-y-2 text-xs">
            <div class="flex justify-between"><span class="text-slate-400">المتجر:</span><span class="font-bold text-white">${order.vendor}</span></div>
            <div class="flex justify-between"><span class="text-slate-400">العميل:</span><span class="font-bold text-white">${order.customerName} (${order.customerPhone})</span></div>
            <div class="flex justify-between"><span class="text-slate-400">العنوان:</span><span class="font-bold text-white">${order.address}</span></div>
            <div class="flex justify-between"><span class="text-slate-400">قيمة الطلب:</span><span class="font-bold text-slate-200">${order.orderValue} ج.م</span></div>
            <div class="flex justify-between"><span class="text-slate-400">رسوم التوصيل:</span><span class="font-bold text-amber-400">${order.deliveryFee} ج.م</span></div>
        </div>

        <button onclick="deleteOrder('${order.id}')" class="w-full py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-bold">
            حذف هذا الطلب من السجل
        </button>
    `;
}

window.copyWaMessage = function(text) {
    navigator.clipboard.writeText(text);
    showToast('تم نسخ رسالة الطلب للحافظة');
};

// --- RIDERS & EXPENSES MODALS ---
window.openRiderModal = function() {
    document.getElementById('rider-modal').classList.remove('hidden');
    document.getElementById('rider-modal').classList.add('flex');
};
window.closeRiderModal = function() {
    document.getElementById('rider-modal').classList.add('hidden');
    document.getElementById('rider-modal').classList.remove('flex');
};
window.handleAddRider = function(e) {
    e.preventDefault();
    state.riders.push({
        id: 'r_' + Date.now(),
        name: document.getElementById('rider-name').value.trim(),
        phone: document.getElementById('rider-phone').value.trim(),
        vehicle: document.getElementById('rider-vehicle').value,
        active: true
    });
    saveState();
    e.target.reset();
    closeRiderModal();
    renderAll();
    showToast('تم إضافة المندوب بنجاح');
};
window.deleteRider = function(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المندوب؟')) return;
    state.riders = state.riders.filter(r => r.id !== id);
    saveState();
    renderAll();
    showToast('تم حذف المندوب');
};

window.openExpenseModal = function() {
    document.getElementById('exp-date').value = getTodayStr();
    document.getElementById('expense-modal').classList.remove('hidden');
    document.getElementById('expense-modal').classList.add('flex');
};
window.closeExpenseModal = function() {
    document.getElementById('expense-modal').classList.add('hidden');
    document.getElementById('expense-modal').classList.remove('flex');
};
window.handleAddExpense = function(e) {
    e.preventDefault();
    state.expenses.push({
        id: 'exp_' + Date.now(),
        title: document.getElementById('exp-title').value.trim(),
        amount: Number(document.getElementById('exp-amount').value),
        dateStr: document.getElementById('exp-date').value,
        category: document.getElementById('exp-category').value
    });
    saveState();
    e.target.reset();
    closeExpenseModal();
    renderAccounting();
    showToast('تم تسجيل المصروف بنجاح');
};
window.deleteExpense = function(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المصروف؟')) return;
    state.expenses = state.expenses.filter(e => e.id !== id);
    saveState();
    renderAccounting();
    showToast('تم حذف المصروف');
};

// --- EXPORT CSV ---
window.exportMonthlyCSV = function() {
    const selectedMonth = document.getElementById('report-month-picker').value || getCurrentMonthStr();
    const monthOrders = state.orders.filter(o => o.dateStr && o.dateStr.startsWith(selectedMonth));

    let csv = '\uFEFF';
    csv += 'التاريخ,رقم الطلب,المتجر,العميل,الهاتف,العنوان,المندوب,وقت الطلب,وقت الاستلام من المتجر,وقت التسليم,مدة الانتظار (دقيقة),مدة الطريق (دقيقة),إجمالي المدة (دقيقة),قيمة الطلب,رسوم التوصيل,الحالة\n';

    monthOrders.forEach(o => {
        const rider = state.riders.find(r => r.id === o.riderId) || { name: '-' };
        const wait = o.pickedUpAt ? diffMinutes(o.createdAt, o.pickedUpAt) : 0;
        const road = (o.pickedUpAt && o.deliveredAt) ? diffMinutes(o.pickedUpAt, o.deliveredAt) : 0;
        const total = o.deliveredAt ? diffMinutes(o.createdAt, o.deliveredAt) : 0;
        const statusAr = o.status === 'delivered' ? 'مكتمل' : 'قيد التنفيذ';

        csv += `"${o.dateStr}","#${o.number}","${o.vendor}","${o.customerName}","${o.customerPhone}","${o.address}","${rider.name}","${formatTime(o.createdAt)}","${formatTime(o.pickedUpAt)}","${formatTime(o.deliveredAt)}","${wait}","${road}","${total}","${o.orderValue}","${o.deliveryFee}","${statusAr}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Wassal_Report_${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم تصدير ملف التقرير الشهري بنجاح');
};

// --- INIT ---
document.getElementById('report-month-picker').value = getCurrentMonthStr();
renderAll();

setInterval(() => {
    if (currentTab === 'dispatch') renderDispatch();
    if (activeDrawerOrderId) renderOrderDrawer(activeDrawerOrderId);
}, 30000);