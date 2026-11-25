        // =========================================================================
        // KONFIGURASI SUPABASE (MASUKKAN URL & ANON KEY PROJEK SUPABASE ANDA DI SINI)
        // =========================================================================
        const SUPABASE_URL ='https://yrwilrsvhqkowpbyhheo.supabase.co';

        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlyd2lscnN2aHFrb3dwYnloaGVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NjE1OTUsImV4cCI6MjExMTAzNzU5NX0.JypvmlE1j-NuN1M6kv4_cYeYjvWyvqUTj_iRL0in7IQ';
        
        // --- PEMBOLEHUBAH GLOBAL & KEADAAN (STATE) ---
        let workOrders = [];
        let isAdminMode = false;
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
                        // Re-fetch latest rows whenever any device inserts, updates, or deletes
                        await loadWorkOrders();
                    }
                )
                .subscribe((status) => {
                    console.log('Supabase Realtime status:', status);
                });
        }

        // --- PENGURUSAN SAMBUNGAN SUPABASE & FALLBACK LOKAL AUTOMATIK ---
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

        // --- KAWALAN MODAL DAFTAR ARAHAN KERJA ---
        function openRegisterModal() {
            const modal = document.getElementById('registerModal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            setTimeout(() => document.getElementById('inputLocation').focus(), 100);
        }

        function closeRegisterModal() {
            const modal = document.getElementById('registerModal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        // --- OPERASI CRUD DATA (SUPABASE / LOCALSTORAGE) ---
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
            const btn = document.getElementById('submitWorkBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Menyimpan...</span>';

            const workType = document.getElementById('workTypeInput').value;
            const location = document.getElementById('inputLocation').value.trim();
            const block = workType === 'Layout' ? document.getElementById('inputBlock').value.trim() : null;
            const level = workType === 'Layout' ? document.getElementById('inputLevel').value.trim() : null;
            const jobCategory = document.getElementById('inputJobCategory').value.trim();
            const picName = document.getElementById('inputPicName').value.trim();

            const newRecord = {
                work_type: workType,
                location: location,
                block: block,
                level: level,
                job_category: jobCategory,
                pic_name: picName,
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

                // Reset borang, kekalkan jenis arahan semasa & tutup modal pendaftaran
                document.getElementById('workOrderForm').reset();
                setWorkType(workType);
                closeRegisterModal();
                refreshAllUI();
                showToast(`Arahan kerja (${workType}) berjaya didaftarkan!`, 'success');
            } catch (err) {
                showToast('Gagal menyimpan rekod: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Simpan Arahan Kerja</span>';
            }
        }

        // Sahkan Kerja Selesai + Nota + Tarikh/Masa Siap Automatik
        async function confirmCompleteWorkOrder(e) {
            e.preventDefault();
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
                    if (!isSupabaseConnected);
                }

                closeCompleteModal();
                refreshAllUI();
                showToast('Status kerja dikemaskini kepada SELESAI!', 'success');
            } catch (err) {
                showToast('Ralat mengemaskini status: ' + err.message, 'error');
            }
        }

        // Padam Rekod (Hanya Mod Admin)
        async function executeDeleteWorkOrder() {
            const id = document.getElementById('deleteTargetId').value;
            if (!isAdminMode) {
                showToast('Akses ditolak! Sila aktifkan Mod Admin.', 'error');
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
                if (!isSupabaseConnected);

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
            const inputBlock = document.getElementById('inputBlock');
            const inputLevel = document.getElementById('inputLevel');
            const btnLayout = document.getElementById('btnTypeLayout');
            const btnDetail = document.getElementById('btnTypeDetail');
            const iconBoxDetail = document.getElementById('iconBoxDetail');

            if (type === 'Layout') {
                layoutFields.classList.remove('hidden');
                inputBlock.required = true;
                inputLevel.required = true;

                btnLayout.className = 'work-type-btn relative flex flex-col items-center justify-center p-3.5 rounded-2xl border-2 border-indigo-600 bg-indigo-50/80 text-indigo-700 font-bold transition-all cursor-pointer shadow-sm';
                btnLayout.querySelector('div').className = 'w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center mb-1.5 shadow-sm';

                btnDetail.className = 'work-type-btn relative flex flex-col items-center justify-center p-3.5 rounded-2xl border-2 border-slate-200 bg-white text-slate-600 hover:border-pink-300 hover:bg-pink-50/40 font-bold transition-all cursor-pointer';
                iconBoxDetail.className = 'w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mb-1.5 transition-colors';
            } else {
                layoutFields.classList.add('hidden');
                inputBlock.required = false;
                inputLevel.required = false;
                inputBlock.value = '';
                inputLevel.value = '';

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

            // Kemaskini Kad KPI & Lencana
            document.getElementById('kpiTotal').textContent = total;
            document.getElementById('kpiCompleted').textContent = completed;
            document.getElementById('kpiInProgress').textContent = inProgress;
            document.getElementById('kpiPercentage').textContent = `${percentage}%`;
            document.getElementById('kpiProgressBar').style.width = `${percentage}%`;
            document.getElementById('donutCenterPercent').textContent = `${percentage}%`;
            document.getElementById('navBadgeTotal').textContent = total;

            // Kemaskini Kaunter Penapis
            document.getElementById('count-Semua').textContent = total;
            document.getElementById('count-Dalam Proses').textContent = inProgress;
            document.getElementById('count-Selesai').textContent = completed;

            renderRecentOrders();
            renderWorkOrdersList();
            updateCharts();
        }

        // Inisialisasi Carta Chart.js
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

        // Papar 3 Arahan Kerja Terkini di Dashboard
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

                return `
                    <div class="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-white hover:border-indigo-200 hover:shadow-sm transition flex items-center justify-between gap-3">
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="px-2 py-0.5 text-[10px] font-extrabold rounded-md border ${typeBadge}">${escapeHTML(item.work_type)}</span>
                                <span class="text-[11px] text-slate-400 font-medium truncate">${formatDateTime(item.created_at)}</span>
                            </div>
                            <p class="text-xs font-bold text-slate-800 truncate">${escapeHTML(item.job_category)}</p>
                            <p class="text-[11px] text-slate-500 truncate mt-0.5">
                                <i class="fa-solid fa-location-dot text-rose-400 mr-1"></i>${escapeHTML(item.location)} &bull; PIC: <span class="font-semibold text-slate-700">${escapeHTML(item.pic_name)}</span>
                            </p>
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
                    ? `<div class="text-xs text-slate-500 mt-1 flex items-center gap-2">
                         <span class="px-2 py-0.5 rounded bg-slate-100 font-semibold text-slate-600">Blok: ${escapeHTML(item.block || '-')}</span>
                         <span class="px-2 py-0.5 rounded bg-slate-100 font-semibold text-slate-600">No/Aras: ${escapeHTML(item.level || '-')}</span>
                       </div>`
                    : `<span class="inline-block text-[11px] text-slate-400 italic mt-0.5">Detail (Tanpa Blok/Aras)</span>`;

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
                            `}
                        </td>
                        <td class="py-4 px-5 align-top text-right whitespace-nowrap">
                            <div class="inline-flex items-center gap-2">
                                ${!isDone ? `
                                    <button onclick="openCompleteModal('${item.id}')" class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-300 from-emerald-200 hover:emerald-500 text-xs font-bold shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer">
                                        <i class="fa-solid fa-check"></i> Selesai
                                    </button>
                                ` : ''}
                                ${isAdminMode ? `
                                    <button onclick="openDeleteModal('${item.id}')" title="Padam Rekod (Admin)" class="p-2 rounded-xl bg-rose-100 hover:bg-rose-600 text-rose-600 hover:text-white transition cursor-pointer">
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

                            ${item.work_type === 'Layout' ? `
                                <div class="flex flex-wrap gap-2 mt-2.5">
                                    <span class="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold">Blok: ${escapeHTML(item.block || '-')}</span>
                                    <span class="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 text-xs font-bold">No/Aras: ${escapeHTML(item.level || '-')}</span>
                                </div>
                            ` : ''}

                            <div class="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                                <span class="font-bold text-slate-700"><i class="fa-solid fa-user-tie text-indigo-500 mr-1"></i>${escapeHTML(item.pic_name)}</span>
                                <span>${formatDateTime(item.created_at)}</span>
                            </div>

                            ${isDone ? `
                                <div class="mt-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-100 text-xs text-slate-700">
                                    <p class="font-bold text-emerald-800 mb-0.5">Nota Penyelesaian:</p>
                                    <p>${escapeHTML(item.completion_note || '-')}</p>
                                    <p class="text-[10px] text-emerald-600 mt-1 font-semibold">Disahkan: ${formatDateTime(item.completed_at)}</p>
                                </div>
                            ` : ''}
                        </div>

                        <div class="flex items-center gap-2 pt-1">
                            ${!isDone ? `
                                <button onclick="openCompleteModal('${item.id}')" class="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 cursor-pointer">
                                    <i class="fa-solid fa-check-double"></i> Tandakan Selesai
                                </button>
                            ` : ''}
                            ${isAdminMode ? `
                                <button onclick="openDeleteModal('${item.id}')" class="py-2.5 px-3.5 rounded-xl bg-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white text-xs font-bold transition cursor-pointer">
                                    <i class="fa-solid fa-trash-can"></i> Padam
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }

        // --- KAWALAN MODAL SELESAI KERJA ---
        function openCompleteModal(id) {
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
        }

        function closeCompleteModal() {
            const modal = document.getElementById('completeModal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        // --- MOD ADMIN (PASSWORD: adm1) ---
        function toggleAdminModal() {
            if (isAdminMode) {
                logoutAdmin();
                return;
            }
            document.getElementById('adminPasswordInput').value = '';
            document.getElementById('adminErrorMsg').classList.add('hidden');
            const modal = document.getElementById('adminModal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            setTimeout(() => document.getElementById('adminPasswordInput').focus(), 100);
        }

        function closeAdminModal() {
            const modal = document.getElementById('adminModal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        function verifyAdminPassword(e) {
            e.preventDefault();
            const pwd = document.getElementById('adminPasswordInput').value;
            if (pwd === 'adm1') {
                isAdminMode = true;
                closeAdminModal();
                updateAdminUIState();
                renderWorkOrdersList();
                showToast('Mod Admin berjaya diaktifkan! Anda boleh memadam data.', 'success');
            } else {
                document.getElementById('adminErrorMsg').classList.remove('hidden');
            }
        }

        function logoutAdmin() {
            isAdminMode = false;
            updateAdminUIState();
            renderWorkOrdersList();
            showToast('Mod Admin telah dinyahaktifkan.', 'info');
        }

        function updateAdminUIState() {
            const btn = document.getElementById('adminToggleBtn');
            const icon = document.getElementById('adminLockIcon');
            const text = document.getElementById('adminBtnText');
            const banner = document.getElementById('adminActiveBanner');

            if (isAdminMode) {
                btn.className = 'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-rose-600 text-white shadow-sm shadow-rose-200 transition-all cursor-pointer';
                icon.className = 'fa-solid fa-unlock-keyhole text-white';
                text.textContent = 'Admin Aktif';
                banner.classList.remove('hidden');
            } else {
                btn.className = 'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-all cursor-pointer';
                icon.className = 'fa-solid fa-lock text-slate-500';
                text.textContent = 'Mod Admin';
                banner.classList.add('hidden');
            }
        }

        function openDeleteModal(id) {
            document.getElementById('deleteTargetId').value = id;
            const modal = document.getElementById('deleteConfirmModal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }

        function closeDeleteModal() {
            const modal = document.getElementById('deleteConfirmModal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        // --- EXPORT KE FAIL EXCEL SEBENAR (.XLSX) ---
        function exportToExcel() {
            if (workOrders.length === 0) {
                showToast('Tiada data arahan kerja untuk dieksport ke Excel.', 'error');
                return;
            }

            try {
                const rows = workOrders.map((item, index) => ({
                    'Bil': index + 1,
                    'Jenis Arahan': item.work_type,
                    'Lokasi': item.location || '-',
                    'Blok': item.work_type === 'Layout' ? (item.block || '-') : 'N/A',
                    'Tingkat': item.work_type === 'Layout' ? (item.level || '-') : 'N/A',
                    'Jenis Kerja': item.job_category || '-',
                    'Nama PIC': item.pic_name || '-',
                    'Status': item.status,
                    'Tarikh & Masa Masuk': formatDateTime(item.created_at),
                    'Tarikh & Masa Siap': item.completed_at ? formatDateTime(item.completed_at) : '-',
                    'Nota Penyelesaian': item.completion_note || '-'
                }));

                const worksheet = XLSX.utils.json_to_sheet(rows);
                worksheet['!cols'] = [
                    { wch: 6 },  // Bil
                    { wch: 15 }, // Jenis Arahan
                    { wch: 28 }, // Lokasi
                    { wch: 14 }, // Blok
                    { wch: 14 }, // Tingkat
                    { wch: 32 }, // Jenis Kerja
                    { wch: 22 }, // Nama PIC
                    { wch: 15 }, // Status
                    { wch: 22 }, // Tarikh Masuk
                    { wch: 22 }, // Tarikh Siap
                    { wch: 38 }  // Nota
                ];

                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Senarai Arahan Kerja');

                const dateStr = new Date().toISOString().slice(0, 10);
                XLSX.writeFile(workbook, `To-Gasan_Arahan_Kerja_${dateStr}.xlsx`);
                showToast('Fail Excel (.xlsx) berjaya dimuat turun!', 'success');
            } catch (err) {
                showToast('Gagal menjana fail Excel: ' + err.message, 'error');
            }
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