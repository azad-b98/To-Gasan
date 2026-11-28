// =========================================================================
// KONFIGURASI SUPABASE (MASUKKAN URL & ANON KEY PROJEK SUPABASE ANDA DI SINI)
// =========================================================================
const SUPABASE_URL = 'https://yrwilrsvhqkowpbyhheo.supabase.co';

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlyd2lscnN2aHFrb3dwYnloaGVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NjE1OTUsImV4cCI6MjExMTAzNzU5NX0.JypvmlE1j-NuN1M6kv4_cYeYjvWyvqUTj_iRL0in7IQ';

// --- KONFIGURASI AKSES SIGN IN ---
const ACCESS_PASSWORD = 'adm1';
const AUTH_SESSION_KEY = 'togasan_signed_in';

// --- PEMBOLEHUBAH GLOBAL & KEADAAN (STATE) ---
let workOrders = [];
let isSignedIn = sessionStorage.getItem(AUTH_SESSION_KEY) === 'true';
let pendingAuthAction = null;
let currentStatusFilter = 'Semua';
let supabaseClient = null;
let isSupabaseConnected = false;

// Rujukan Carta Chart.js
let statusDonutChart = null;
let typeBarChart = null;

// --- INISIALISASI APLIKASI ---
window.addEventListener('DOMContentLoaded', async () => {
    if (window.lucide) {
        lucide.createIcons();
    }
    updateAuthUI();
    resetBlockLevelList('registerBlockLevelList', [{ block: '', level: '' }]);
    setWorkType('Layout');
    initCharts();
    await initDatabaseConnection();
    await loadWorkOrders();
    if (isSupabaseConnected) {
        subscribeToRealtimeChanges();
    }
});

function subscribeToRealtimeChanges() {
    if (!supabaseClient) return;

    supabaseClient
        .channel('work-orders-live')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'work_orders' },
            async () => {
                await loadWorkOrders();
            }
        )
        .subscribe((status) => {
            console.log('Supabase Realtime status:', status);
        });
}

// --- PENGURUSAN SAMBUNGAN SUPABASE ---
async function initDatabaseConnection() {
    const url = SUPABASE_URL.trim();
    const key = SUPABASE_ANON_KEY.trim();

    if (url && key && window.supabase) {
        try {
            supabaseClient = window.supabase.createClient(url, key);
            const { error } = await supabaseClient.from('work_orders').select('id').limit(1);
            if (error) throw error;
            isSupabaseConnected = true;
        } catch (err) {
            console.warn('Supabase is not active, use local storage:', err.message);
            isSupabaseConnected = false;
        }
    } else {
        isSupabaseConnected = false;
    }
}

// --- PENGURUSAN SENARAI DINAMIK BLOK & NO/TINGKAT ---
function createBlockLevelRowHTML(pair = { block: '', level: '' }, isRequired = true, showRemove = false) {
    const reqAttr = isRequired ? 'required' : '';
    const removeBtn = showRemove
        ? `<button type="button" onclick="removeBlockLevelRow(this)" title="Buang baris" class="px-2.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold transition cursor-pointer shrink-0">
               <i class="fa-solid fa-xmark"></i>
           </button>`
        : '';

    return `
        <div class="block-level-row flex items-start gap-2">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-grow">
                <input type="text" data-field="block" ${reqAttr} value="${escapeHTML(pair.block || '')}" placeholder="Blok" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-sm font-medium outline-none transition">
                <input type="text" data-field="level" ${reqAttr} value="${escapeHTML(pair.level || '')}" placeholder="No/Tingkat" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-sm font-medium outline-none transition">
            </div>
            ${removeBtn}
        </div>
    `;
}

function resetBlockLevelList(containerId, pairs = [{ block: '', level: '' }], isRequired = true) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const safePairs = Array.isArray(pairs) && pairs.length > 0 ? pairs : [{ block: '', level: '' }];
    container.innerHTML = safePairs.map((pair, index) =>
        createBlockLevelRowHTML(pair, isRequired, index > 0)
    ).join('');
}

function addBlockLevelRow(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const isRequired = containerId === 'registerBlockLevelList'
        ? document.getElementById('workTypeInput')?.value === 'Layout'
        : document.getElementById('editWorkType')?.value === 'Layout';

    const wrapper = document.createElement('div');
    wrapper.innerHTML = createBlockLevelRowHTML({ block: '', level: '' }, isRequired, true);
    container.appendChild(wrapper.firstElementChild);
}

function removeBlockLevelRow(btn) {
    const row = btn.closest('.block-level-row');
    if (row) row.remove();
}

function setBlockLevelRequired(containerId, required) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('input[data-field]').forEach(input => {
        input.required = required;
    });
}

function collectBlockLevelPairs(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const pairs = [];
    container.querySelectorAll('.block-level-row').forEach(row => {
        const block = row.querySelector('input[data-field="block"]')?.value.trim() || '';
        const level = row.querySelector('input[data-field="level"]')?.value.trim() || '';
        if (block || level) {
            pairs.push({ block, level });
        }
    });
    return pairs;
}

function parseBlockLevelPairs(item) {
    if (!item) return [];

    // Cuba parse jika `block` disimpan sebagai JSON array
    if (typeof item.block === 'string' && item.block.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(item.block);
            if (Array.isArray(parsed)) {
                return parsed
                    .map(p => ({
                        block: String(p.block || '').trim(),
                        level: String(p.level || '').trim()
                    }))
                    .filter(p => p.block || p.level);
            }
        } catch (_) {
            // Abaikan jika bukan JSON sah
        }
    }

    const blocks = String(item.block || '').split('\n').map(s => s.trim()).filter(Boolean);
    const levels = String(item.level || '').split('\n').map(s => s.trim()).filter(Boolean);
    const maxLen = Math.max(blocks.length, levels.length);
    const result = [];

    for (let i = 0; i < maxLen; i++) {
        result.push({
            block: blocks[i] || '',
            level: levels[i] || ''
        });
    }
    return result;
}

function serializeBlockLevelPairs(pairs) {
    const cleaned = (pairs || [])
        .map(p => ({
            block: String(p.block || '').trim(),
            level: String(p.level || '').trim()
        }))
        .filter(p => p.block || p.level);

    if (cleaned.length === 0) {
        return { block: null, level: null };
    }

    if (cleaned.length === 1) {
        return {
            block: cleaned[0].block || null,
            level: cleaned[0].level || null
        };
    }

    return {
        block: JSON.stringify(cleaned),
        level: cleaned.map(p => p.level || '-').join('\n')
    };
}

function renderStackedBlockLevelHTML(item, badgeStyle = 'bg-indigo-50 text-indigo-700') {
    const pairs = parseBlockLevelPairs(item);
    if (pairs.length === 0) {
        return `<span class="inline-block px-2.5 py-1 rounded-lg ${badgeStyle} text-xs font-bold">Blok: - &bull; No/Aras: -</span>`;
    }

    return `
        <div class="flex flex-col gap-1.5 mt-1.5">
            ${pairs.map(p => `
                <div class="inline-flex flex-wrap items-center gap-1.5 px-2.5 py-1 rounded-lg ${badgeStyle} text-xs font-bold w-fit">
                    <span>Blok: ${escapeHTML(p.block || '-')}</span>
                    <span class="opacity-50">&bull;</span>
                    <span>No/Aras: ${escapeHTML(p.level || '-')}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function formatBlockLevelPlainText(item) {
    const pairs = parseBlockLevelPairs(item);
    if (pairs.length === 0) return '-';
    return pairs.map(p => `${p.block || '-'} (${p.level || '-'})`).join(' | ');
}

// --- KAWALAN MODAL DAFTAR ARAHAN KERJA (PERLU SIGN IN) ---
function openRegisterModal() {
    requireAuth(() => {
        const modal = document.getElementById('registerModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => document.getElementById('inputLocation').focus(), 100);
    }, 'Sign In diperlukan untuk mendaftar arahan kerja baru');
}

function closeRegisterModal() {
    const modal = document.getElementById('registerModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// --- OPERASI CRUD DATA ---
async function loadWorkOrders() {
    if (isSupabaseConnected && supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('work_orders')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            workOrders = data || [];
        } catch (err) {
            workOrders = [];
        }
    } else {
        workOrders = [];
    }
    refreshAllUI();
}

// Tambah Arahan Kerja Baru
async function handleCreateWorkOrder(e) {
    e.preventDefault();
    if (!isSignedIn) {
        openAuthModal(() => handleCreateWorkOrder(e), 'Sila Sign In dahulu sebelum menyimpan data');
        return;
    }

    const btn = document.getElementById('submitWorkBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Menyimpan...</span>';

    const workType = document.getElementById('workTypeInput').value;
    const location = document.getElementById('inputLocation').value.trim();
    const jobCategory = document.getElementById('inputJobCategory').value.trim();
    const picName = document.getElementById('inputPicName').value.trim();
    const orderNote = document.getElementById('inputOrderNote').value.trim() || null;

    let block = null;
    let level = null;
    if (workType === 'Layout') {
        const pairs = collectBlockLevelPairs('registerBlockLevelList');
        const serialized = serializeBlockLevelPairs(pairs);
        block = serialized.block;
        level = serialized.level;
    }

    const newRecord = {
        work_type: workType,
        location: location,
        block: block,
        level: level,
        job_category: jobCategory,
        pic_name: picName,
        order_note: orderNote,
        status: 'Dalam Proses',
        completion_note: null,
        created_at: new Date().toISOString(),
        completed_at: null
    };

    try {
        if (isSupabaseConnected && supabaseClient) {
            const { data, error } = await supabaseClient
                .from('work_orders')
                .insert([newRecord])
                .select();
            if (error) throw error;
            if (data && data.length > 0) {
                workOrders.unshift(data[0]);
            }
        } else {
            newRecord.id = 'TG-' + Math.floor(1000 + Math.random() * 9000);
            workOrders.unshift(newRecord);
        }

        document.getElementById('workOrderForm').reset();
        resetBlockLevelList('registerBlockLevelList', [{ block: '', level: '' }]);
        setWorkType(workType);
        closeRegisterModal();
        refreshAllUI();
        showToast(`Arahan kerja (${workType}) berjaya didaftarkan!`, 'success');
    } catch (err) {
        showToast('Gagal menyimpan rekod: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Simpan</span>';
    }
}

// Buka Modal Edit (Perlu Sign In)
function openEditModal(id) {
    requireAuth(() => {
        const item = workOrders.find(w => String(w.id) === String(id));
        if (!item) return;

        document.getElementById('editWorkOrderId').value = item.id;
        document.getElementById('editWorkType').value = item.work_type || 'Layout';
        document.getElementById('editStatus').value = item.status || 'Dalam Proses';
        document.getElementById('editLocation').value = item.location || '';
        document.getElementById('editJobCategory').value = item.job_category || '';
        document.getElementById('editPicName').value = item.pic_name || '';
        document.getElementById('editOrderNote').value = item.order_note || '';
        document.getElementById('editCompletionNote').value = item.completion_note || '';

        const pairs = parseBlockLevelPairs(item);
        resetBlockLevelList(
            'editBlockLevelList',
            pairs.length > 0 ? pairs : [{ block: '', level: '' }],
            (item.work_type || 'Layout') === 'Layout'
        );
        toggleEditLayoutFields();

        const modal = document.getElementById('editModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => document.getElementById('editLocation').focus(), 100);
    }, 'Sign In diperlukan untuk mengedit rekod arahan kerja');
}

function closeEditModal() {
    const modal = document.getElementById('editModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function toggleEditLayoutFields() {
    const type = document.getElementById('editWorkType').value;
    const layoutSection = document.getElementById('editLayoutFields');
    if (type === 'Layout') {
        layoutSection.classList.remove('hidden');
        setBlockLevelRequired('editBlockLevelList', true);
    } else {
        layoutSection.classList.add('hidden');
        setBlockLevelRequired('editBlockLevelList', false);
    }
}

// Simpan Perubahan Edit ke Supabase & UI
async function handleUpdateWorkOrder(e) {
    e.preventDefault();
    if (!isSignedIn) {
        openAuthModal(() => handleUpdateWorkOrder(e), 'Sign In diperlukan untuk menyimpan perubahan');
        return;
    }

    const btn = document.getElementById('saveEditWorkBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Menyimpan...</span>';

    const id = document.getElementById('editWorkOrderId').value;
    const existing = workOrders.find(w => String(w.id) === String(id));
    const workType = document.getElementById('editWorkType').value;
    const status = document.getElementById('editStatus').value;
    const location = document.getElementById('editLocation').value.trim();
    const jobCategory = document.getElementById('editJobCategory').value.trim();
    const picName = document.getElementById('editPicName').value.trim();
    const orderNote = document.getElementById('editOrderNote').value.trim() || null;
    const completionNote = document.getElementById('editCompletionNote').value.trim() || null;

    let block = null;
    let level = null;
    if (workType === 'Layout') {
        const pairs = collectBlockLevelPairs('editBlockLevelList');
        const serialized = serializeBlockLevelPairs(pairs);
        block = serialized.block;
        level = serialized.level;
    }

    const completedAt = status === 'Selesai'
        ? (existing?.completed_at || new Date().toISOString())
        : null;

    const updatedFields = {
        work_type: workType,
        status: status,
        location: location,
        block: block,
        level: level,
        job_category: jobCategory,
        pic_name: picName,
        order_note: orderNote,
        completion_note: completionNote,
        completed_at: completedAt
    };

    try {
        if (isSupabaseConnected && supabaseClient) {
            const { error } = await supabaseClient
                .from('work_orders')
                .update(updatedFields)
                .eq('id', id);
            if (error) throw error;
        }

        const idx = workOrders.findIndex(item => String(item.id) === String(id));
        if (idx !== -1) {
            workOrders[idx] = { ...workOrders[idx], ...updatedFields };
        }

        closeEditModal();
        refreshAllUI();
        showToast('Rekod arahan kerja berjaya dikemas kini!', 'success');
    } catch (err) {
        showToast('Gagal mengemas kini rekod: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span>Simpan Perubahan</span>';
    }
}

// Sahkan Kerja Selesai + Nota + Tarikh/Masa Siap Automatik
async function confirmCompleteWorkOrder(e) {
    e.preventDefault();
    if (!isSignedIn) {
        openAuthModal(null, 'Sign In diperlukan untuk mengesahkan kerja selesai');
        return;
    }

    const id = document.getElementById('completeWorkOrderId').value;
    const note = document.getElementById('completionNoteInput').value.trim();
    const completedAt = new Date().toISOString();

    try {
        if (isSupabaseConnected && supabaseClient) {
            const { error } = await supabaseClient
                .from('work_orders')
                .update({
                    status: 'Selesai',
                    completion_note: note,
                    completed_at: completedAt
                })
                .eq('id', id);
            if (error) throw error;
        }

        const idx = workOrders.findIndex(item => String(item.id) === String(id));
        if (idx !== -1) {
            workOrders[idx].status = 'Selesai';
            workOrders[idx].completion_note = note;
            workOrders[idx].completed_at = completedAt;
        }

        closeCompleteModal();
        refreshAllUI();
        showToast('Status kerja dikemaskini kepada SELESAI!', 'success');
    } catch (err) {
        showToast('Ralat mengemaskini status: ' + err.message, 'error');
    }
}

// Padam Rekod (Perlu Sign In)
async function executeDeleteWorkOrder() {
    const id = document.getElementById('deleteTargetId').value;
    if (!isSignedIn) {
        showToast('Akses ditolak! Sila Sign In dahulu.', 'error');
        return;
    }

    try {
        if (isSupabaseConnected && supabaseClient) {
            const { error } = await supabaseClient
                .from('work_orders')
                .delete()
                .eq('id', id);
            if (error) throw error;
        }

        workOrders = workOrders.filter(item => String(item.id) !== String(id));

        closeDeleteModal();
        refreshAllUI();
        showToast('Rekod arahan kerja telah berjaya dipadam.', 'info');
    } catch (err) {
        showToast('Gagal memadam rekod: ' + err.message, 'error');
    }
}

// --- BORANG DINAMIK: LAYOUT VS DETAIL ---
function setWorkType(type) {
    document.getElementById('workTypeInput').value = type;
    const layoutFields = document.getElementById('layoutOnlyFields');
    const btnLayout = document.getElementById('btnTypeLayout');
    const btnDetail = document.getElementById('btnTypeDetail');
    const iconBoxDetail = document.getElementById('iconBoxDetail');

    if (type === 'Layout') {
        layoutFields.classList.remove('hidden');
        setBlockLevelRequired('registerBlockLevelList', true);

        btnLayout.className = 'work-type-btn relative flex flex-col items-center justify-center p-3.5 rounded-2xl border-2 border-indigo-600 bg-indigo-50/80 text-indigo-700 font-bold transition-all cursor-pointer shadow-sm';
        btnLayout.querySelector('div').className = 'w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center mb-1.5 shadow-sm';

        btnDetail.className = 'work-type-btn relative flex flex-col items-center justify-center p-3.5 rounded-2xl border-2 border-slate-200 bg-white text-slate-600 hover:border-pink-300 hover:bg-pink-50/40 font-bold transition-all cursor-pointer';
        iconBoxDetail.className = 'w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mb-1.5 transition-colors';
    } else {
        layoutFields.classList.add('hidden');
        setBlockLevelRequired('registerBlockLevelList', false);

        btnDetail.className = 'work-type-btn relative flex flex-col items-center justify-center p-3.5 rounded-2xl border-2 border-pink-600 bg-pink-50/80 text-pink-700 font-bold transition-all cursor-pointer shadow-sm';
        iconBoxDetail.className = 'w-9 h-9 rounded-xl bg-pink-600 text-white flex items-center justify-center mb-1.5 shadow-sm';

        btnLayout.className = 'work-type-btn relative flex flex-col items-center justify-center p-3.5 rounded-2xl border-2 border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/40 font-bold transition-all cursor-pointer';
        btnLayout.querySelector('div').className = 'w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mb-1.5 transition-colors';
    }
}

// --- NAVIGASI TAB ---
function switchTab(tabName) {
    const secDashboard = document.getElementById('section-dashboard');
    const secList = document.getElementById('section-list');
    const navDashboard = document.getElementById('nav-dashboard');
    const navList = document.getElementById('nav-list');

    if (tabName === 'dashboard') {
        secDashboard.classList.remove('hidden');
        secList.classList.add('hidden');
        navDashboard.className = 'nav-tab inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap bg-indigo-600 text-white shadow-md shadow-indigo-200 cursor-pointer';
        navList.className = 'nav-tab inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 cursor-pointer';
        updateCharts();
    } else {
        secDashboard.classList.add('hidden');
        secList.classList.remove('hidden');
        navList.className = 'nav-tab inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap bg-indigo-600 text-white shadow-md shadow-indigo-200 cursor-pointer';
        navDashboard.className = 'nav-tab inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 cursor-pointer';
        renderWorkOrdersList();
    }
}

// --- PENGEMASKINIAN UI, KPI & CARTA ANALISIS ---
function refreshAllUI() {
    const total = workOrders.length;
    const completed = workOrders.filter(w => w.status === 'Selesai').length;
    const inProgress = total - completed;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    document.getElementById('kpiTotal').textContent = total;
    document.getElementById('kpiCompleted').textContent = completed;
    document.getElementById('kpiInProgress').textContent = inProgress;
    document.getElementById('kpiPercentage').textContent = `${percentage}%`;
    document.getElementById('kpiProgressBar').style.width = `${percentage}%`;
    document.getElementById('donutCenterPercent').textContent = `${percentage}%`;
    document.getElementById('navBadgeTotal').textContent = total;

    document.getElementById('count-Semua').textContent = total;
    document.getElementById('count-Dalam Proses').textContent = inProgress;
    document.getElementById('count-Selesai').textContent = completed;

    renderRecentOrders();
    renderWorkOrdersList();
    updateCharts();
}

function initCharts() {
    const ctxDonut = document.getElementById('statusDonutChart').getContext('2d');
    statusDonutChart = new Chart(ctxDonut, {
        type: 'doughnut',
        data: {
            labels: ['Selesai', 'Dalam Proses'],
            datasets: [{
                data: [0, 0],
                backgroundColor: ['#10b981', '#f59e0b'],
                borderColor: '#ffffff',
                borderWidth: 3,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 16,
                        font: { family: 'Inter', size: 11, weight: '600' }
                    }
                }
            }
        }
    });

    const ctxBar = document.getElementById('typeBarChart').getContext('2d');
    typeBarChart = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['Layout', 'Detail'],
            datasets: [
                {
                    label: 'Dah Siap',
                    data: [0, 0],
                    backgroundColor: '#10b981',
                    borderRadius: 8,
                    barThickness: 28
                },
                {
                    label: 'Dalam Proses',
                    data: [0, 0],
                    backgroundColor: '#6366f1',
                    borderRadius: 8,
                    barThickness: 28
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Inter', size: 12, weight: '700' } }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        font: { family: 'Inter', size: 11 }
                    },
                    grid: { color: '#f1f5f9' }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 14,
                        font: { family: 'Inter', size: 11, weight: '600' }
                    }
                }
            }
        }
    });
}

function updateCharts() {
    if (!statusDonutChart || !typeBarChart) return;

    const completed = workOrders.filter(w => w.status === 'Selesai').length;
    const inProgress = workOrders.length - completed;

    statusDonutChart.data.datasets[0].data = [completed, inProgress];
    statusDonutChart.update();

    const layoutDone = workOrders.filter(w => w.work_type === 'Layout' && w.status === 'Selesai').length;
    const layoutPending = workOrders.filter(w => w.work_type === 'Layout' && w.status !== 'Selesai').length;
    const detailDone = workOrders.filter(w => w.work_type === 'Detail' && w.status === 'Selesai').length;
    const detailPending = workOrders.filter(w => w.work_type === 'Detail' && w.status !== 'Selesai').length;

    typeBarChart.data.datasets[0].data = [layoutDone, detailDone];
    typeBarChart.data.datasets[1].data = [layoutPending, detailPending];
    typeBarChart.update();
}

function renderRecentOrders() {
    const container = document.getElementById('recentOrdersContainer');
    const recent = workOrders.slice(0, 4);

    if (recent.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 text-center py-8">Belum ada arahan kerja didaftarkan.</p>`;
        return;
    }

    container.innerHTML = recent.map(item => {
        const isDone = item.status === 'Selesai';
        const typeBadge = item.work_type === 'Layout'
            ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
            : 'bg-pink-100 text-pink-700 border-pink-200';
        const statusBadge = isDone
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-amber-100 text-amber-700';

        const hasOrderNote = !isDone && item.order_note && String(item.order_note).trim() !== '';

        return `
            <div class="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-white hover:border-indigo-200 hover:shadow-sm transition flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="px-2 py-0.5 text-[10px] font-extrabold rounded-md border ${typeBadge}">${escapeHTML(item.work_type)}</span>
                        <span class="text-[11px] text-slate-400 font-medium truncate">${formatDateTime(item.created_at)}</span>
                    </div>
                    <p class="text-xs font-bold text-slate-800 truncate">${escapeHTML(item.job_category)}</p>
                    <p class="text-[11px] text-slate-500 truncate mt-0.5">
                        <i class="fa-solid fa-location-dot text-rose-400 mr-1"></i>${escapeHTML(item.location)} &bull; PIC: <span class="font-semibold text-slate-700">${escapeHTML(item.pic_name)}</span>
                    </p>
                    ${hasOrderNote ? `
                        <p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg px-2 py-1 mt-1.5">
                            <span class="font-bold">Nota:</span> ${escapeHTML(item.order_note)}
                        </p>
                    ` : ''}
                </div>
                <div class="shrink-0 flex flex-col items-end gap-1.5">
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold ${statusBadge}">
                        ${isDone ? 'Selesai' : 'Dalam Proses'}
                    </span>
                    ${!isDone ? `
                        <button onclick="openCompleteModal('${item.id}')" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold transition cursor-pointer">
                            Selesai
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// --- PENAPIS & PAPARAN SENARAI KERJA PENUH ---
function setStatusFilter(status) {
    currentStatusFilter = status;
    ['Semua', 'Dalam Proses', 'Selesai'].forEach(st => {
        const btn = document.getElementById(`filter-${st}`);
        if (st === status) {
            btn.className = 'status-filter-btn px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-sm transition cursor-pointer';
        } else if (st === 'Dalam Proses') {
            btn.className = 'status-filter-btn px-4 py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition cursor-pointer';
        } else if (st === 'Selesai') {
            btn.className = 'status-filter-btn px-4 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer';
        } else {
            btn.className = 'status-filter-btn px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer';
        }
    });
    renderWorkOrdersList();
}

function renderWorkOrdersList() {
    const searchQuery = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const typeFilter = document.getElementById('typeFilterSelect')?.value || 'Semua';

    const filtered = workOrders.filter(item => {
        const matchStatus = currentStatusFilter === 'Semua' || item.status === currentStatusFilter;
        const matchType = typeFilter === 'Semua' || item.work_type === typeFilter;
        const matchSearch = !searchQuery || [
            item.location,
            item.block,
            item.level,
            item.job_category,
            item.pic_name,
            item.order_note,
            item.completion_note
        ].some(val => val && String(val).toLowerCase().includes(searchQuery));

        return matchStatus && matchType && matchSearch;
    });

    const desktopBody = document.getElementById('desktopTableBody');
    const mobileContainer = document.getElementById('mobileCardsContainer');
    const emptyState = document.getElementById('emptyStateContainer');

    if (filtered.length === 0) {
        desktopBody.innerHTML = '';
        mobileContainer.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    // 1. Render Jadual Desktop
    desktopBody.innerHTML = filtered.map(item => {
        const isDone = item.status === 'Selesai';
        const typeBadge = item.work_type === 'Layout'
            ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
            : 'bg-pink-100 text-pink-700 border-pink-200';

        const locationExtra = item.work_type === 'Layout'
            ? renderStackedBlockLevelHTML(item, 'bg-slate-100 text-slate-700')
            : `<span class="inline-block text-[11px] text-slate-400 italic mt-0.5">Detail (Tanpa Blok/Aras)</span>`;

        const hasOrderNote = !isDone && item.order_note && String(item.order_note).trim() !== '';

        return `
            <tr class="hover:bg-indigo-50/30 transition">
                <td class="py-4 px-5 align-top">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold border ${typeBadge}">
                        <i class="fa-solid ${item.work_type === 'Layout' ? 'fa-map-location-dot' : 'fa-magnifying-glass-chart'}"></i>
                        ${escapeHTML(item.work_type)}
                    </span>
                    <div class="text-[11px] text-slate-500 mt-1.5 font-medium">
                        <i class="fa-regular fa-clock mr-1 text-slate-400"></i>${formatDateTime(item.created_at)}
                    </div>
                </td>
                <td class="py-4 px-5 align-top">
                    <div class="font-bold text-slate-800 text-sm">${escapeHTML(item.location)}</div>
                    ${locationExtra}
                </td>
                <td class="py-4 px-5 align-top">
                    <div class="font-semibold text-slate-800">${escapeHTML(item.job_category)}</div>
                </td>
                <td class="py-4 px-5 align-top">
                    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                        <i class="fa-solid fa-user-tie text-indigo-500"></i>
                        ${escapeHTML(item.pic_name)}
                    </div>
                </td>
                <td class="py-4 px-5 align-top max-w-xs">
                    ${isDone ? `
                        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-700">
                            <i class="fa-solid fa-circle-check"></i> Selesai
                        </span>
                        <div class="mt-1.5 p-2 rounded-xl bg-emerald-50/70 border border-emerald-100 text-xs text-slate-700">
                            <span class="font-bold text-emerald-800">Nota:</span> ${escapeHTML(item.completion_note || '-')}
                            <div class="text-[10px] text-emerald-600 mt-1 font-medium">Siap pada: ${formatDateTime(item.completed_at)}</div>
                        </div>
                    ` : `
                        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-700">
                            <i class="fa-solid fa-spinner fa-spin"></i> Dalam Proses
                        </span>
                        ${hasOrderNote ? `
                            <div class="mt-1.5 p-2 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-slate-700">
                                <span class="font-bold text-amber-800">Nota:</span> ${escapeHTML(item.order_note)}
                            </div>
                        ` : ''}
                    `}
                </td>
                <td class="py-4 px-5 align-top text-right whitespace-nowrap">
                    <div class="inline-flex items-center gap-1.5">
                        ${!isDone ? `
                            <button onclick="openCompleteModal('${item.id}')" class="px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-bold shadow-sm transition inline-flex items-center gap-1 cursor-pointer">
                                <i class="fa-solid fa-check"></i> Selesai
                            </button>
                        ` : ''}
                        <button onclick="openEditModal('${item.id}')" title="Edit Rekod" class="px-2.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-500 text-amber-700 hover:text-white text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer">
                            <i class="fa-solid fa-pen-to-square"></i> Edit
                        </button>
                        ${isSignedIn ? `
                            <button onclick="openDeleteModal('${item.id}')" title="Padam Rekod" class="p-2 rounded-xl bg-rose-100 hover:bg-rose-600 text-rose-600 hover:text-white transition cursor-pointer">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // 2. Render Kad Responsif (Mobile & Tablet)
    mobileContainer.innerHTML = filtered.map(item => {
        const isDone = item.status === 'Selesai';
        const typeBadge = item.work_type === 'Layout'
            ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
            : 'bg-pink-100 text-pink-700 border-pink-200';

        const hasOrderNote = !isDone && item.order_note && String(item.order_note).trim() !== '';

        return `
            <div class="bg-white rounded-3xl border border-slate-200/80 shadow-md p-5 flex flex-col justify-between space-y-4">
                <div>
                    <div class="flex items-center justify-between gap-2 mb-3">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold border ${typeBadge}">
                            ${escapeHTML(item.work_type)}
                        </span>
                        ${isDone ? `
                            <span class="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-700">
                                <i class="fa-solid fa-circle-check mr-1"></i>Selesai
                            </span>
                        ` : `
                            <span class="px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-700">
                                <i class="fa-solid fa-clock mr-1"></i>Dalam Proses
                            </span>
                        `}
                    </div>

                    <h4 class="font-display font-bold text-base text-slate-800">${escapeHTML(item.job_category)}</h4>
                    <p class="text-xs text-slate-600 mt-1.5 flex items-start gap-1.5">
                        <i class="fa-solid fa-location-dot text-rose-500 mt-0.5"></i>
                        <span>${escapeHTML(item.location)}</span>
                    </p>

                    ${item.work_type === 'Layout' ? renderStackedBlockLevelHTML(item, 'bg-indigo-50 text-indigo-700') : ''}

                    ${hasOrderNote ? `
                        <div class="mt-3 p-3 rounded-2xl bg-amber-50 border border-amber-200/80 text-xs text-slate-700">
                            <p class="font-bold text-amber-800 mb-0.5">Nota:</p>
                            <p>${escapeHTML(item.order_note)}</p>
                        </div>
                    ` : ''}

                    <div class="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span class="font-bold text-slate-700"><i class="fa-solid fa-user-tie text-indigo-500 mr-1"></i>${escapeHTML(item.pic_name)}</span>
                        <span>${formatDateTime(item.created_at)}</span>
                    </div>

                    ${isDone ? `
                        <div class="mt-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-100 text-xs text-slate-700">
                            <p class="font-bold text-emerald-800 mb-0.5">Nota Selesai:</p>
                            <p>${escapeHTML(item.completion_note || '-')}</p>
                            <p class="text-[10px] text-emerald-600 mt-1 font-semibold">Disahkan: ${formatDateTime(item.completed_at)}</p>
                        </div>
                    ` : ''}
                </div>

                <div class="flex flex-wrap items-center gap-2 pt-1">
                    ${!isDone ? `
                        <button onclick="openCompleteModal('${item.id}')" class="flex-1 py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 cursor-pointer">
                            <i class="fa-solid fa-check-double"></i> Tandakan Selesai
                        </button>
                    ` : ''}
                    <button onclick="openEditModal('${item.id}')" class="py-2.5 px-3.5 rounded-xl bg-amber-100 hover:bg-amber-500 text-amber-800 hover:text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer">
                        <i class="fa-solid fa-pen-to-square"></i> Edit
                    </button>
                    ${isSignedIn ? `
                        <button onclick="openDeleteModal('${item.id}')" class="py-2.5 px-3.5 rounded-xl bg-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white text-xs font-bold transition cursor-pointer">
                            <i class="fa-solid fa-trash-can"></i> Padam
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// --- KAWALAN MODAL SELESAI KERJA (PERLU SIGN IN) ---
function openCompleteModal(id) {
    requireAuth(() => {
        const item = workOrders.find(w => String(w.id) === String(id));
        if (!item) return;

        document.getElementById('completeWorkOrderId').value = item.id;
        document.getElementById('completionNoteInput').value = '';
        document.getElementById('completeOrderSummary').innerHTML = `
            <div class="font-bold text-slate-800">${escapeHTML(item.job_category)} (${escapeHTML(item.work_type)})</div>
            <div class="text-slate-500">Lokasi: ${escapeHTML(item.location)} &bull; PIC: ${escapeHTML(item.pic_name)}</div>
        `;

        const modal = document.getElementById('completeModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => document.getElementById('completionNoteInput').focus(), 100);
    }, 'Sign In diperlukan untuk menandakan kerja selesai');
}

function closeCompleteModal() {
    const modal = document.getElementById('completeModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// --- SISTEM SIGN IN / SIGN OUT (PASSWORD: adm1) ---
function updateAuthUI() {
    const btn = document.getElementById('authToggleBtn');
    const dot = document.getElementById('authStatusDot');
    const icon = document.getElementById('authIcon');
    const text = document.getElementById('authBtnText');

    if (!btn || !dot || !icon || !text) return;

    if (isSignedIn) {
        btn.className = 'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all active:scale-95 cursor-pointer';
        dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
        icon.className = 'fa-solid fa-right-from-bracket text-emerald-600';
        text.textContent = 'Sign Out';
    } else {
        btn.className = 'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-all active:scale-95 cursor-pointer';
        dot.className = 'w-2 h-2 rounded-full bg-slate-400';
        icon.className = 'fa-solid fa-right-to-bracket text-slate-500';
        text.textContent = 'Sign In';
    }
}

function handleAuthButtonClick() {
    if (isSignedIn) {
        signOutUser();
    } else {
        openAuthModal(null, 'Masukkan password untuk kemas kini data');
    }
}

function openAuthModal(actionCallback = null, subtitleText = 'Masukkan password untuk meneruskan tindakan ini') {
    pendingAuthAction = actionCallback;
    document.getElementById('signInPasswordInput').value = '';
    document.getElementById('authErrorMsg').classList.add('hidden');
    document.getElementById('authModalSubtitle').textContent = subtitleText;

    const modal = document.getElementById('authModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => document.getElementById('signInPasswordInput').focus(), 100);
}

function closeAuthModal() {
    pendingAuthAction = null;
    const modal = document.getElementById('authModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function verifySignInPassword(e) {
    e.preventDefault();
    const pwd = document.getElementById('signInPasswordInput').value;
    if (pwd === ACCESS_PASSWORD) {
        isSignedIn = true;
        sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
        const actionToRun = pendingAuthAction;
        closeAuthModal();
        updateAuthUI();
        renderWorkOrdersList();
        showToast('Berjaya Sign In! Anda kini boleh menggunakan semua fungsi.', 'success');

        if (typeof actionToRun === 'function') {
            actionToRun();
        }
    } else {
        document.getElementById('authErrorMsg').classList.remove('hidden');
    }
}

function signOutUser() {
    isSignedIn = false;
    pendingAuthAction = null;
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    updateAuthUI();
    renderWorkOrdersList();
    showToast('Anda telah Sign Out.', 'info');
}

function requireAuth(actionCallback, reasonMessage) {
    if (isSignedIn) {
        actionCallback();
    } else {
        openAuthModal(actionCallback, reasonMessage);
    }
}

function openDeleteModal(id) {
    requireAuth(() => {
        document.getElementById('deleteTargetId').value = id;
        const modal = document.getElementById('deleteConfirmModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }, 'Sign In diperlukan untuk memadam rekod');
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteConfirmModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// --- EXPORT KE FAIL EXCEL SEBENAR (.XLSX) (PERLU SIGN IN) ---
function exportToExcel() {
    requireAuth(() => {
        if (workOrders.length === 0) {
            showToast('Tiada data arahan kerja untuk dieksport ke Excel.', 'error');
            return;
        }

        try {
            const rows = workOrders.map((item, index) => ({
                'Bil': index + 1,
                'Jenis Arahan': item.work_type,
                'Lokasi': item.location || '-',
                'Blok & Tingkat': item.work_type === 'Layout' ? formatBlockLevelPlainText(item) : 'N/A',
                'Jenis Kerja': item.job_category || '-',
                'Nama PIC': item.pic_name || '-',
                'Status': item.status,
                'Nota Dalam Proses': item.order_note || '-',
                'Tarikh & Masa Masuk': formatDateTime(item.created_at),
                'Tarikh & Masa Siap': item.completed_at ? formatDateTime(item.completed_at) : '-',
                'Nota Selesai': item.completion_note || '-'
            }));

            const worksheet = XLSX.utils.json_to_sheet(rows);
            worksheet['!cols'] = [
                { wch: 6 },
                { wch: 15 },
                { wch: 24 },
                { wch: 30 },
                { wch: 28 },
                { wch: 20 },
                { wch: 15 },
                { wch: 28 },
                { wch: 22 },
                { wch: 22 },
                { wch: 38 }
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Senarai Arahan Kerja');

            const dateStr = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(workbook, `To-Gasan_Arahan_Kerja_${dateStr}.xlsx`);
            showToast('Fail Excel (.xlsx) berjaya dimuat turun!', 'success');
        } catch (err) {
            showToast('Gagal menjana fail Excel: ' + err.message, 'error');
        }
    }, 'Sign In diperlukan untuk mengeksport data ke Excel');
}

// --- UTILITI FORMAT TARIKH, KESELAMATAN XSS & NOTIFIKASI ---
function formatDateTime(isoString) {
    if (!isoString) return '-';
    try {
        const d = new Date(isoString);
        return d.toLocaleString('ms-MY', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } catch (e) {
        return isoString;
    }
}

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');

    const styles = {
        success: 'bg-emerald-600 text-white shadow-emerald-200',
        error: 'bg-rose-600 text-white shadow-rose-200',
        info: 'bg-slate-800 text-white shadow-slate-300'
    };
    const icons = {
        success: 'fa-circle-check',
        error: 'fa-circle-exclamation',
        info: 'fa-circle-info'
    };

    toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg text-xs font-bold fade-in ${styles[type] || styles.info}`;
    toast.innerHTML = `
        <i class="fa-solid ${icons[type] || icons.info} text-base shrink-0"></i>
        <span>${escapeHTML(message)}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(6px)';
        toast.style.transition = 'all 0.25s ease';
        setTimeout(() => toast.remove(), 250);
    }, 3500);
}