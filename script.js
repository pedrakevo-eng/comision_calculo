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
    let currentCalculatorImagePath = null; // Path de la imagen del cliente seleccionado en la CALC
    let imageUploadBucket = 'recordatorios'; // El nombre de tu bucket de Storage

    // --- UI ELEMENTS ---
    const notification = document.getElementById('notification');
    const notificationMessage = document.getElementById('notification-message');
    
    // Elementos de la imagen (Burbuja y Visor)
    const imageBubbleBtn = document.getElementById('image-bubble-btn');
    const imageHoverOverlay = document.getElementById('image-hover-overlay');
    const hoverImage = document.getElementById('hover-image');

    // Elemento para el tipo de cambio
    const exchangeRateInput = document.getElementById('exchange-rate');

    // --- **** INICIO CAMBIO: Lógica de MODO OSCURO (Añadida) **** ---
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const sunIcon = document.getElementById('theme-sun-icon');
    const moonIcon = document.getElementById('theme-moon-icon');

    /**
     * Actualiza la UI y guarda la preferencia de tema.
     * @param {boolean} isDark - True si debe estar en modo oscuro.
     */
    const updateTheme = (isDark) => {
        // Aplica la clase .dark al tag <html>
        document.documentElement.classList.toggle('dark', isDark);
        
        // Actualiza los iconos del botón
        if (sunIcon && moonIcon) {
            sunIcon.classList.toggle('hidden', isDark);
            moonIcon.classList.toggle('hidden', !isDark);
        }
        
        // Guarda la preferencia en localStorage
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    };

    /**
     * Carga el tema inicial basándose en localStorage o preferencia del sistema.
     */
    const loadInitialTheme = () => {
        const savedTheme = localStorage.getItem('theme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        // Prioridad: 1. Tema guardado, 2. Preferencia del sistema
        const isDark = savedTheme === 'dark' || (savedTheme === null && systemPrefersDark);
        
        updateTheme(isDark);
    };

    // Añadir listener al botón de toggle
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            // Revisa si *actualmente* está en modo oscuro y lo invierte
            const isCurrentlyDark = document.documentElement.classList.contains('dark');
            updateTheme(!isCurrentlyDark);
        });
    }
    // --- **** FIN CAMBIO **** ---


    // --- NOTIFICATION FUNCTION ---
    const showNotification = (message, isError = false) => {
        notificationMessage.textContent = message;
        notification.className = `fixed bottom-5 right-5 text-white py-3 px-6 rounded-xl shadow-2xl text-base transition-all duration-300 transform z-[70]`; // z-index alto
        notification.classList.add(isError ? 'bg-rose-500' : 'bg-emerald-500');
        notification.classList.remove('opacity-0', 'translate-y-4');
        setTimeout(() => {
            notification.classList.add('opacity-0', 'translate-y-4');
        }, 3000);
    };

    // --- GLOBAL SETTINGS ---
    async function loadGlobalConfig() {
        const { data, error } = await supabase.from('config_global').select('tipo_cambio_bs_usd').eq('id', 1).single();

        if (error) {
            console.error('Error fetching global config:', error);
            showNotification('Error al cargar tipo de cambio', true);
            return null;
        }
        if (data) {
            exchangeRateInput.value = data.tipo_cambio_bs_usd;
        }
        return data ? data.tipo_cambio_bs_usd : null;
    }
    
    // --- CLIENTS DATA ---
    async function loadClients() {
        // Ahora 'select *' traerá también la ruta de la imagen
        const { data, error } = await supabase.from('clientes').select('*').order('nombre');
        
        if (error) {
            console.error('Error fetching clients:', error);
            showNotification('Error al cargar clientes: ' + error.message, true); // Error más específico
            return;
        }

        if (!data) {
            console.warn("Supabase no devolvió datos (data is null).");
            showNotification('No se recibieron datos de clientes.', true);
            return;
        }

        if (data.length === 0) {
            console.warn("Supabase devolvió una lista vacía. Revisa RLS (Seguridad) en tu tabla 'clientes'.");
            showNotification('No se encontraron clientes. Revisa la política RLS.', true); // Aviso para el usuario
        }
        
        currentClients = data;
        // renderClients() ha sido removido
        populateClientDropdowns();
    }
    
    function populateClientDropdowns() {
        // Solo poblamos el dropdown de la calculadora
        const select = document.getElementById('calc-client');
        if (!select) return; 

        const currentValue = select.value;
        select.innerHTML = `<option value="">Seleccione un cliente...</option>`;
        currentClients.forEach(client => {
            select.innerHTML += `<option value="${client.id}">${client.nombre}</option>`;
        });
        select.value = currentValue;
    }
    
    // --- FEE RULES DATA ---
    async function loadFeeRules() {
         const { data, error } = await supabase.from('config_comisiones_honorarios').select(`*, cliente:clientes(nombre)`).order('nombre_regla');
        if(error) {
            console.error('Error fetching fee rules:', error);
            showNotification('Error al cargar reglas de honorarios', true);
            return;
        }
        currentFeeRules = data;
        // renderFeeRules() ha sido removido
    }

    // --- EXPENSE PROFILE DATA ---
    async function loadExpenseProfiles() {
        const { data, error } = await supabase.from('config_perfil_gastos').select(`*, cliente:clientes(nombre)`).order('nombre_perfil');
        if (error) {
            showNotification('Error al cargar perfiles de gastos', true);
            return;
        }
        currentExpenseProfiles = data;
        // renderExpenseProfiles() ha sido removido
    }

    // --- REAL-TIME CALCULATOR ---
    const resultDiv = document.getElementById('calculation-result');
    const saveBtn = document.getElementById('save-calculation-btn');
    
    const debounce = (func, delay) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(func, delay);
    };

    function performCalculation() {
        saveBtn.classList.add('hidden');
        
        const client_id_val = document.getElementById('calc-client').value;
        const rule_id = document.getElementById('calc-fee-rule').value;
        const profile_id = document.getElementById('calc-expense-profile').value;
        const cif_local_val = document.getElementById('cif-local').value;

        if (!client_id_val || !rule_id || !profile_id || !cif_local_val || !selectedRuleData || !selectedProfileData) {
            resultDiv.innerHTML = '<p>Complete todos los campos para ver el cálculo.</p>';
            currentCalculationResult = null; // Limpiar resultado si los campos están incompletos
            return;
        }

        try {
            const cif_local = parseFloat(cif_local_val);
            const item_count = parseInt(document.getElementById('item-count').value) || 0;
            const includeRegularizacion = document.getElementById('calc-regularizacion').checked;
            const includeFrontera = document.getElementById('calc-frontera').checked;
            const includeDAM = document.getElementById('calc-dam').checked;
            const includeOtrosServicios = document.getElementById('calc-otros-servicios').checked;
            
            const exchangeRate = parseFloat(exchangeRateInput.value);
            if (!exchangeRate) throw new Error("Tipo de cambio no cargado.");

            const ruleData = selectedRuleData;
            const profileData = selectedProfileData;

            const cif_usd = cif_local / exchangeRate;
            
            const TASA_FACTURA = 0.149425287;
            let commission_bs_calculated = 0;
            const minimum_commission_bs = parseFloat(ruleData.comision_minima_usd) || 0;

            if (ruleData.tipo === 'directo') {
                commission_bs_calculated = (cif_usd * ruleData.porcentaje_directo) * exchangeRate;
            
            } else if (ruleData.tipo === 'directo_factura') {
                const resultado1 = cif_local * ruleData.porcentaje_directo;
                const resultado2 = resultado1 * TASA_FACTURA;
                commission_bs_calculated = resultado1 + resultado2;
            
            } else if (ruleData.tipo === 'escalonado' || ruleData.tipo === 'escalonado_factura') {
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

                let comision_base_escalonada = 0;
                if (applicableTier) {
                    if (applicableTier.porcentaje != null) {
                        comision_base_escalonada = Math.ceil(cif_local * parseFloat(applicableTier.porcentaje));
                    } else if (applicableTier.valor_fijo_usd != null) {
                        comision_base_escalonada = parseFloat(applicableTier.valor_fijo_usd);
                    }
                }
                commission_bs_calculated = comision_base_escalonada;
            }

            let commission_bs_final = 0;

            if (ruleData.tipo === 'escalonado_factura') {
                if (commission_bs_calculated > minimum_commission_bs) {
                    const resultado1 = commission_bs_calculated;
                    const resultado2 = resultado1 * TASA_FACTURA;
                    commission_bs_final = resultado1 + resultado2;
                } else {
                    commission_bs_final = minimum_commission_bs;
                }
            } else {
                commission_bs_final = Math.max(commission_bs_calculated, minimum_commission_bs);
            }
            
            commission_bs_final = Math.ceil(commission_bs_final);
            
            let totalExpensesBS = 0;
            const expenseItems = [];
            const conceptMapping = {
                gasto_despacho_fijo: "Gastos en Despacho", 
                // "otros_servicios_fijo" se quita de aquí
                carpeta_archivo_fijo: "Carpeta p/ Archivo",
                fotocopias_legalizadas_fijo: "Fotocopias Legalizadas", 
                cam_ind_y_com_monto: "CAM IND Y COM",
                escaneo_facturas_monto: "Escaneo Facturas", 
                servicio_transporte_monto: "Servicio Transporte", 
                serv_carguio_descarguio_monto: "SERV. DE TRAM. SENASAG/UNALAB",
                gtos_puerto_aspb_monto: "Gtos. Puerto ASPB", 
                seguro_monto: "Seguro"
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
            if (includeOtrosServicios) {
                const amount = parseFloat(profileData.otros_servicios_fijo) || 0;
                if (amount > 0) {
                    expenseItems.push({ concepto: 'Otros Servicios', monto_bs: amount });
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
            } else if (profileData.items_dim_dav_modo === 'POR_UMBRAL') {
                const limite = parseInt(profileData.items_dim_dav_umbral_limite) || 0;
                const amount = parseFloat(profileData.items_dim_dav_umbral_monto) || 0;
                if (item_count > limite && amount > 0) {
                    expenseItems.push({ concepto: `Items Dec. en DIM y DAV (Mayor a ${limite})`, monto_bs: amount });
                    totalExpensesBS += amount;
                }
            }
            
            // --- **** INICIO CAMBIO: Guardar datos para clipboard **** ---
            const honorarios_bs = commission_bs_final;
            const gastos_despacho_bs = parseFloat(profileData.gasto_despacho_fijo) || 0;
            // totalExpensesBS tiene la suma de *todos* los gastos (sin honorarios)
            const otros_gastos_bs = totalExpensesBS - gastos_despacho_bs; 
            // --- **** FIN CAMBIO **** ---

            const allItems = [ { concepto: 'Honorarios Agencia', monto_bs: commission_bs_final }, ...expenseItems];
            const total_bs = commission_bs_final + totalExpensesBS;
            const total_usd = total_bs / exchangeRate; // <-- CAMBIO 1: Esta línea ya NO está comentada.
            // const total_usd = total_bs / exchangeRate; // No se usa

            // Guardar resultado para el historial
            currentCalculationResult = {
                cliente_id: client_id_val, 
                cif_moneda_local: cif_local, 
                tipo_cambio_usado: exchangeRate, 
                cif_usd, 
                comision_total_usd: total_bs, // Reutilizamos esta columna para el total en Bs.
                items: allItems.map(item => ({ concepto: item.concepto, monto_usd: item.monto_bs })), // Reutilizamos esta columna para el monto en Bs.
            
                // --- **** INICIO CAMBIO: Guardar datos para clipboard **** ---
                clipboardData: {
                    honorarios: honorarios_bs,
                    gastos_despacho: gastos_despacho_bs,
                    otros_gastos: otros_gastos_bs
                }
                // --- **** FIN CAMBIO **** ---
            };

            // --- **** INICIO CAMBIO: Se quitaron todas las clases dark:* (del HTML) **** ---
            // Las clases dark:* ahora están en style.css
            let resultHTML = `<div class="space-y-4">
                    <div class="overflow-x-auto border border-slate-200 rounded-xl">
                        <table class="w-full text-left">
                            <thead class="bg-slate-100">
                                <tr>
                                    <th class="p-3 text-xs font-semibold tracking-wider uppercase text-slate-600">Concepto</th>
                                    <th class="p-3 text-xs font-semibold tracking-wider uppercase text-slate-600 text-right">Importe (Bs.)</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-200">`;
            allItems.sort((a,b) => a.concepto.localeCompare(b.concepto)).forEach(item => {
                resultHTML += `<tr class="hover:bg-slate-50">
                                    <td class="p-3 text-sm text-slate-700 whitespace-nowrap">${item.concepto}</td>
                                    <td class="p-3 text-sm text-slate-700 text-right font-mono">${item.monto_bs.toFixed(2)}</td>
                               </tr>`;
            });
            resultHTML += `</tbody>
                        </table>
                    </div>
                    <div class="mt-4 p-4 bg-teal-50 border border-teal-200 rounded-xl text-center">
                        <p class="text-base font-bold text-teal-800 uppercase">Total a Pagar</p>
                        <p class="text-4xl font-extrabold text-teal-800 tracking-tight font-mono">Bs. ${total_bs.toFixed(2)}</p>
                    </div>
                </div>`;
            // --- **** FIN CAMBIO **** ---
            
            resultDiv.innerHTML = resultHTML.replace(``, '');
            saveBtn.classList.remove('hidden');

        } catch (error) {
            console.error("Error during calculation:", error);
            resultDiv.innerHTML = `<p class="text-rose-500"><b>Error:</b> ${error.message}</p>`;
            currentCalculationResult = null; // Limpiar resultado en caso de error
        }
    }
    
    // --- EVENT LISTENERS PARA LA CALCULADORA ---
    const debouncedCalc = () => debounce(performCalculation, 400);
    document.getElementById('cif-local').addEventListener('input', debouncedCalc);
    document.getElementById('item-count').addEventListener('input', debouncedCalc);
    document.getElementById('calc-regularizacion').addEventListener('change', performCalculation);
    document.getElementById('calc-frontera').addEventListener('change', performCalculation);
    document.getElementById('calc-dam').addEventListener('change', performCalculation);
    document.getElementById('calc-otros-servicios').addEventListener('change', performCalculation); 
    
    // --- **** INICIO CAMBIO: Funciones de Guardar y Copiar (Enter) **** ---

    // Función para guardar el cálculo
    async function saveCurrentCalculation(showSaveNotification = true) {
        if (!currentCalculationResult) {
            if (showSaveNotification) showNotification('No hay cálculo para guardar', true);
            return false;
        }
        
        // Excluir clipboardData del objeto que se guarda en Supabase
        const { items, clipboardData, ...header } = currentCalculationResult;
        
        const { data: newHeader, error: headerError } = await supabase.from('calculos_historial').insert(header).select('id').single();
        if (headerError) { 
            if (showSaveNotification) showNotification('Error al guardar cabecera del cálculo', true); 
            console.error(headerError);
            return false; 
        }
        
        // 'monto_usd' en la BD se usa para 'monto_bs'
        
        const itemsToInsert = items.map(item => ({ 
            concepto: item.concepto, 
            monto_usd: item.monto_usd, 
            calculo_id: newHeader.id 
        }));

        const { error: itemsError } = await supabase.from('calculos_historial_items').insert(itemsToInsert);
        
        if (itemsError) {
            if (showSaveNotification) showNotification('Error al guardar detalle del cálculo', true);
            console.error(itemsError); // Esto es lo que genera el error 400 en la consola
            return false;
        } else {
            if (showSaveNotification) showNotification('Cálculo guardado con éxito');
            saveBtn.classList.add('hidden');
            // No reseteamos currentCalculationResult aquí, lo hace la función que llama
            return true;
        }
    }

    // Listener para el botón de guardar (clic)
    saveBtn.addEventListener('click', async () => {
        const saved = await saveCurrentCalculation(true);
        if (saved) {
            currentCalculationResult = null; // Limpiar solo si se guarda con clic
        }
    });

    // Listener para la tecla "Enter"
    document.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Evitar cualquier acción default (como submit)

            if (!currentCalculationResult || !currentCalculationResult.clipboardData) {
                showNotification('No hay datos calculados para copiar o guardar', true);
                return;
            }

            // 1. Guardar el estado actual antes de resetearlo
            const calculationToCopy = currentCalculationResult;

            // 2. Guardar en el historial (sin notificación de guardado)
            const saved = await saveCurrentCalculation(false); 
            
            if (!saved) {
                showNotification('Error al guardar, no se pudo copiar.', true);
                return; // Si no se guarda, no copiamos
            }

            // 3. Preparar datos para el portapapeles
            const data = calculationToCopy.clipboardData;
            
            // --- **** INICIO CAMBIO: Reemplazar punto por coma **** ---
            const honorarios = data.honorarios.toFixed(2).replace('.', ',');
            const gastos_despacho = data.gastos_despacho.toFixed(2).replace('.', ',');
            const otros_gastos = data.otros_gastos.toFixed(2).replace('.', ',');
            // --- **** FIN CAMBIO **** ---
            
            // Formato para Excel (separado por tabs)
            const clipboardText = `${honorarios}\t${gastos_despacho}\t${otros_gastos}`;

            // 4. Copiar al portapapeles (usar 'execCommand' por compatibilidad con iframes)
            try {
                const textarea = document.createElement('textarea');
                textarea.value = clipboardText;
                textarea.style.position = 'fixed'; // Evitar que se vea
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                
                showNotification('Cálculo guardado y copiado al portapapeles');
                
            } catch (err) {
                console.error('Error al copiar al portapapeles:', err);
                showNotification('Cálculo guardado (error al copiar)', true);
            }
            
            // 5. Limpiar el resultado actual
            currentCalculationResult = null;
        }
    });
    // --- **** FIN CAMBIO **** ---

    // --- HISTORY ---
    // No necesitamos cargar el historial, solo guardar, así que loadHistory() y renderHistory() se remueven.

    // --- HELPER FUNCTIONS PATA CARGAR DATOS DE LA CALCULADORA ---
    async function loadSelectedRuleData(ruleId) {
        selectedRuleData = null;
        if (!ruleId) return;
        const { data: rule, error } = await supabase.from('config_comisiones_honorarios').select('*').eq('id', ruleId).single();
        if (error) { 
            showNotification('Error al cargar datos de la regla', true); 
            return; 
        }
        if (rule.tipo === 'escalonado' || rule.tipo === 'escalonado_factura') {
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

    // --- DROPDOWNS DINÁMICOS Y LÓGICA DE LA BURBUJA ---
    document.getElementById('calc-client').addEventListener('change', async (e) => {
        const clientId = e.target.value;
        const fieldsToToggle = ['calc-fee-rule', 'calc-expense-profile', 'cif-local', 'item-count', 'calc-regularizacion', 'calc-frontera', 'calc-dam', 'calc-otros-servicios'];
        fieldsToToggle.forEach(id => document.getElementById(id).disabled = true);
        
        const clientInfoP = document.getElementById('calc-client-info');

        selectedRuleData = null;
        selectedProfileData = null;
        const feeRuleSelect = document.getElementById('calc-fee-rule');
        const expenseProfileSelect = document.getElementById('calc-expense-profile');

        if (!clientId) {
            feeRuleSelect.innerHTML = `<option value="">Seleccione un cliente</option>`;
            expenseProfileSelect.innerHTML = `<option value="">Seleccione un cliente</option>`;
            performCalculation();
            
            imageBubbleBtn.classList.add('hidden');
            currentCalculatorImagePath = null;
            clientInfoP.textContent = ''; // Limpiar info
            return;
        }

        fieldsToToggle.forEach(id => document.getElementById(id).disabled = false);

        const { data: rules } = await supabase.from('config_comisiones_honorarios').select('id, nombre_regla').eq('cliente_id', clientId);
        feeRuleSelect.innerHTML = '<option value="">Seleccione una regla...</option>';
        rules.forEach(rule => { feeRuleSelect.innerHTML += `<option value="${rule.id}">${rule.nombre_regla}</option>`; });
        
        const { data: profiles } = await supabase.from('config_perfil_gastos').select('id, nombre_perfil').eq('cliente_id', clientId);
        expenseProfileSelect.innerHTML = '<option value="">Seleccione un perfil...</option>';
        profiles.forEach(profile => { expenseProfileSelect.innerHTML += `<option value="${profile.id}">${profile.nombre_perfil}</option>`; });
        
        if (rules && rules.length > 0) {
            feeRuleSelect.value = rules[0].id;
            await loadSelectedRuleData(rules[0].id);
        } else {
             await loadSelectedRuleData(null); // Asegurarse de limpiar
        }

        if (profiles && profiles.length > 0) {
            expenseProfileSelect.value = profiles[0].id;
            await loadSelectedProfileData(profiles[0].id);
        } else {
            await loadSelectedProfileData(null); // Asegurarse de limpiar
        }
        
        // Actualizar burbuja e info del cliente
        const selectedClient = currentClients.find(c => c.id === clientId);
        currentCalculatorImagePath = selectedClient ? selectedClient.imagen_recordatorio_path : null;
        imageBubbleBtn.classList.toggle('hidden', !currentCalculatorImagePath);
        
        if (selectedClient && selectedClient.informacion_adicional) {
            clientInfoP.textContent = `Info: ${selectedClient.informacion_adicional}`;
        } else {
            clientInfoP.textContent = '';
        }

        performCalculation();
    });

    document.getElementById('calc-fee-rule').addEventListener('change', async (e) => {
        await loadSelectedRuleData(e.target.value);
        performCalculation();
    });

    document.getElementById('calc-expense-profile').addEventListener('change', async (e) => {
        await loadSelectedProfileData(e.target.value);
        performCalculation();
    });


    // --- LÓGICA PARA VER IMAGEN DE LA BURBUJA (AL CLIC) ---
    imageBubbleBtn.addEventListener('click', () => {
        if (currentCalculatorImagePath) {
            const { data } = supabase.storage.from(imageUploadBucket).getPublicUrl(currentCalculatorImagePath);
            if (data.publicUrl) {
                hoverImage.src = `${data.publicUrl}?t=${new Date().getTime()}`;
                imageHoverOverlay.classList.remove('opacity-0', 'pointer-events-none');
            }
        }
    });

    // Clic en el overlay (fondo oscuro) para CERRAR
    imageHoverOverlay.addEventListener('click', () => {
        imageHoverOverlay.classList.add('opacity-0', 'pointer-events-none');
        hoverImage.src = ''; // Detener la carga
    });
    // --- FIN LÓGICA DE IMAGEN ---


    // --- INITIAL LOAD ---
    async function initializeApp() {
        // --- **** INICIO CAMBIO: Cargar tema (Añadido) **** ---
        loadInitialTheme();
        // --- **** FIN CAMBIO **** ---
        
        await loadGlobalConfig();
        await loadClients();
        await loadFeeRules();
        await loadExpenseProfiles();
        // loadHistory() y renderHistory() han sido removidos
    }
    initializeApp();
});