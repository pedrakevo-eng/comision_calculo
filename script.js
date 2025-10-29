document.addEventListener('DOMContentLoaded', () => {
    const SUPABASE_URL = 'https://xzzxodtbgnlsupkcncjb.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6enhvZHRiZ25sc3Vwa2NuY2piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0OTIyMjMsImV4cCI6MjA3NjA2ODIyM30.CnYV46EaxYbLOJ4EcQeYkvzDEecbD_BelymgV1HVicU';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // --- STATE MANAGEMENT ---
    let currentClients = [];
    let currentFeeRules = [];
    let currentExpenseProfiles = [];
    let selectedRuleData = null;
    let selectedProfileData = null;
    let currentCalculationResult = null;
    let debounceTimer;
    let globalExchangeRate = null; // <-- ARREGLO: Aquí guardaremos el tipo de cambio

    // --- UI ELEMENTS ---
    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const notification = document.getElementById('notification');
    const notificationMessage = document.getElementById('notification-message');
    // CAMBIO: Elementos del Modo Oscuro
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');

    // --- NOTIFICATION FUNCTION ---
    const showNotification = (message, isError = false) => {
        notificationMessage.textContent = message;
        notification.className = `fixed bottom-5 right-5 text-white py-3 px-6 rounded-xl shadow-2xl text-base transition-all duration-300 transform`;
        notification.classList.add(isError ? 'bg-rose-500' : 'bg-emerald-500');
        notification.classList.remove('opacity-0', 'translate-y-4');
        setTimeout(() => {
            notification.classList.add('opacity-0', 'translate-y-4');
        }, 3000);
    };

    // --- CAMBIO 4: Función para copiar al portapapeles ---
    function copyCalculationToClipboard(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        // Estilos para hacer el textarea invisible y no afectar el layout
        textArea.style.position = "fixed";
        textArea.style.top = "-9999px";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                showNotification('Valores principales copiados al portapapeles');
            } else {
                console.error('Fallback copy: execCommand returned false');
                showNotification('Error al copiar al portapapeles', true);
            }
        } catch (err) {
            console.error('Error al copiar con execCommand: ', err);
            showNotification('Error al copiar', true);
        }
        document.body.removeChild(textArea);
    }

    // --- CAMBIO: LÓGICA DE MODO OSCURO ---
    const updateDarkMode = (isDark) => {
        document.documentElement.classList.toggle('dark', isDark);
        if (isDark) {
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        } else {
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        }
        localStorage.setItem('darkMode', isDark);
    };

    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            const isCurrentlyDark = document.documentElement.classList.contains('dark');
            updateDarkMode(!isCurrentlyDark);
        });
    }

    // --- TAB NAVIGATION ---
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(item => item.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.getAttribute('data-tab');
            tabContents.forEach(content => {
                content.classList.add('hidden');
                if (content.id === `${target}-tab`) {
                    content.classList.remove('hidden');
                }
            });
        });
    });
    
    // --- GLOBAL SETTINGS ---
    const globalSettingsForm = document.getElementById('global-settings-form');
    // const exchangeRateInput = document.getElementById('exchange-rate'); // <-- ARREGLO: Eliminamos esto, ya no existe en el HTML
    
    async function loadGlobalConfig() {
        const { data, error } = await supabase.from('config_global').select('tipo_cambio_bs_usd').eq('id', 1).single();
        if (error) {
            console.error('Error fetching global config:', error);
            showNotification('Error al cargar tipo de cambio', true);
            return null;
        }
        if (data) {
            // exchangeRateInput.value = data.tipo_cambio_bs_usd; // <-- ARREGLO: Esta línea causaba el error
            globalExchangeRate = data.tipo_cambio_bs_usd; // <-- ARREGLO: Guardamos en la variable
        }
        return data ? data.tipo_cambio_bs_usd : null;
    }
    
    // *** INICIO DEL ARREGLO ***
    // Se comprueba si el formulario existe antes de añadir el listener
    if (globalSettingsForm) {
        globalSettingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newRate = document.getElementById('exchange-rate').value; // Referencia directa ya que solo se usa aquí
            const { error } = await supabase.from('config_global').update({ tipo_cambio_bs_usd: newRate }).eq('id', 1);
            if (error) {
                showNotification('Error al actualizar tipo de cambio', true);
            } else {
                showNotification('Tipo de cambio actualizado con éxito');
                globalExchangeRate = newRate; // Actualizamos la variable global también
            }
        });
    }
    // *** FIN DEL ARREGLO ***

    // --- CLIENTS MANAGEMENT ---
    const addClientForm = document.getElementById('add-client-form');
    const clientsListDiv = document.getElementById('clients-list');
    const clientFormTitle = document.getElementById('client-form-title');
    const clientSubmitBtn = document.getElementById('client-submit-btn');
    const clientEditIdInput = document.getElementById('client-edit-id');

    async function loadClients() {
        const { data, error } = await supabase.from('clientes').select('*').order('nombre');
        if (error) {
            console.error('Error fetching clients:', error);
            showNotification('Error al cargar clientes', true);
            return;
        }
        currentClients = data;
        renderClients();
        populateClientDropdowns();
    }

    function renderClients() {
        // *** INICIO DEL ARREGLO ***
        // Se comprueba si la lista de clientes existe
        if (!clientsListDiv) return;
        // *** FIN DEL ARREGLO ***
        clientsListDiv.innerHTML = '';
        if (currentClients.length === 0) {
            clientsListDiv.innerHTML = '<p class="text-slate-500 text-center py-4">No hay clientes registrados.</p>';
            return;
        }
        currentClients.forEach(client => {
            const clientDiv = document.createElement('div');
            clientDiv.className = 'flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-200';
            clientDiv.innerHTML = `
                <div>
                    <p class="font-semibold text-slate-800">${client.nombre}</p>
                    <p class="text-sm text-slate-500">${client.informacion_adicional || 'Sin información adicional'}</p>
                </div>
                <div class="flex items-center gap-4">
                    <button class="edit-client-btn text-sky-600 hover:text-sky-800 transition-colors font-semibold text-sm" data-id="${client.id}">Editar</button>
                    <button class="delete-client-btn text-rose-500 hover:text-rose-700 transition-colors font-semibold text-sm" data-id="${client.id}">Eliminar</button>
                </div>`;
            clientsListDiv.appendChild(clientDiv);
        });
    }
    
    function resetClientForm() {
        if (!addClientForm) return; // *** ARREGLO ***
        addClientForm.reset();
        clientEditIdInput.value = '';
        clientFormTitle.textContent = 'Agregar Nuevo Cliente';
        clientSubmitBtn.textContent = 'Agregar Cliente';
        clientSubmitBtn.classList.remove('bg-amber-500', 'hover:bg-amber-600');
        clientSubmitBtn.classList.add('bg-teal-600', 'hover:bg-teal-700');
    }

    async function handleEditClient(id) {
        const { data, error } = await supabase.from('clientes').select('*').eq('id', id).single();
        if (error) {
            showNotification('Error al cargar datos del cliente', true);
            return;
        }
        document.getElementById('client-name').value = data.nombre;
        document.getElementById('client-info').value = data.informacion_adicional;
        clientEditIdInput.value = data.id;
        clientFormTitle.textContent = 'Editar Cliente';
        clientSubmitBtn.textContent = 'Guardar Cambios';
        clientSubmitBtn.classList.add('bg-amber-500', 'hover:bg-amber-600');
        clientSubmitBtn.classList.remove('bg-teal-600', 'hover:bg-teal-700');
        addClientForm.scrollIntoView({ behavior: 'smooth' });
    }

    // *** INICIO DEL ARREGLO ***
    // Se comprueba si el formulario de cliente existe
    if (addClientForm) {
        addClientForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const editId = clientEditIdInput.value;
            const clientData = {
                nombre: document.getElementById('client-name').value,
                informacion_adicional: document.getElementById('client-info').value
            };

            let error;
            if (editId) {
                ({ error } = await supabase.from('clientes').update(clientData).eq('id', editId));
            } else {
                ({ error } = await supabase.from('clientes').insert([clientData]));
            }
            
            if (error) {
                showNotification(`Error al ${editId ? 'actualizar' : 'agregar'} cliente`, true);
            } else {
                showNotification(`Cliente ${editId ? 'actualizado' : 'agregado'} con éxito`);
                resetClientForm();
                loadClients();
            }
        });
    }
    // *** FIN DEL ARREGLO ***

    // *** INICIO DEL ARREGLO ***
    // Se comprueba si la lista de clientes existe
    if (clientsListDiv) {
        clientsListDiv.addEventListener('click', async (e) => {
            if (e.target.classList.contains('delete-client-btn')) {
                const id = e.target.dataset.id;
                if (confirm('¿Estás seguro de que quieres eliminar este cliente? Esto eliminará sus reglas y perfiles asociados.')) {
                    const { error } = await supabase.from('clientes').delete().eq('id', id);
                    if (error) {
                        showNotification('Error al eliminar cliente', true);
                    } else {
                        showNotification('Cliente eliminado');
                        loadClients();
                        loadFeeRules();
                        loadExpenseProfiles();
                    }
                }
            }
            if (e.target.classList.contains('edit-client-btn')) {
                handleEditClient(e.target.dataset.id);
            }
        });
    }
    // *** FIN DEL ARREGLO ***
    
    function populateClientDropdowns() {
        const selects = document.querySelectorAll('#calc-client, #fee-rule-client, #expense-profile-client');
        selects.forEach(select => {
            // Comprobamos si el select existe (por si acaso)
            if (select) {
                const currentValue = select.value;
                select.innerHTML = `<option value="">Seleccione un cliente...</option>`;
                currentClients.forEach(client => {
                    select.innerHTML += `<option value="${client.id}">${client.nombre}</option>`;
                });
                select.value = currentValue;
            }
        });
    }
    
    // --- FEE RULES MANAGEMENT ---
    const feeRuleForm = document.getElementById('add-fee-rule-form');
    const feeRuleTypeSelect = document.getElementById('fee-rule-type');
    const directFeeFields = document.getElementById('direct-fee-fields');
    const feeRulesListDiv = document.getElementById('fee-rules-list');
    const feeRuleFormTitle = document.getElementById('fee-rule-form-title');
    const feeRuleSubmitBtn = document.getElementById('fee-rule-submit-btn');
    const feeRuleEditIdInput = document.getElementById('fee-rule-edit-id');

    if (feeRuleTypeSelect) { // Esta comprobación ya estaba, ¡bien!
        feeRuleTypeSelect.addEventListener('change', () => {
            if (directFeeFields) { // Chequeo extra
                const isDirectType = feeRuleTypeSelect.value === 'directo' || feeRuleTypeSelect.value === 'directo_factura';
                directFeeFields.style.display = isDirectType ? 'block' : 'none';
            }
        });
    }
    
    async function loadFeeRules() {
         const { data, error } = await supabase.from('config_comisiones_honorarios').select(`*, cliente:clientes(nombre)`).order('nombre_regla');
        if(error) {
            console.error('Error fetching fee rules:', error);
            showNotification('Error al cargar reglas de honorarios', true);
            return;
        }
        currentFeeRules = data;
        renderFeeRules();
    }

    function renderFeeRules() {
        if (!feeRulesListDiv) return; // Esta comprobación ya estaba
        feeRulesListDiv.innerHTML = '';
         if (currentFeeRules.length === 0) {
            feeRulesListDiv.innerHTML = '<p class="text-slate-500 text-center py-4">No hay reglas de honorarios registradas.</p>';
            return;
        }
        currentFeeRules.forEach(rule => {
            const ruleDiv = document.createElement('div');
            ruleDiv.className = 'p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-center';
            
            let typeInfo = '';
            if (rule.tipo === 'directo') {
                typeInfo = `Directo: ${(rule.porcentaje_directo * 100).toFixed(2)}%`;
            } else if (rule.tipo === 'directo_factura') {
                typeInfo = `Directo con Factura: ${(rule.porcentaje_directo * 100).toFixed(2)}%`;
            } else {
                typeInfo = 'Escalonado';
            }

            ruleDiv.innerHTML = `
                <div>
                    <p class="font-semibold text-slate-800">${rule.nombre_regla}</p>
                    <p class="text-sm text-slate-600">Cliente: ${rule.cliente ? rule.cliente.nombre : 'N/A'}</p>
                </div>
                <div class="text-sm">
                    <p>Tipo: <span class="font-medium">${typeInfo}</span></p>
                    <p>Mínimo: <span class="font-medium">Bs. ${parseFloat(rule.comision_minima_usd || 0).toFixed(2)}</span></p>
                </div>
                <div class="md:col-span-2 flex items-center justify-end space-x-3">
                    ${rule.tipo === 'escalonado' ? `<button class="manage-tiers-btn bg-sky-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-sky-700 transition-all transform hover:scale-105" data-id="${rule.id}" data-name="${rule.nombre_regla}">Gestionar Niveles</button>` : ''}
                    <button class="edit-rule-btn text-sky-600 hover:text-sky-800 transition-colors font-semibold text-sm" data-id="${rule.id}">Editar</button>
                    <button class="delete-rule-btn text-rose-500 hover:text-rose-700 transition-colors font-semibold text-sm" data-id="${rule.id}">Eliminar</button>
                </div>`;
            feeRulesListDiv.appendChild(ruleDiv);
        });
    }

    function resetFeeRuleForm() {
        if (!feeRuleForm) return; // Esta comprobación ya estaba
        feeRuleForm.reset();
        feeRuleEditIdInput.value = '';
        feeRuleFormTitle.textContent = 'Crear Nueva Regla';
        feeRuleSubmitBtn.textContent = 'Guardar Regla';
        feeRuleSubmitBtn.classList.remove('bg-amber-500', 'hover:bg-amber-600');
        feeRuleSubmitBtn.classList.add('bg-teal-600', 'hover:bg-teal-700');
        feeRuleTypeSelect.dispatchEvent(new Event('change'));
    }

    async function handleEditFeeRule(id) {
        const { data, error } = await supabase.from('config_comisiones_honorarios').select('*').eq('id', id).single();
        if (error) { showNotification('Error al cargar datos de la regla', true); return; }

        document.getElementById('fee-rule-client').value = data.cliente_id;
        document.getElementById('fee-rule-name').value = data.nombre_regla;
        document.getElementById('fee-rule-type').value = data.tipo;
        document.getElementById('fee-rule-min-commission').value = data.comision_minima_usd;
        if(data.tipo === 'directo' || data.tipo === 'directo_factura'){
            document.getElementById('fee-rule-percentage').value = data.porcentaje_directo;
        }
        feeRuleEditIdInput.value = data.id;
        
        feeRuleFormTitle.textContent = 'Editar Regla de Honorarios';
        feeRuleSubmitBtn.textContent = 'Guardar Cambios';
        feeRuleSubmitBtn.classList.add('bg-amber-500', 'hover:bg-amber-600');
        feeRuleSubmitBtn.classList.remove('bg-teal-600', 'hover:bg-teal-700');
        feeRuleTypeSelect.dispatchEvent(new Event('change'));
        feeRuleForm.scrollIntoView({ behavior: 'smooth' });
    }

    if (feeRuleForm) { // Esta comprobación ya estaba
        feeRuleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const editId = feeRuleEditIdInput.value;
            const feeType = document.getElementById('fee-rule-type').value;
            const rule = {
                cliente_id: document.getElementById('fee-rule-client').value,
                nombre_regla: document.getElementById('fee-rule-name').value,
                tipo: feeType,
                comision_minima_usd: parseFloat(document.getElementById('fee-rule-min-commission').value) || 0,
                porcentaje_directo: (feeType === 'directo' || feeType === 'directo_factura') ? parseFloat(document.getElementById('fee-rule-percentage').value) : null
            };

            let error;
            if(editId) {
                ({ error } = await supabase.from('config_comisiones_honorarios').update(rule).eq('id', editId));
            } else {
                ({ error } = await supabase.from('config_comisiones_honorarios').insert(rule));
            }
            
            if (error) {
                showNotification(`Error al ${editId ? 'actualizar' : 'crear'} la regla`, true);
            } else {
                showNotification(`Regla ${editId ? 'actualizada' : 'creada'} con éxito`);
                resetFeeRuleForm();
                loadFeeRules();
            }
        });
    }

    if (feeRulesListDiv) { // Esta comprobación ya estaba
        feeRulesListDiv.addEventListener('click', async (e) => {
            if (e.target.closest('.delete-rule-btn')) {
                const id = e.target.closest('.delete-rule-btn').dataset.id;
                if (confirm('¿Seguro que quieres eliminar esta regla?')) {
                    const { error } = await supabase.from('config_comisiones_honorarios').delete().eq('id', id);
                    if (error) showNotification('Error al eliminar regla', true);
                    else {
                        showNotification('Regla eliminada');
                        loadFeeRules();
                    }
                }
            }
            if (e.target.closest('.edit-rule-btn')) {
                handleEditFeeRule(e.target.closest('.edit-rule-btn').dataset.id);
            }
            if (e.target.closest('.manage-tiers-btn')) {
                const button = e.target.closest('.manage-tiers-btn');
                openTiersModal(button.dataset.id, button.dataset.name);
            }
        });
    }
    
    // --- TIERS MODAL LOGIC ---
    const tiersModal = document.getElementById('tiered-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const addTierForm = document.getElementById('add-tier-form');
    const tiersListDiv = document.getElementById('tiers-list');
    let currentRuleIdForModal = null;
    
    if (tiersModal) { // Esta comprobación ya estaba
        closeModalBtn.addEventListener('click', () => tiersModal.classList.add('hidden'));
        tiersModal.addEventListener('click', (e) => {
            if(e.target === tiersModal) {
                tiersModal.classList.add('hidden');
            }
        });

        addTierForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tier = {
                config_id: currentRuleIdForModal,
                rango_inicio_usd: parseFloat(document.getElementById('tier-start').value),
                rango_fin_usd: document.getElementById('tier-end').value ? parseFloat(document.getElementById('tier-end').value) : null,
                porcentaje: document.getElementById('tier-percentage').value ? parseFloat(document.getElementById('tier-percentage').value) : null,
                valor_fijo_usd: document.getElementById('tier-fixed').value ? parseFloat(document.getElementById('tier-fixed').value) : null,
            };
            if((!tier.porcentaje && !tier.valor_fijo_usd) || (tier.porcentaje && tier.valor_fijo_usd)) {
                showNotification('Debe especificar porcentaje O valor fijo', true);
                return;
            }
            const { error } = await supabase.from('niveles_comision_escalonada').insert(tier);
            if (error) showNotification('Error al agregar nivel', true);
            else {
                addTierForm.reset();
                loadTiers(currentRuleIdForModal);
            }
        });

        tiersListDiv.addEventListener('click', async (e) => {
            const deleteBtn = e.target.closest('.delete-tier-btn');
            if (deleteBtn) {
                const tierId = deleteBtn.dataset.id;
                const { error } = await supabase.from('niveles_comision_escalonada').delete().eq('id', tierId);
                if (error) showNotification('Error al eliminar nivel', true);
                else loadTiers(currentRuleIdForModal);
            }
        });
    }

    async function openTiersModal(ruleId, ruleName) {
        if (document.getElementById('modal-rule-name')) {
            document.getElementById('modal-rule-name').textContent = ruleName;
        }
        currentRuleIdForModal = ruleId;
        await loadTiers(ruleId);
        if (tiersModal) {
            tiersModal.classList.remove('hidden');
        }
    }

    async function loadTiers(ruleId) {
        const { data, error } = await supabase.from('niveles_comision_escalonada').select('*').eq('config_id', ruleId).order('rango_inicio_usd');
        if (error) {
            showNotification('Error al cargar niveles', true);
            return;
        }
        renderTiers(data);
    }

    function renderTiers(tiers) {
        if (!tiersListDiv) return;
        tiersListDiv.innerHTML = '';
        if(tiers.length === 0) {
            tiersListDiv.innerHTML = '<p class="text-slate-500 text-center py-4">No hay niveles para esta regla.</p>';
            return;
        }
        tiers.forEach(tier => {
            const tierDiv = document.createElement('div');
            tierDiv.className = 'flex justify-between items-center p-3 bg-slate-100 dark:bg-slate-700 rounded-lg';
            const value = tier.porcentaje ? `${(tier.porcentaje * 100).toFixed(2)}%` : `Bs. ${parseFloat(tier.valor_fijo_usd || 0).toFixed(2)}`;
            tierDiv.innerHTML = `
                <span class="dark:text-slate-300">De $${tier.rango_inicio_usd} a ${tier.rango_fin_usd ? `$${tier.rango_fin_usd}` : 'más'}</span>
                <span class="font-semibold dark:text-slate-200">${value}</span>
                <button class="delete-tier-btn text-rose-500 hover:text-rose-700 text-xl" data-id="${tier.id}"><i class="ph-bold ph-trash"></i></button>`;
            tiersListDiv.appendChild(tierDiv);
        });
    }
    
    // --- EXPENSE PROFILE MANAGEMENT ---
    const expenseProfileForm = document.getElementById('add-expense-profile-form');
    const expenseProfilesListDiv = document.getElementById('expense-profiles-list');
    const itemsDimDavModo = document.getElementById('items_dim_dav_modo');
    const expenseProfileFormTitle = document.getElementById('expense-profile-form-title');
    const expenseProfileSubmitBtn = document.getElementById('expense-profile-submit-btn');
    const expenseProfileEditIdInput = document.getElementById('expense-profile-edit-id');
    
    if (itemsDimDavModo) { // Esta comprobación ya estaba
        itemsDimDavModo.addEventListener('change', (e) => {
            if (document.getElementById('items_dim_dav_fijo_div')) {
                document.getElementById('items_dim_dav_fijo_div').classList.toggle('hidden', e.target.value !== 'FIJO');
                document.getElementById('items_dim_dav_por_item_div').classList.toggle('hidden', e.target.value !== 'POR_ITEM');
            }
        });
    }

    async function loadExpenseProfiles() {
        const { data, error } = await supabase.from('config_perfil_gastos').select(`*, cliente:clientes(nombre)`).order('nombre_perfil');
        if (error) {
            showNotification('Error al cargar perfiles de gastos', true);
            return;
        }
        currentExpenseProfiles = data;
        renderExpenseProfiles();
    }

function renderExpenseProfiles() {
        if (!expenseProfilesListDiv) return; // Esta comprobación ya estaba
        expenseProfilesListDiv.innerHTML = '';
        if (currentExpenseProfiles.length === 0) {
            expenseProfilesListDiv.innerHTML = '<p class="text-slate-500 text-center py-4">No hay perfiles de gastos registrados.</p>';
            return;
        }
        currentExpenseProfiles.forEach(profile => {
            const profileDiv = document.createElement('div');
            profileDiv.className = 'p-4 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center';
            profileDiv.innerHTML = `
                <div>
                    <p class="font-semibold">${profile.nombre_perfil}</p>
                    <p class="text-sm text-slate-600">Cliente: ${profile.cliente ? profile.cliente.nombre : 'N/A'}</p>
                </div>
                <div class="flex items-center gap-4">
                    <button class="edit-profile-btn text-sky-600 hover:text-sky-800 transition-colors font-semibold text-sm" data-id="${profile.id}">Editar</button>
                    <button class="delete-profile-btn text-rose-500 hover:text-rose-700 transition-colors font-semibold text-sm" data-id="${profile.id}">Eliminar</button>
                </div>`;
            expenseProfilesListDiv.appendChild(profileDiv);
        });
    }

    function resetExpenseProfileForm() {
        if (!expenseProfileForm) return; // Esta comprobación ya estaba
        expenseProfileForm.reset();
        expenseProfileEditIdInput.value = '';
        expenseProfileFormTitle.textContent = 'Crear Nuevo Perfil de Gastos';
        expenseProfileSubmitBtn.textContent = 'Guardar Perfil de Gastos';
        expenseProfileSubmitBtn.classList.remove('bg-amber-500', 'hover:bg-amber-600');
        expenseProfileSubmitBtn.classList.add('bg-teal-600', 'hover:bg-teal-700');
        itemsDimDavModo.dispatchEvent(new Event('change'));
    }

    async function handleEditExpenseProfile(id) {
        const { data, error } = await supabase.from('config_perfil_gastos').select('*').eq('id', id).single();
        if (error) { showNotification('Error al cargar datos del perfil', true); return; }
        
        expenseProfileEditIdInput.value = data.id;
        document.getElementById('expense-profile-client').value = data.cliente_id;
        
        for (const key in data) {
            const field = document.getElementById(key);
            if(field) {
                field.value = data[key];
            }
        }

        expenseProfileFormTitle.textContent = 'Editar Perfil de Gastos';
        expenseProfileSubmitBtn.textContent = 'Guardar Cambios';
        expenseProfileSubmitBtn.classList.add('bg-amber-500', 'hover:bg-amber-600');
        expenseProfileSubmitBtn.classList.remove('bg-teal-600', 'hover:bg-teal-700');
        itemsDimDavModo.dispatchEvent(new Event('change'));
        expenseProfileForm.scrollIntoView({ behavior: 'smooth' });
    }

    if (expenseProfileForm) { // Esta comprobación ya estaba
        expenseProfileForm.addEventListener('submit', async(e) => {
            e.preventDefault();
            const editId = expenseProfileEditIdInput.value;
            const profileData = {
                cliente_id: document.getElementById('expense-profile-client').value,
                nombre_perfil: document.getElementById('expense-profile-name').value,
                gasto_despacho_fijo: parseFloat(document.getElementById('gasto_despacho_fijo').value) || 0,
                otros_servicios_fijo: parseFloat(document.getElementById('otros_servicios_fijo').value) || 0,
                carpeta_archivo_fijo: parseFloat(document.getElementById('carpeta_archivo_fijo').value) || 0,
                fotocopias_legalizadas_fijo: parseFloat(document.getElementById('fotocopias_legalizadas_fijo').value) || 0,
                regularizacion_anticipado_monto: parseFloat(document.getElementById('regularizacion_anticipado_monto').value) || 0,
                despacho_frontera_monto: parseFloat(document.getElementById('despacho_frontera_monto').value) || 0,
                formulario_dam_monto_menor_20: parseFloat(document.getElementById('formulario_dam_monto_menor_20').value) || 0,
                formulario_dam_monto_mayor_20: parseFloat(document.getElementById('formulario_dam_monto_mayor_20').value) || 0,
                cam_ind_y_com_monto: parseFloat(document.getElementById('cam_ind_y_com_monto').value) || 0,
                escaneo_facturas_monto: parseFloat(document.getElementById('escaneo_facturas_monto').value) || 0,
                servicio_transporte_monto: parseFloat(document.getElementById('servicio_transporte_monto').value) || 0,
                serv_carguio_descarguio_monto: parseFloat(document.getElementById('serv_carguio_descarguio_monto').value) || 0,
                gtos_puerto_aspb_monto: parseFloat(document.getElementById('gtos_puerto_aspb_monto').value) || 0,
                seguro_monto: parseFloat(document.getElementById('seguro_monto').value) || 0,
                items_dim_dav_modo: document.getElementById('items_dim_dav_modo').value,
                items_dim_dav_monto_fijo: parseFloat(document.getElementById('items_dim_dav_monto_fijo').value) || 0,
                items_dim_dav_monto_por_item: parseFloat(document.getElementById('items_dim_dav_monto_por_item').value) || 0,
            };
            
            let error;
            if(editId) {
                ({ error } = await supabase.from('config_perfil_gastos').update(profileData).eq('id', editId));
            } else {
                ({ error } = await supabase.from('config_perfil_gastos').insert(profileData));
            }

            if (error) {
                showNotification(`Error al ${editId ? 'actualizar' : 'crear'} perfil de gastos`, true);
                console.error("Error saving profile:", error);
            } else {
                showNotification(`Perfil de gastos ${editId ? 'actualizado' : 'creado'} con éxito`);
                resetExpenseProfileForm();
                loadExpenseProfiles();
            }
        });
    }

    if (expenseProfilesListDiv) { // Esta comprobación ya estaba
        expenseProfilesListDiv.addEventListener('click', async (e) => {
            if(e.target.closest('.delete-profile-btn')) {
                const id = e.target.closest('.delete-profile-btn').dataset.id;
                if (confirm('¿Seguro que quieres eliminar este perfil de gastos?')) {
                    const { error } = await supabase.from('config_perfil_gastos').delete().eq('id', id);
                    if (error) showNotification('Error al eliminar perfil', true);
                    else {
                        showNotification('Perfil eliminado');
                        loadExpenseProfiles();
                    }
                }
            } // <-- !!ARREGLO: AQUÍ ESTÁ LA LLAVE QUE FALTABA!!

            if(e.target.closest('.edit-profile-btn')) {
                handleEditExpenseProfile(e.target.closest('.edit-profile-btn').dataset.id);
            }
        });
    }

    // --- REAL-TIME CALCULATOR ---
    const resultDiv = document.getElementById('calculation-result');
    const saveBtn = document.getElementById('save-calculation-btn');
    
    const debounce = (func, delay) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(func, delay);
    };

    function performCalculation() {
        if (saveBtn) {
            saveBtn.classList.add('hidden');
        }
        
        const client_id_val = document.getElementById('calc-client').value;
        const rule_id = document.getElementById('calc-fee-rule').value;
        const profile_id = document.getElementById('calc-expense-profile').value;
        const cif_local_val = document.getElementById('cif-local').value;

        if (!client_id_val || !rule_id || !profile_id || !cif_local_val || !selectedRuleData || !selectedProfileData) {
            if (resultDiv) {
                resultDiv.innerHTML = '<p>Complete todos los campos para ver el cálculo.</p>';
            }
            return;
        }

        try {
            const cif_local = parseFloat(cif_local_val);
            const item_count = parseInt(document.getElementById('item-count').value) || 0;
            const includeRegularizacion = document.getElementById('calc-regularizacion').checked;
            const includeFrontera = document.getElementById('calc-frontera').checked;
            const includeDAM = document.getElementById('calc-dam').checked;
            
            // const exchangeRate = parseFloat(exchangeRateInput.value); // <-- ARREGLO: Esta línea daba error
            const exchangeRate = parseFloat(globalExchangeRate); // <-- ARREGLO: Usamos la variable global
            if (!exchangeRate) throw new Error("Tipo de cambio no cargado.");

            const ruleData = selectedRuleData;
            const profileData = selectedProfileData;

            const cif_usd = cif_local / exchangeRate;
            
            let commission_bs_calculated = 0;

            if (ruleData.tipo === 'directo') {
                commission_bs_calculated = (cif_usd * ruleData.porcentaje_directo) * exchangeRate;
            } else if (ruleData.tipo === 'directo_factura') {
                const TASA_FACTURA = 0.149425287;
                const resultado1 = cif_local * ruleData.porcentaje_directo;
                const resultado2 = resultado1 * TASA_FACTURA;
                commission_bs_calculated = resultado1 + resultado2;
            }
            else { // Escalonado
                const tiers = ruleData.tiers || [];
                const sortedTiers = tiers.sort((a, b) => parseFloat(a.rango_inicio_usd) - parseFloat(b.rango_inicio_usd));
                let applicableTier = null;
                for (const tier of sortedTiers) {
                    const start = parseFloat(tier.rango_inicio_usd);
                    const end = tier.rango_fin_usd == null ? Infinity : parseFloat(tier.rango_fin_usd);
                    if (cif_usd >= start && cif_usd <= end) {
                        applicableTier = tier;
                        break;
                    }
                }

                if (applicableTier) {
                    if (applicableTier.porcentaje != null) {
                        commission_bs_calculated = Math.ceil(cif_local * parseFloat(applicableTier.porcentaje));
                    } else if (applicableTier.valor_fijo_usd != null) {
                        commission_bs_calculated = parseFloat(applicableTier.valor_fijo_usd);
                    }
                }
            }

            let commission_bs_final = Math.ceil(Math.max(commission_bs_calculated, parseFloat(ruleData.comision_minima_usd) || 0));
            
            let totalExpensesBS = 0;
            const expenseItems = [];
            const conceptMapping = {
                gasto_despacho_fijo: "Gastos en Despacho", otros_servicios_fijo: "Otros Servicios", carpeta_archivo_fijo: "Carpeta p/ Archivo",
                fotocopias_legalizadas_fijo: "Fotocopias Legalizadas", 
                cam_ind_y_com_monto: "CAM IND Y COM",
                escaneo_facturas_monto: "Escaneo Facturas", servicio_transporte_monto: "Servicio Transporte", serv_carguio_descarguio_monto: "Serv. Carguío/Descarguío",
                gtos_puerto_aspb_monto: "Gtos. Puerto ASPB", seguro_monto: "Seguro"
            };

            for (const key in profileData) {
                const amountBS = parseFloat(profileData[key]) || 0;
                if (amountBS > 0 && conceptMapping[key]) {
                     expenseItems.push({ concepto: conceptMapping[key], monto_bs: amountBS });
                     totalExpensesBS += amountBS;
                }
            }
            
            if (includeRegularizacion) {
                const amount = parseFloat(profileData.regularizacion_anticipado_monto) || 0;
                if (amount > 0) {
                    expenseItems.push({ concepto: 'Regularización Anticipado', monto_bs: amount });
                    totalExpensesBS += amount;
                }
            }
            if (includeFrontera) {
                const amount = parseFloat(profileData.despacho_frontera_monto) || 0;
                if (amount > 0) {
                    expenseItems.push({ concepto: 'Despacho Frontera', monto_bs: amount });
                    totalExpensesBS += amount;
                }
            }

            if (includeDAM) {
                let amount = 0;
                if (item_count > 20) {
                    amount = parseFloat(profileData.formulario_dam_monto_mayor_20) || 0;
                } else {
                    amount = parseFloat(profileData.formulario_dam_monto_menor_20) || 0;
                }
                if (amount > 0) {
                    expenseItems.push({ concepto: 'Formulario DAM', monto_bs: amount });
                    totalExpensesBS += amount;
                }
            }

            if (profileData.items_dim_dav_modo === 'FIJO') {
                const amount = parseFloat(profileData.items_dim_dav_monto_fijo) || 0;
                if (amount > 0) {
                   expenseItems.push({ concepto: 'Items Declarados en DIM y DAV (Fijo)', monto_bs: amount });
                   totalExpensesBS += amount;
                }
            } else if (profileData.items_dim_dav_modo === 'POR_ITEM') {
                const amount = (parseFloat(profileData.items_dim_dav_monto_por_item) || 0) * item_count;
                if (amount > 0) {
                   expenseItems.push({ concepto: `Items Declarados en DIM y DAV (${item_count} items)`, monto_bs: amount });
                   totalExpensesBS += amount;
                }
            }
            
            const allItems = [ { concepto: 'Honorarios Agencia', monto_bs: commission_bs_final }, ...expenseItems];
            const total_bs = commission_bs_final + totalExpensesBS;
            const total_usd = total_bs / exchangeRate;

            // --- INICIO: CAMBIO 4 (Lógica de copiado) ---
            try {
                const gastosDespacho = parseFloat(profileData.gasto_despacho_fijo) || 0;
                const otrosGastos = totalExpensesBS - gastosDespacho;
                
                // INICIO: MODIFICACIÓN pedida por el usuario (coma decimal)
                const commission_str = commission_bs_final.toFixed(2).replace('.', ',');
                const gastos_str = gastosDespacho.toFixed(2).replace('.', ',');
                const otros_str = otrosGastos.toFixed(2).replace('.', ',');
                
                const clipboardText = `${commission_str}\t${gastos_str}\t${otros_str}`;
                // FIN: MODIFICACIÓN
                
                copyCalculationToClipboard(clipboardText);

            } catch (copyError) {
                console.error("Error preparing text for clipboard:", copyError);
            }
            // --- FIN: CAMBIO 4 ---

            currentCalculationResult = {
                cliente_id: client_id_val, 
                cif_moneda_local: cif_local, 
                tipo_cambio_usado: exchangeRate, 
                cif_usd, 
                comision_total_usd: total_usd,
                items: allItems.map(item => ({ concepto: item.concepto, monto_usd: item.monto_bs / exchangeRate }))
            };

            // --- INICIO: CAMBIO 2 (Ocultar USD en UI) ---
            let resultHTML = `<div class="space-y-4">
                    <!-- <p class="text-sm"><strong>CIF en Dólares:</strong> <span class="font-mono text-teal-600 font-semibold">$${cif_usd.toFixed(2)}</span></p> --> <!-- Línea Oculta -->
                    <div class="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                        <table class="w-full text-left">
                            <thead class="bg-slate-100 dark:bg-slate-700">
                                <tr>
                                    <th class="p-3 text-xs font-semibold tracking-wider uppercase text-slate-600 dark:text-slate-400">Concepto</th>
                                    <th class="p-3 text-xs font-semibold tracking-wider uppercase text-slate-600 dark:text-slate-400 text-right">Importe (Bs.)</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-200 dark:divide-slate-700">`;
            allItems.sort((a,b) => a.concepto.localeCompare(b.concepto)).forEach(item => {
                resultHTML += `<tr class="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td class="p-3 text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">${item.concepto}</td>
                                    <td class="p-3 text-sm text-slate-700 dark:text-slate-300 text-right font-mono">${item.monto_bs.toFixed(2)}</td>
                               </tr>`;
            });
            resultHTML += `</tbody>
                        </table>
                    </div>
                    <div class="mt-4 p-4 bg-teal-50 dark:bg-teal-900/50 border border-teal-200 dark:border-teal-800 rounded-xl text-center">
                        <p class="text-base font-bold text-teal-800 dark:text-teal-300 uppercase">Total a Pagar</p>
                        <p class="text-4xl font-extrabold text-teal-800 dark:text-teal-200 tracking-tight font-mono">Bs. ${total_bs.toFixed(2)}</p>
                        <!-- <p class="text-sm text-slate-600 mt-1">~ $${total_usd.toFixed(2)} USD</p> --> <!-- Línea Oculta -->
                    </div>
                </div>`;
            // --- FIN: CAMBIO 2 ---
            if (resultDiv) {
                resultDiv.innerHTML = resultHTML;
            }
            if (saveBtn) {
                saveBtn.classList.remove('hidden');
            }

        } catch (error) {
            console.error("Error during calculation:", error);
            if (resultDiv) {
                resultDiv.innerHTML = `<p class="text-rose-500"><b>Error:</b> ${error.message}</p>`;
            }
        }
    }
    
    // --- EVENT LISTENERS FOR REAL-TIME CALCULATION ---
    const debouncedCalc = () => debounce(performCalculation, 400);
    const cifLocalInput = document.getElementById('cif-local');
    if (cifLocalInput) {
        cifLocalInput.addEventListener('input', debouncedCalc);
    }
    const itemCountInput = document.getElementById('item-count');
    if (itemCountInput) {
        itemCountInput.addEventListener('input', debouncedCalc);
    }
    const calcRegularizacion = document.getElementById('calc-regularizacion');
    if (calcRegularizacion) {
        calcRegularizacion.addEventListener('change', performCalculation);
    }
    const calcFrontera = document.getElementById('calc-frontera');
    if (calcFrontera) {
        calcFrontera.addEventListener('change', performCalculation);
    }
    const calcDam = document.getElementById('calc-dam');
    if (calcDam) {
        calcDam.addEventListener('change', performCalculation);
    }
    
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (!currentCalculationResult) return;
            const { items, ...header } = currentCalculationResult;
            const { data: newHeader, error: headerError } = await supabase.from('calculos_historial').insert(header).select('id').single();
            if (headerError) { showNotification('Error al guardar cabecera del cálculo', true); return; }
            const itemsToInsert = items.map(item => ({ ...item, calculo_id: newHeader.id }));
            const { error: itemsError } = await supabase.from('calculos_historial_items').insert(itemsToInsert);
            if (itemsError) showNotification('Error al guardar detalle del cálculo', true);
            else {
                showNotification('Cálculo guardado con éxito');
                saveBtn.classList.add('hidden');
                currentCalculationResult = null;
                loadHistory();
            }
        });
    }

    // --- HISTORY ---
    const historyListDiv = document.getElementById('history-list');

    async function loadHistory() {
        if (!historyListDiv) return; // Esta comprobación ya estaba
         const { data, error } = await supabase.from('calculos_historial').select(`*, cliente:clientes(nombre)`).order('fecha_calculo', { ascending: false }).limit(50);
        if (error) { showNotification('Error al cargar historial', true); return; }
        renderHistory(data);
    }

    function renderHistory(history) {
        if (!historyListDiv) return; // Esta comprobación ya estaba
        historyListDiv.innerHTML = '';
         if (history.length === 0) { historyListDiv.innerHTML = '<p class="text-slate-500 text-center py-4">No hay cálculos guardados.</p>'; return; }
        history.forEach(entry => {
            const comision_total_bs = entry.comision_total_usd * entry.tipo_cambio_usado;
            
            const entryDiv = document.createElement('div');
            entryDiv.className = 'p-4 bg-white border border-slate-200 rounded-xl shadow-sm';
            entryDiv.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-semibold text-lg text-teal-700">${entry.cliente.nombre}</p>
                        <p class="text-xs text-slate-500 mt-1">Fecha: ${new Date(entry.fecha_calculo).toLocaleString()}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-2xl font-bold text-slate-800">Bs. ${comision_total_bs.toFixed(2)}</p>
                        <p class="text-sm text-slate-600">CIF: Bs. ${entry.cif_moneda_local.toFixed(2)}</p>
                    </div>
                </div>`;
            historyListDiv.appendChild(entryDiv);
        });
    }

    // --- HELPER FUNCTIONS TO LOAD DATA FOR CALCULATOR ---
    async function loadSelectedRuleData(ruleId) {
        selectedRuleData = null;
        if (!ruleId) return;
        const { data: rule, error } = await supabase.from('config_comisiones_honorarios').select('*').eq('id', ruleId).single();
        if (error) { 
            showNotification('Error al cargar datos de la regla', true); 
            return; 
        }
        if (rule.tipo === 'escalonado') {
            const { data: tiers, error: tiersError } = await supabase.from('niveles_comision_escalonada').select('*').eq('config_id', ruleId);
            if (tiersError) { showNotification('Error al cargar niveles de la regla', true); }
            else { rule.tiers = tiers; }
        }
        selectedRuleData = rule;
    }

    async function loadSelectedProfileData(profileId) {
        selectedProfileData = null;
        if (!profileId) return;
        const { data, error } = await supabase.from('config_perfil_gastos').select('*').eq('id', profileId).single();
        if (error) { showNotification('Error al cargar datos del perfil', true); }
        else { selectedProfileData = data; }
    }

    // --- DYNAMIC DROPDOWNS & UI UNLOCK ---
    const calcClientSelect = document.getElementById('calc-client');
    if (calcClientSelect) {
        calcClientSelect.addEventListener('change', async (e) => {
            const clientId = e.target.value;
            const fieldsToToggle = ['calc-fee-rule', 'calc-expense-profile', 'cif-local', 'item-count', 'calc-regularizacion', 'calc-frontera', 'calc-dam'];
            fieldsToToggle.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = true;
            });
            
            selectedRuleData = null;
            selectedProfileData = null;
            const feeRuleSelect = document.getElementById('calc-fee-rule');
            const expenseProfileSelect = document.getElementById('calc-expense-profile');

            if (!clientId) {
                if(feeRuleSelect) feeRuleSelect.innerHTML = `<option value="">Seleccione un cliente</option>`;
                if(expenseProfileSelect) expenseProfileSelect.innerHTML = `<option value="">Seleccione un cliente</option>`;
                performCalculation();
                return;
            }

            fieldsToToggle.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = false;
            });

            const { data: rules } = await supabase.from('config_comisiones_honorarios').select('id, nombre_regla').eq('cliente_id', clientId);
            if (feeRuleSelect) {
                feeRuleSelect.innerHTML = '<option value="">Seleccione una regla...</option>';
                rules.forEach(rule => { feeRuleSelect.innerHTML += `<option value="${rule.id}">${rule.nombre_regla}</option>`; });
            }
            
            const { data: profiles } = await supabase.from('config_perfil_gastos').select('id, nombre_perfil').eq('cliente_id', clientId);
            if (expenseProfileSelect) {
                expenseProfileSelect.innerHTML = '<option value="">Seleccione un perfil...</option>';
                profiles.forEach(profile => { expenseProfileSelect.innerHTML += `<option value="${profile.id}">${profile.nombre_perfil}</option>`; });
            }
            
            if (rules && rules.length > 0 && feeRuleSelect) {
                feeRuleSelect.value = rules[0].id;
                await loadSelectedRuleData(rules[0].id);
            }

            if (profiles && profiles.length > 0 && expenseProfileSelect) {
                expenseProfileSelect.value = profiles[0].id;
                await loadSelectedProfileData(profiles[0].id);
            }
            performCalculation();
        });
    }

    const calcFeeRuleSelect = document.getElementById('calc-fee-rule');
    if (calcFeeRuleSelect) {
        calcFeeRuleSelect.addEventListener('change', async (e) => {
            await loadSelectedRuleData(e.target.value);
            performCalculation();
        });
    }

    const calcExpenseProfileSelect = document.getElementById('calc-expense-profile');
    if (calcExpenseProfileSelect) {
        calcExpenseProfileSelect.addEventListener('change', async (e) => {
            await loadSelectedProfileData(e.target.value);
            performCalculation();
        });
    }

    // --- INITIAL LOAD ---
    async function initializeApp() {
        // CAMBIO: Cargar estado del modo oscuro al iniciar
        let isDark = localStorage.getItem('darkMode') === 'true';
        if (localStorage.getItem('darkMode') === null) {
            isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        updateDarkMode(isDark);

        await loadGlobalConfig();
        await loadClients();
        await loadFeeRules();
        await loadExpenseProfiles();
        await loadHistory();
        
        // Disparar eventos change en selects ocultos para cargar valores iniciales si es necesario
        const feeRuleSelect = document.getElementById('fee-rule-type');
        if (feeRuleSelect) {
            feeRuleSelect.dispatchEvent(new Event('change'));
        }
        const itemsDimDavModoSelect = document.getElementById('items_dim_dav_modo');
        if (itemsDimDavModoSelect) {
            itemsDimDavModoSelect.dispatchEvent(new Event('change'));
        }
    }
    initializeApp();
});
