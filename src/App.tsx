import { useState, useEffect, useMemo } from 'react';

// Interfaces for our data structure
interface Modalities {
  input: string[];
  output: string[];
}

interface Limits {
  context?: number;
  input?: number;
  output?: number;
}

interface Cost {
  input?: number;
  output?: number;
  reasoning?: number;
  cache_read?: number;
  cache_write?: number;
  input_audio?: number;
  output_audio?: number;
}

interface RawModel {
  name: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
  open_weights?: boolean;
  modalities?: Modalities;
  limit?: Limits;
  cost?: Cost;
  status?: string;
}

interface RawProvider {
  name: string;
  npm: string;
  env: string[];
  doc: string;
  api?: string;
  models: { [modelId: string]: RawModel };
}

interface RawApiResponse {
  [providerId: string]: RawProvider;
}

interface FlattenedModel {
  providerId: string;
  providerName: string;
  providerNpm: string;
  providerDoc: string;
  providerApi?: string;
  id: string; // unique full ID (e.g. "openai/gpt-4o")
  modelKey: string; // the subkey inside models (e.g. "gpt-4o")
  name: string;
  family?: string;
  attachment: boolean;
  reasoning: boolean;
  tool_call: boolean;
  structured_output: boolean;
  temperature: boolean;
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
  open_weights: boolean;
  modalities: {
    input: string[];
    output: string[];
  };
  limit: {
    context: number;
    input: number;
    output: number;
  };
  cost: {
    input: number;
    output: number;
    reasoning: number;
    cache_read: number;
    cache_write: number;
    input_audio: number;
    output_audio: number;
  };
  status?: string;
}

// ============================================================
// SIMPLE_PROVIDERS — IDs de proveedores para la versión simple
// Usa provider-selector.html para elegirlos y pegar el array aquí.
// Si el array está vacío, el modo simple mostrará TODOS los proveedores.
// ============================================================
const SIMPLE_PROVIDERS: string[] = [
  "302ai",
  "abacus",
  "alibaba",
  "alibaba-coding-plan",
  "amazon-bedrock",
  "anthropic",
  "azure",
  "cerebras",
  "deepseek",
  "github-models",
  "google",
  "groq",
  "huggingface",
  "kilo",
  "kimi-for-coding",
  "llama",
  "lmstudio",
  "minimax",
  "minimax-coding-plan",
  "mistral",
  "nvidia",
  "ollama-cloud",
  "openai",
  "openrouter",
  "perplexity",
  "poe",
  "xai",
  "xiaomi",
  "xiaomi-token-plan-ams",
  "zai",
  "zai-coding-plan"
];

export default function App() {
  // Application State
  const [allModels, setAllModels] = useState<FlattenedModel[]>([]);
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState<boolean>(true);

  // Simple/Complete mode toggle (persisted in localStorage)
  const [isSimpleMode, setIsSimpleMode] = useState<boolean>(() => {
    return localStorage.getItem('costes-api-simple-mode') === 'true';
  });

  // Tabs: 'explorer' | 'comparison' | 'analytics'
  const [activeTab, setActiveTab] = useState<'explorer' | 'comparison' | 'analytics'>('explorer');

  // Filters State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [providerSearch, setProviderSearch] = useState<string>('');
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [minContext, setMinContext] = useState<number>(0);
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);
  const [selectedModalities, setSelectedModalities] = useState<string[]>([]);
  const [onlyFreeModels, setOnlyFreeModels] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Sorting
  const [sortBy, setSortBy] = useState<'simulatedCost' | 'inputCost' | 'outputCost' | 'context' | 'releaseDate'>('releaseDate');

  // Cost Simulator Inputs
  const [simulator, setSimulator] = useState({
    inputTokens: 100000,
    outputTokens: 20000,
    reasoningTokens: 5000,
    cacheReadTokens: 40000,
    cacheWriteTokens: 10000,
    apiCalls: 50
  });

  // Selected Models for Comparison (store their full IDs)
  const [comparisonList, setComparisonList] = useState<string[]>([]);

  // Selected Model for Spec Drawer/Modal
  const [selectedModelDetails, setSelectedModelDetails] = useState<FlattenedModel | null>(null);

  // Toggle simple mode and persist preference
  const toggleSimpleMode = (value: boolean) => {
    setIsSimpleMode(value);
    localStorage.setItem('costes-api-simple-mode', String(value));
    if (value) {
      // Clear filters not available in simple mode
      setSelectedModalities([]);
      setMinContext(0);
      if (SIMPLE_PROVIDERS.length > 0) {
        setSelectedProviders(prev => prev.filter(id => SIMPLE_PROVIDERS.includes(id)));
      }
    }
  };

  // Fetch Data on Load
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        // Try fetching live API
        let response = await fetch('https://models.dev/api.json');
        let data: RawApiResponse;
        
        if (response.ok) {
          data = await response.json();
          setIsLive(true);
        } else {
          throw new Error('Live API request failed');
        }
        processApiData(data);
      } catch (err) {
        console.warn('Failed to load live data, trying fallback...', err);
        try {
          // Fallback to local copy
          let response = await fetch('/fallback_api.json');
          if (response.ok) {
            let data = await response.json();
            setIsLive(false);
            processApiData(data);
          } else {
            throw new Error('Local fallback JSON not found');
          }
        } catch (fallbackErr: any) {
          setError(fallbackErr.message || 'Failed to fetch model specifications');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Process and flatten raw API response
  const processApiData = (data: RawApiResponse) => {
    const modelList: FlattenedModel[] = [];
    const providerList: { id: string; name: string }[] = [];

    Object.entries(data).forEach(([provId, provData]) => {
      const providerNameLower = provData.name.toLowerCase();
      const providerIdLower = provId.toLowerCase();
      
      // Exclude providers containing "china" (not available in Spain)
      if (providerNameLower.includes('china') || providerIdLower.includes('china')) {
        return;
      }

      providerList.push({ id: provId, name: provData.name });

      if (provData.models) {
        Object.entries(provData.models).forEach(([modelKey, modelData]) => {
          // Normalization & Fallbacks
          const limitContext = modelData.limit?.context ?? 0;
          
          const flatModel: FlattenedModel = {
            providerId: provId,
            providerName: provData.name,
            providerNpm: provData.npm,
            providerDoc: provData.doc,
            providerApi: provData.api,
            id: `${provId}/${modelKey}`,
            modelKey: modelKey,
            name: modelData.name || modelKey,
            family: modelData.family,
            attachment: !!modelData.attachment,
            reasoning: !!modelData.reasoning,
            tool_call: !!modelData.tool_call,
            structured_output: !!modelData.structured_output,
            temperature: modelData.temperature !== false, // default true
            knowledge: modelData.knowledge,
            release_date: modelData.release_date,
            last_updated: modelData.last_updated,
            open_weights: !!modelData.open_weights,
            status: modelData.status,
            modalities: {
              input: modelData.modalities?.input || ['text'],
              output: modelData.modalities?.output || ['text']
            },
            limit: {
              context: limitContext,
              input: modelData.limit?.input ?? limitContext,
              output: modelData.limit?.output ?? 0
            },
            cost: {
              input: modelData.cost?.input ?? 0,
              output: modelData.cost?.output ?? 0,
              reasoning: modelData.cost?.reasoning ?? modelData.cost?.output ?? 0,
              cache_read: modelData.cost?.cache_read ?? 0,
              cache_write: modelData.cost?.cache_write ?? 0,
              input_audio: modelData.cost?.input_audio ?? 0,
              output_audio: modelData.cost?.output_audio ?? 0
            }
          };
          modelList.push(flatModel);
        });
      }
    });

    // Sort providers by name alphabetically
    providerList.sort((a, b) => a.name.localeCompare(b.name));

    setAllModels(modelList);
    setProviders(providerList);
  };

  // Cost calculator helper function
  const calculateSimulatedCost = (model: FlattenedModel) => {
    const { inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, apiCalls } = simulator;
    
    // Uncached inputs are billed at input rate
    const uncachedInput = Math.max(0, inputTokens - cacheReadTokens);
    const inputBaseCost = (uncachedInput * model.cost.input) / 1000000;
    
    // Caching costs
    const cacheReadCost = (cacheReadTokens * model.cost.cache_read) / 1000000;
    const cacheWriteCost = (cacheWriteTokens * model.cost.cache_write) / 1000000;

    let outputBaseCost = 0;
    let reasoningCost = 0;

    if (model.reasoning) {
      // If reasoning model, reasoning tokens are billed at reasoning rate (or output rate as fallback)
      reasoningCost = (reasoningTokens * model.cost.reasoning) / 1000000;
      const nonReasoningOutput = Math.max(0, outputTokens - reasoningTokens);
      outputBaseCost = (nonReasoningOutput * model.cost.output) / 1000000;
    } else {
      // Normal output
      outputBaseCost = (outputTokens * model.cost.output) / 1000000;
    }

    const costPerCall = inputBaseCost + cacheReadCost + cacheWriteCost + reasoningCost + outputBaseCost;
    return costPerCall * apiCalls;
  };

  // Filter providers based on search query and mode
  const filteredProvidersForSelect = useMemo(() => {
    let list = providers;
    // In simple mode, restrict to SIMPLE_PROVIDERS (if any defined)
    if (isSimpleMode && SIMPLE_PROVIDERS.length > 0) {
      list = list.filter(p => SIMPLE_PROVIDERS.includes(p.id));
    }
    return list.filter(p => p.name.toLowerCase().includes(providerSearch.toLowerCase()));
  }, [providers, providerSearch, isSimpleMode]);

  // Count of providers to display in the header/label
  const displayProvidersCount = useMemo(() => {
    if (isSimpleMode && SIMPLE_PROVIDERS.length > 0) {
      return providers.filter(p => SIMPLE_PROVIDERS.includes(p.id)).length;
    }
    return providers.length;
  }, [providers, isSimpleMode]);

  // Helper functions or constants can go here if needed

  // Filter and Sort Models
  const processedModels = useMemo(() => {
    let result = [...allModels];

    // 1. Text Search Filter (name, family, provider, or raw id)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => 
        m.name.toLowerCase().includes(q) ||
        m.providerName.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.family && m.family.toLowerCase().includes(q))
      );
    }

    // 2. Date filter
    if (isSimpleMode) {
      // Simple mode: only last 4 months (dynamic)
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
      const cutoff = fourMonthsAgo.toISOString().split('T')[0];
      result = result.filter(m => {
        if (!m.release_date) return true; // keep if date unknown
        return m.release_date >= cutoff;
      });
    } else {
      // Complete mode (V1): fixed date filter
      result = result.filter(m => {
        if (!m.release_date) return true;
        return m.release_date >= '2025-08-05';
      });
    }

    // 2a. In simple mode with SIMPLE_PROVIDERS configured, filter by provider list
    if (isSimpleMode && SIMPLE_PROVIDERS.length > 0) {
      result = result.filter(m => SIMPLE_PROVIDERS.includes(m.providerId));
    }

    // 2b. Exclude Paid Models
    if (onlyFreeModels) {
      result = result.filter(m => m.cost.input === 0 && m.cost.output === 0);
    }

    // 2c. Exclude Providers containing "china" (not available in Spain)
    result = result.filter(m => {
      const providerNameLower = m.providerName.toLowerCase();
      const providerIdLower = m.providerId.toLowerCase();
      return !providerNameLower.includes('china') && !providerIdLower.includes('china');
    });

    // 3. Provider Filters
    if (selectedProviders.length > 0) {
      result = result.filter(m => selectedProviders.includes(m.providerId));
    }

    // 4. Min Context Limit Filter
    if (!isSimpleMode && minContext > 0) {
      result = result.filter(m => m.limit.context >= minContext);
    }

    // 5. Capability Filters
    if (selectedCapabilities.length > 0) {
      result = result.filter(m => {
        return selectedCapabilities.every(cap => {
          if (cap === 'reasoning') return m.reasoning;
          if (cap === 'tool_call') return m.tool_call;
          if (cap === 'attachment') return m.attachment;
          if (cap === 'open_weights') return m.open_weights;
          if (cap === 'structured_output') return m.structured_output;
          return true;
        });
      });
    }

    // 6. Modality Filters
    if (selectedModalities.length > 0) {
      result = result.filter(m => {
        return selectedModalities.every(mod => {
          return m.modalities.input.includes(mod) || m.modalities.output.includes(mod);
        });
      });
    }

    // 7. Sorting Logic
    result.sort((a, b) => {
      if (sortBy === 'simulatedCost') {
        const costA = calculateSimulatedCost(a);
        const costB = calculateSimulatedCost(b);
        // Put models with valid pricing first
        if (costA === 0 && costB > 0) return 1;
        if (costB === 0 && costA > 0) return -1;
        return costA - costB;
      }
      if (sortBy === 'inputCost') {
        return a.cost.input - b.cost.input;
      }
      if (sortBy === 'outputCost') {
        return a.cost.output - b.cost.output;
      }
      if (sortBy === 'context') {
        return b.limit.context - a.limit.context; // highest context first
      }
      if (sortBy === 'releaseDate') {
        const dateA = a.release_date ? new Date(a.release_date).getTime() : 0;
        const dateB = b.release_date ? new Date(b.release_date).getTime() : 0;
        return dateB - dateA; // newest first
      }
      return 0;
    });

    return result;
  }, [allModels, searchQuery, selectedProviders, minContext, selectedCapabilities, selectedModalities, sortBy, simulator, onlyFreeModels, isSimpleMode]);

  // Models selected for comparison
  const comparisonModels = useMemo(() => {
    let list = allModels.filter(m => comparisonList.includes(m.id));
    if (isSimpleMode) {
      if (SIMPLE_PROVIDERS.length > 0) {
        list = list.filter(m => SIMPLE_PROVIDERS.includes(m.providerId));
      }
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
      const cutoff = fourMonthsAgo.toISOString().split('T')[0];
      list = list.filter(m => !m.release_date || m.release_date >= cutoff);
    }
    return list;
  }, [allModels, comparisonList, isSimpleMode]);

  // Toggle model in comparison list
  const toggleComparison = (id: string) => {
    setComparisonList(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Helper to format context windows cleanly
  const formatContextSize = (size: number) => {
    if (size === 0) return 'N/A';
    if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M`;
    if (size >= 1000) return `${Math.round(size / 1000)}K`;
    return size.toString();
  };

  // Slider change helper
  const handleSimInput = (key: string, value: number) => {
    setSimulator(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Helper to check if fallback image is needed
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.src = 'https://models.dev/logos/openai.svg'; // default logo fallback
    e.currentTarget.style.filter = 'grayscale(1) opacity(0.5)';
  };

  return (
    <>
      {/* Header */}
      <header className="app-header">
        <div className="logo-section">
          <img src="https://models.dev/logos/openai.svg" alt="Models.dev logo" onError={handleImageError} />
          <div>
            <h1>Costes API Modelos</h1>
          </div>
        </div>

        <nav className="tabs-navigation">
          <button 
            className={`tab-btn ${activeTab === 'explorer' ? 'active' : ''}`}
            onClick={() => setActiveTab('explorer')}
          >
            Explorador de Modelos
          </button>
          <button 
            className={`tab-btn ${activeTab === 'comparison' ? 'active' : ''}`}
            onClick={() => setActiveTab('comparison')}
          >
            Comparar ({comparisonList.length})
          </button>
          <button 
            className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            Gráficos e Histograma
          </button>
        </nav>

        <div className="header-meta">
          {/* Simple / Complete mode toggle */}
          <div className="mode-toggle-wrapper" title={isSimpleMode ? 'Cambiar a Versión Completa' : 'Cambiar a Versión Simple'}>
            <span className={`mode-label ${!isSimpleMode ? 'active-label' : ''}`}>Completa</span>
            <button
              className={`mode-toggle ${isSimpleMode ? 'simple' : 'complete'}`}
              onClick={() => toggleSimpleMode(!isSimpleMode)}
              aria-label="Cambiar modo"
            >
              <span className="mode-toggle-thumb" />
            </button>
            <span className={`mode-label ${isSimpleMode ? 'active-label' : ''}`}>Simple</span>
          </div>

          <div className="api-status">
            <span className={`status-dot ${isLive ? 'live' : 'fallback'}`}></span>
            {isLive ? 'Datos en Vivo' : 'Datos Locales'}
          </div>
          <div className="stat-badge">
            Modelos: <span>{allModels.length}</span>
          </div>
        </div>

        {/* Mobile Header Actions */}
        <div className="mobile-header-actions">
          <button className="mobile-filter-toggle" onClick={() => setIsSidebarOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="21" x2="4" y2="14"></line>
              <line x1="4" y1="10" x2="4" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12" y2="3"></line>
              <line x1="20" y1="21" x2="20" y2="16"></line>
              <line x1="20" y1="12" x2="20" y2="3"></line>
              <line x1="1" y1="14" x2="7" y2="14"></line>
              <line x1="9" y1="8" x2="15" y2="8"></line>
              <line x1="17" y1="16" x2="23" y2="16"></line>
            </svg>
            <span>Filtros</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="app-body">
        {/* Mobile Backdrop */}
        <div className={`sidebar-backdrop ${isSidebarOpen ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)} />

        {/* Left Sidebar (Filters and Simulator) */}
        <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header-mobile">
            <span>Filtros y Simulador</span>
            <button className="close-sidebar-btn" onClick={() => setIsSidebarOpen(false)}>
              &times;
            </button>
          </div>
          {/* Text Search */}
          <div className="sidebar-section">
            <label className="sidebar-title">Búsqueda rápida</label>
            <div className="search-container">
              <input 
                type="text" 
                className="search-input" 
                placeholder="Nombre, proveedor o familia..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <div style={{ marginTop: '0.4rem' }}>
              <label className="checkbox-label" style={{ fontWeight: 600, color: 'var(--color-secondary)' }}>
                <input 
                  type="checkbox"
                  checked={onlyFreeModels}
                  onChange={(e) => setOnlyFreeModels(e.target.checked)}
                />
                Solo modelos gratuitos
              </label>
            </div>
          </div>

          <div className="sidebar-section">
            <label className="sidebar-title">Proveedores ({isSimpleMode && SIMPLE_PROVIDERS.length > 0 ? displayProvidersCount : providers.length})</label>
            <input 
              type="text" 
              className="search-input" 
              placeholder="Filtrar proveedores..." 
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem', marginBottom: '0.4rem' }}
              value={providerSearch}
              onChange={(e) => setProviderSearch(e.target.value)}
            />
            <div className="checkbox-list">
              {filteredProvidersForSelect.map(prov => (
                <label key={prov.id} className="checkbox-label">
                  <input 
                    type="checkbox"
                    checked={selectedProviders.includes(prov.id)}
                    onChange={() => {
                      setSelectedProviders(prev => 
                        prev.includes(prov.id) ? prev.filter(id => id !== prov.id) : [...prev, prov.id]
                      );
                    }}
                  />
                  {prov.name}
                </label>
              ))}
              {filteredProvidersForSelect.length === 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Sin proveedores coincidentes
                </div>
              )}
            </div>
            {selectedProviders.length > 0 && (
              <button 
                onClick={() => setSelectedProviders([])}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.75rem', cursor: 'pointer', textAlign: 'left', padding: '0' }}
              >
                Limpiar selección
              </button>
            )}
          </div>

          {/* Context Window Limit Slider */}
          {!isSimpleMode && (
            <div className="sidebar-section">
              <label className="sidebar-title">Límite de contexto mínimo</label>
              <div className="range-container">
                <input 
                  type="range" 
                  className="range-slider"
                  min="0" 
                  max="200000" 
                  step="4000"
                  value={minContext}
                  onChange={(e) => setMinContext(parseInt(e.target.value))}
                />
                <div className="range-labels">
                  <span>Cualquiera</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-secondary)' }}>
                    {formatContextSize(minContext)}
                  </span>
                  <span>200K+</span>
                </div>
              </div>
            </div>
          )}

          {/* Capability Filters */}
          <div className="sidebar-section">
            <label className="sidebar-title">Capacidades del modelo</label>
            <div className="tags-container">
              {[
                { id: 'reasoning', label: 'Razonamiento (CoT)' },
                { id: 'tool_call', label: 'Llamada a herramientas' },
                { id: 'attachment', label: 'Archivos adjuntos' },
                { id: 'open_weights', label: 'Pesos abiertos (Open)' },
                { id: 'structured_output', label: 'Salida estructurada' }
              ].map(cap => (
                <button
                  key={cap.id}
                  className={`filter-tag ${selectedCapabilities.includes(cap.id) ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedCapabilities(prev =>
                      prev.includes(cap.id) ? prev.filter(id => id !== cap.id) : [...prev, cap.id]
                    );
                  }}
                >
                  {cap.label}
                </button>
              ))}
            </div>
          </div>

          {/* Modalities — hidden in simple mode */}
          {!isSimpleMode && (
            <div className="sidebar-section">
              <label className="sidebar-title">Modalidades de datos</label>
              <div className="tags-container">
                {[
                  { id: 'image', label: 'Imágenes (Visión)' },
                  { id: 'audio', label: 'Audio' },
                  { id: 'video', label: 'Video' },
                  { id: 'pdf', label: 'Documentos PDF' }
                ].map(mod => (
                  <button
                    key={mod.id}
                    className={`filter-tag ${selectedModalities.includes(mod.id) ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedModalities(prev =>
                        prev.includes(mod.id) ? prev.filter(id => id !== mod.id) : [...prev, mod.id]
                      );
                    }}
                  >
                    {mod.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cost Simulator */}
          <div className="sidebar-section" style={{ marginTop: 'auto' }}>
            <div className="simulator-panel">
              <label className="sidebar-title">Simulador de Costes API</label>
              
              <div className="sim-input-group">
                <div className="sim-input-header">
                  <span>Tokens de Entrada</span>
                  <span className="sim-value-badge">{simulator.inputTokens.toLocaleString()}</span>
                </div>
                <div className="sim-slider-row">
                  <input 
                    type="range" 
                    min="1000" 
                    max="500000" 
                    step="5000"
                    value={simulator.inputTokens}
                    onChange={(e) => handleSimInput('inputTokens', parseInt(e.target.value))}
                  />
                  <input 
                    type="number"
                    value={simulator.inputTokens}
                    onChange={(e) => handleSimInput('inputTokens', Math.max(0, parseInt(e.target.value) || 0))}
                  />
                </div>
              </div>

              <div className="sim-input-group">
                <div className="sim-input-header">
                  <span>Tokens de Salida</span>
                  <span className="sim-value-badge">{simulator.outputTokens.toLocaleString()}</span>
                </div>
                <div className="sim-slider-row">
                  <input 
                    type="range" 
                    min="500" 
                    max="100000" 
                    step="500"
                    value={simulator.outputTokens}
                    onChange={(e) => handleSimInput('outputTokens', parseInt(e.target.value))}
                  />
                  <input 
                    type="number"
                    value={simulator.outputTokens}
                    onChange={(e) => handleSimInput('outputTokens', Math.max(0, parseInt(e.target.value) || 0))}
                  />
                </div>
              </div>

              <div className="sim-input-group">
                <div className="sim-input-header">
                  <span>Tokens de Razonamiento</span>
                  <span className="sim-value-badge">{simulator.reasoningTokens.toLocaleString()}</span>
                </div>
                <div className="sim-slider-row">
                  <input 
                    type="range" 
                    min="0" 
                    max="50000" 
                    step="500"
                    value={simulator.reasoningTokens}
                    onChange={(e) => handleSimInput('reasoningTokens', parseInt(e.target.value))}
                  />
                  <input 
                    type="number"
                    value={simulator.reasoningTokens}
                    onChange={(e) => handleSimInput('reasoningTokens', Math.max(0, parseInt(e.target.value) || 0))}
                  />
                </div>
              </div>

              <div className="sim-input-group">
                <div className="sim-input-header">
                  <span>Caché Read Tokens</span>
                  <span className="sim-value-badge">{simulator.cacheReadTokens.toLocaleString()}</span>
                </div>
                <div className="sim-slider-row">
                  <input 
                    type="range" 
                    min="0" 
                    max="500000" 
                    step="5000"
                    value={simulator.cacheReadTokens}
                    onChange={(e) => handleSimInput('cacheReadTokens', parseInt(e.target.value))}
                  />
                  <input 
                    type="number"
                    value={simulator.cacheReadTokens}
                    onChange={(e) => handleSimInput('cacheReadTokens', Math.max(0, parseInt(e.target.value) || 0))}
                  />
                </div>
              </div>

              <div className="sim-input-group">
                <div className="sim-input-header">
                  <span>Llamadas Mensuales</span>
                  <span className="sim-value-badge">{simulator.apiCalls.toLocaleString()}</span>
                </div>
                <div className="sim-slider-row">
                  <input 
                    type="range" 
                    min="1" 
                    max="50000" 
                    step="100"
                    value={simulator.apiCalls}
                    onChange={(e) => handleSimInput('apiCalls', parseInt(e.target.value))}
                  />
                  <input 
                    type="number"
                    value={simulator.apiCalls}
                    onChange={(e) => handleSimInput('apiCalls', Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Main Content */}
        <main className="main-content">
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '4rem' }}>
              <div style={{ border: '4px solid rgba(255,255,255,0.05)', borderTop: '4px solid var(--color-primary)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', marginBottom: '1rem' }}></div>
              <p style={{ color: 'var(--text-secondary)' }}>Cargando especificaciones y precios de modelos...</p>
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {error && !loading && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-danger)', borderRadius: 'var(--border-radius-md)', padding: '2rem', textAlign: 'center' }}>
              <h3 style={{ color: 'var(--color-danger)', marginBottom: '0.5rem' }}>Error al Cargar los Datos</h3>
              <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* TAB 1: MODEL EXPLORER */}
              {activeTab === 'explorer' && (
                <>
                  <div className="explorer-header-actions">
                    <div className="models-count">
                      Mostrando <span>{processedModels.length}</span> de {allModels.length} modelos disponibles
                    </div>
                    
                    <div className="sort-select-container">
                      <span>Ordenar por:</span>
                      <select 
                        className="sort-select" 
                        value={sortBy} 
                        onChange={(e: any) => setSortBy(e.target.value)}
                      >
                        <option value="simulatedCost">Precio Estimado (Más barato)</option>
                        <option value="inputCost">Precio Entrada (1M tokens)</option>
                        <option value="outputCost">Precio Salida (1M tokens)</option>
                        <option value="context">Límite de Contexto</option>
                        <option value="releaseDate">Fecha de Lanzamiento</option>
                      </select>
                    </div>
                  </div>

                  {processedModels.length === 0 ? (
                    <div className="comparison-empty">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                      <h3>No se encontraron modelos</h3>
                      <p>Prueba a cambiar los filtros o a reducir la exigencia de límites en la barra lateral.</p>
                    </div>
                  ) : (
                    <div className="models-grid">
                      {processedModels.slice(0, 100).map(model => {
                        const simCost = calculateSimulatedCost(model);
                        const hasCost = model.cost.input > 0 || model.cost.output > 0;

                        return (
                          <div key={model.id} className="model-card">
                            <div className="card-header">
                              <div className="model-info-block">
                                <div className="provider-logo-row">
                                  <img 
                                    className="provider-mini-logo" 
                                    src={`https://models.dev/logos/${model.providerId}.svg`} 
                                    alt={model.providerName}
                                    onError={handleImageError}
                                  />
                                  <span>{model.providerName}</span>
                                </div>
                                <div className="model-name" title={model.name}>
                                  {model.name}
                                </div>
                              </div>
                              {model.open_weights && (
                                <span className="open-weights-badge">Pesos Libres</span>
                              )}
                            </div>

                            <div className="cost-display">
                              <div className="cost-row">
                                <span>Entrada (1M tokens)</span>
                                <span className="cost-value">
                                  {model.cost.input > 0 ? `$${model.cost.input.toFixed(2)}` : 'Gratis / ND'}
                                </span>
                              </div>
                              <div className="cost-row">
                                <span>Salida (1M tokens)</span>
                                <span className="cost-value">
                                  {model.cost.output > 0 ? `$${model.cost.output.toFixed(2)}` : 'Gratis / ND'}
                                </span>
                              </div>
                              {model.reasoning && model.cost.reasoning !== model.cost.output && (
                                <div className="cost-row" style={{ borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '2px', marginTop: '2px' }}>
                                  <span>Razonamiento (1M)</span>
                                  <span className="cost-value">${model.cost.reasoning.toFixed(2)}</span>
                                </div>
                              )}
                            </div>

                            <div className="simulated-result">
                              <span className="sim-label">Coste Simulación:</span>
                              <span className="sim-cost-amount">
                                {hasCost ? `$${simCost.toFixed(4)}` : '$0.0000'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              <div className="card-details-row">
                                <span>Contexto</span>
                                <span className="card-details-val">{formatContextSize(model.limit.context)} tokens</span>
                              </div>
                              {model.knowledge && (
                                <div className="card-details-row">
                                  <span>Conocimiento cutoff</span>
                                  <span className="card-details-val">{model.knowledge}</span>
                                </div>
                              )}
                            </div>

                            <div className="card-badges">
                              <span className={`mini-badge ${model.reasoning ? 'active' : ''}`}>Reasoning</span>
                              <span className={`mini-badge ${model.tool_call ? 'active' : ''}`}>Tool Use</span>
                              <span className={`mini-badge ${model.structured_output ? 'active' : ''}`}>Struct Output</span>
                              <span className={`mini-badge ${model.modalities.input.includes('image') ? 'active' : ''}`}>Vision</span>
                              <span className={`mini-badge ${model.modalities.input.includes('audio') ? 'active' : ''}`}>Audio</span>
                            </div>

                            <div className="card-actions">
                              <button 
                                className={`btn ${comparisonList.includes(model.id) ? 'btn-active-compare' : ''}`}
                                onClick={() => toggleComparison(model.id)}
                              >
                                {comparisonList.includes(model.id) ? '✓ Comparando' : '+ Comparar'}
                              </button>
                              <button 
                                className="btn btn-primary"
                                onClick={() => setSelectedModelDetails(model)}
                              >
                                Ficha Técnica
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {processedModels.length > 100 && (
                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Se muestran los primeros 100 resultados. Refina tu búsqueda con los filtros para ver otros modelos.
                    </div>
                  )}
                </>
              )}

              {/* TAB 2: SIDE BY SIDE COMPARISON */}
              {activeTab === 'comparison' && (
                <div className="comparison-section">
                  <div className="comparison-header">
                    <h2>Comparador de Modelos Lado a Lado</h2>
                    {comparisonModels.length > 0 && (
                      <button 
                        className="btn" 
                        onClick={() => setComparisonList([])}
                        style={{ maxWidth: '200px', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                      >
                        Vaciar Comparador
                      </button>
                    )}
                  </div>

                  {comparisonModels.length === 0 ? (
                    <div className="comparison-empty">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                      </svg>
                      <h3>No hay modelos seleccionados para comparar</h3>
                      <p>Vuelve a la pestaña del **Explorador de Modelos** y pulsa el botón **"+ Comparar"** en los modelos que desees añadir.</p>
                      <button className="btn btn-primary" onClick={() => setActiveTab('explorer')} style={{ marginTop: '1rem', width: 'auto', padding: '0.5rem 1.5rem' }}>
                        Ir al Explorador
                      </button>
                    </div>
                  ) : (
                    <div className="comparison-grid-container">
                      <table className="comparison-table">
                        <thead>
                          <tr>
                            <th className="header-column">Especificación</th>
                            {comparisonModels.map(model => (
                              <th key={model.id} className="comparison-model-cell">
                                <img 
                                  className="comp-logo" 
                                  src={`https://models.dev/logos/${model.providerId}.svg`} 
                                  alt={model.providerName}
                                  onError={handleImageError}
                                />
                                <div className="comp-model-name">{model.name}</div>
                                <div className="comp-provider-name">{model.providerName}</div>
                                <button className="comp-remove-btn" onClick={() => toggleComparison(model.id)}>
                                  Quitar
                                </button>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {/* Row: Estimated Total Cost */}
                          <tr style={{ background: 'rgba(139, 92, 246, 0.08)' }}>
                            <td className="header-column" style={{ fontWeight: 'bold', color: 'var(--text-link)' }}>
                              Simulación Total
                              <div style={{ fontSize: '0.7rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>
                                ({simulator.apiCalls} llamadas de {simulator.inputTokens/1000}k/{simulator.outputTokens/1000}k tokens)
                              </div>
                            </td>
                            {comparisonModels.map(model => {
                              const cost = calculateSimulatedCost(model);
                              return (
                                <td key={model.id} className="comparison-model-cell" style={{ fontWeight: '800', fontSize: '1.1rem', color: '#fff', textShadow: '0 0 10px rgba(139,92,246,0.3)' }}>
                                  ${cost.toFixed(4)}
                                </td>
                              );
                            })}
                          </tr>

                          {/* Row: Input Cost */}
                          <tr>
                            <td className="header-column">Precio Entrada (1M tokens)</td>
                            {comparisonModels.map(model => (
                              <td key={model.id} className="comparison-model-cell comp-value-mono">
                                ${model.cost.input.toFixed(2)}
                              </td>
                            ))}
                          </tr>

                          {/* Row: Output Cost */}
                          <tr>
                            <td className="header-column">Precio Salida (1M tokens)</td>
                            {comparisonModels.map(model => (
                              <td key={model.id} className="comparison-model-cell comp-value-mono">
                                ${model.cost.output.toFixed(2)}
                              </td>
                            ))}
                          </tr>

                          {/* Row: Reasoning Cost */}
                          <tr>
                            <td className="header-column">Precio Razonamiento (1M)</td>
                            {comparisonModels.map(model => (
                              <td key={model.id} className="comparison-model-cell comp-value-mono">
                                ${model.cost.reasoning.toFixed(2)}
                              </td>
                            ))}
                          </tr>

                          {/* Row: Cache Read Cost */}
                          <tr>
                            <td className="header-column">Lectura de Caché (1M)</td>
                            {comparisonModels.map(model => (
                              <td key={model.id} className="comparison-model-cell comp-value-mono">
                                ${model.cost.cache_read.toFixed(2)}
                              </td>
                            ))}
                          </tr>

                          {/* Row: Cache Write Cost */}
                          <tr>
                            <td className="header-column">Escritura de Caché (1M)</td>
                            {comparisonModels.map(model => (
                              <td key={model.id} className="comparison-model-cell comp-value-mono">
                                ${model.cost.cache_write.toFixed(2)}
                              </td>
                            ))}
                          </tr>

                          {/* Row: Context Limit */}
                          <tr>
                            <td className="header-column">Ventana de Contexto</td>
                            {comparisonModels.map(model => (
                              <td key={model.id} className="comparison-model-cell comp-value-mono" style={{ fontSize: '0.95rem', color: 'var(--color-secondary)' }}>
                                {model.limit.context.toLocaleString()} tokens
                              </td>
                            ))}
                          </tr>

                          {/* Row: Max Output limit */}
                          <tr>
                            <td className="header-column">Límite de Salida (Max Output)</td>
                            {comparisonModels.map(model => (
                              <td key={model.id} className="comparison-model-cell comp-value-mono">
                                {model.limit.output > 0 ? `${model.limit.output.toLocaleString()} tokens` : 'Sin especificar'}
                              </td>
                            ))}
                          </tr>

                          {/* Row: Open weights */}
                          <tr>
                            <td className="header-column">Pesos Abiertos (Open Weights)</td>
                            {comparisonModels.map(model => (
                              <td key={model.id} className="comparison-model-cell">
                                {model.open_weights ? '✅ Sí' : '❌ No'}
                              </td>
                            ))}
                          </tr>

                          {/* Row: Capabilities */}
                          <tr>
                            <td className="header-column">Capacidades Soportadas</td>
                            {comparisonModels.map(model => (
                              <td key={model.id} className="comparison-model-cell">
                                <div className="comp-badge-row">
                                  {model.reasoning && <span className="mini-badge active">Reasoning</span>}
                                  {model.tool_call && <span className="mini-badge active">Tool Use</span>}
                                  {model.structured_output && <span className="mini-badge active">Structured</span>}
                                  {model.attachment && <span className="mini-badge active">Attachments</span>}
                                </div>
                              </td>
                            ))}
                          </tr>

                          {/* Row: Input Modalities */}
                          <tr>
                            <td className="header-column">Modalidades Entrada</td>
                            {comparisonModels.map(model => (
                              <td key={model.id} className="comparison-model-cell" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {model.modalities.input.join(', ')}
                              </td>
                            ))}
                          </tr>

                          {/* Row: Cutoff Conocimiento */}
                          <tr>
                            <td className="header-column">Cutoff de Conocimiento</td>
                            {comparisonModels.map(model => (
                              <td key={model.id} className="comparison-model-cell">
                                {model.knowledge || 'No disponible'}
                              </td>
                            ))}
                          </tr>

                          {/* Row: Fecha Lanzamiento */}
                          <tr>
                            <td className="header-column">Fecha de Lanzamiento</td>
                            {comparisonModels.map(model => (
                              <td key={model.id} className="comparison-model-cell">
                                {model.release_date || 'No disponible'}
                              </td>
                            ))}
                          </tr>

                          {/* Row: SDK NPM Package */}
                          <tr>
                            <td className="header-column">SDK Vía NPM</td>
                            {comparisonModels.map(model => (
                              <td key={model.id} className="comparison-model-cell" style={{ fontSize: '0.8rem' }}>
                                <code style={{ fontSize: '0.75rem', padding: '2px 6px', background: 'rgba(255,255,255,0.03)' }}>
                                  {model.providerNpm}
                                </code>
                              </td>
                            ))}
                          </tr>

                          {/* Row: Doc URL */}
                          <tr>
                            <td className="header-column">Documentación</td>
                            {comparisonModels.map(model => (
                              <td key={model.id} className="comparison-model-cell">
                                <a href={model.providerDoc} target="_blank" rel="noopener noreferrer">
                                  Ver Docs Oficiales ↗
                                </a>
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: VISUAL SVG CHARTS */}
              {activeTab === 'analytics' && (
                <div className="analytics-section">
                  <h2>Gráficos de Comparación de Costes API</h2>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '-1rem' }}>
                    Esta sección visualiza los costes de los 10 modelos más baratos según el filtrado actual aplicado en la barra lateral.
                  </p>

                  <div className="charts-row">
                    {/* CHART 1: INPUT COST */}
                    <div className="chart-card">
                      <div className="chart-header-block">
                        <div className="chart-title">Coste de Entrada por Millón de Tokens (USD)</div>
                        <div className="chart-desc">Menor es mejor. Basado en tus filtros seleccionados.</div>
                      </div>

                      <div className="chart-container-svg">
                        {(() => {
                          const chartModels = processedModels.slice(0, 10).filter(m => m.cost.input > 0);
                          if (chartModels.length === 0) {
                            return (
                              <div style={{ display: 'grid', placeContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                Sin modelos con precios válidos para graficar
                              </div>
                            );
                          }
                          const maxVal = Math.max(...chartModels.map(m => m.cost.input), 0.1);
                          const svgH = Math.max(250, chartModels.length * 35 + 30);

                          return (
                            <svg width="100%" height={svgH} style={{ overflow: 'visible' }}>
                              <defs>
                                <linearGradient id="violetGradient" x1="0" y1="0" x2="1" y2="0">
                                  <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.4" />
                                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.9" />
                                </linearGradient>
                              </defs>
                              
                              {/* Grid lines */}
                              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                                const x = 160 + ratio * 200;
                                return (
                                  <g key={idx}>
                                    <line x1={x} y1={10} x2={x} y2={svgH - 25} className="svg-grid-line" />
                                    <text x={x} y={svgH - 10} textAnchor="middle" className="svg-text-label" style={{ fontSize: '9px' }}>
                                      ${(ratio * maxVal).toFixed(2)}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Bars */}
                              {chartModels.map((m, idx) => {
                                const y = 15 + idx * 35;
                                const barW = (m.cost.input / maxVal) * 200;
                                
                                return (
                                  <g key={m.id} className="svg-bar" onClick={() => setSelectedModelDetails(m)}>
                                    {/* Label */}
                                    <text x={10} y={y + 15} className="svg-text-label" style={{ fontWeight: 600, fill: 'var(--text-primary)' }}>
                                      {m.name.length > 20 ? m.name.substring(0, 18) + '...' : m.name}
                                    </text>
                                    <text x={10} y={y + 25} className="svg-text-label" style={{ fontSize: '8px', fill: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                      {m.providerName}
                                    </text>
                                    
                                    {/* Rect */}
                                    <rect 
                                      x={160} 
                                      y={y} 
                                      width={Math.max(barW, 3)} 
                                      height={20} 
                                      rx={4} 
                                      className="svg-bar-input" 
                                    />
                                    
                                    {/* Value label */}
                                    <text x={160 + barW + 8} y={y + 14} className="svg-text-value">
                                      ${m.cost.input.toFixed(2)}
                                    </text>
                                  </g>
                                );
                              })}
                              
                              {/* Y Axis line */}
                              <line x1={160} y1={10} x2={160} y2={svgH - 25} className="svg-axis-line" />
                            </svg>
                          );
                        })()}
                      </div>
                    </div>

                    {/* CHART 2: OUTPUT COST */}
                    <div className="chart-card">
                      <div className="chart-header-block">
                        <div className="chart-title">Coste de Salida por Millón de Tokens (USD)</div>
                        <div className="chart-desc">Menor es mejor. Basado en tus filtros seleccionados.</div>
                      </div>

                      <div className="chart-container-svg">
                        {(() => {
                          const chartModels = processedModels.slice(0, 10).filter(m => m.cost.output > 0);
                          if (chartModels.length === 0) {
                            return (
                              <div style={{ display: 'grid', placeContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                Sin modelos con precios válidos para graficar
                              </div>
                            );
                          }
                          const maxVal = Math.max(...chartModels.map(m => m.cost.output), 0.1);
                          const svgH = Math.max(250, chartModels.length * 35 + 30);

                          return (
                            <svg width="100%" height={svgH} style={{ overflow: 'visible' }}>
                              <defs>
                                <linearGradient id="cyanGradient" x1="0" y1="0" x2="1" y2="0">
                                  <stop offset="0%" stopColor="#0891b2" stopOpacity="0.4" />
                                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.9" />
                                </linearGradient>
                              </defs>
                              
                              {/* Grid lines */}
                              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                                const x = 160 + ratio * 200;
                                return (
                                  <g key={idx}>
                                    <line x1={x} y1={10} x2={x} y2={svgH - 25} className="svg-grid-line" />
                                    <text x={x} y={svgH - 10} textAnchor="middle" className="svg-text-label" style={{ fontSize: '9px' }}>
                                      ${(ratio * maxVal).toFixed(2)}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Bars */}
                              {chartModels.map((m, idx) => {
                                const y = 15 + idx * 35;
                                const barW = (m.cost.output / maxVal) * 200;
                                
                                return (
                                  <g key={m.id} className="svg-bar" onClick={() => setSelectedModelDetails(m)}>
                                    {/* Label */}
                                    <text x={10} y={y + 15} className="svg-text-label" style={{ fontWeight: 600, fill: 'var(--text-primary)' }}>
                                      {m.name.length > 20 ? m.name.substring(0, 18) + '...' : m.name}
                                    </text>
                                    <text x={10} y={y + 25} className="svg-text-label" style={{ fontSize: '8px', fill: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                      {m.providerName}
                                    </text>
                                    
                                    {/* Rect */}
                                    <rect 
                                      x={160} 
                                      y={y} 
                                      width={Math.max(barW, 3)} 
                                      height={20} 
                                      rx={4} 
                                      className="svg-bar-output" 
                                    />
                                    
                                    {/* Value label */}
                                    <text x={160 + barW + 8} y={y + 14} className="svg-text-value">
                                      ${m.cost.output.toFixed(2)}
                                    </text>
                                  </g>
                                );
                              })}
                              
                              {/* Y Axis line */}
                              <line x1={160} y1={10} x2={160} y2={svgH - 25} className="svg-axis-line" />
                            </svg>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Context size vs cost value rating */}
                  <div className="chart-card" style={{ marginTop: '1rem' }}>
                    <div className="chart-header-block">
                      <div className="chart-title">Ventanas de Contexto Máximas (Top 15 Modelos)</div>
                      <div className="chart-desc">Representación gráfica del tamaño de contexto total en tokens.</div>
                    </div>
                    <div>
                      {(() => {
                        const topContextModels = [...processedModels]
                          .sort((a,b) => b.limit.context - a.limit.context)
                          .slice(0, 15)
                          .filter(m => m.limit.context > 0);
                        
                        if (topContextModels.length === 0) return <p style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Sin datos de contexto para mostrar.</p>;
                        
                        const maxCtx = Math.max(...topContextModels.map(m => m.limit.context), 128000);
                        
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {topContextModels.map(m => {
                              const percent = (m.limit.context / maxCtx) * 100;
                              return (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem' }}>
                                  <div style={{ width: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{m.name}</div>
                                  <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ width: `${percent}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))', borderRadius: '4px' }}></div>
                                  </div>
                                  <div style={{ width: '80px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-secondary)' }}>{formatContextSize(m.limit.context)}</div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer style={{
        textAlign: 'center',
        padding: '0.85rem 1rem',
        fontSize: '0.82rem',
        color: 'var(--text-muted)',
        background: 'rgba(255,255,255,0.015)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        backdropFilter: 'blur(6px)',
        letterSpacing: '0.01em',
      }}>
        Datos proporcionados por{' '}
        <a href="https://models.dev/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>models.dev</a>
        {' '}·{' '}
        repositorio{' '}
        <a href="https://github.com/anomalyco/models.dev" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>anomalyco/models.dev</a>
      </footer>

      {/* Model Specifications Slide-over (Modal) */}
      {selectedModelDetails && (
        <div className="modal-overlay" onClick={() => setSelectedModelDetails(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-back-btn" onClick={() => setSelectedModelDetails(null)} aria-label="Volver">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
                <span>Atrás</span>
              </button>

              <div className="modal-title-area">
                <div className="provider-logo-row">
                  <img 
                    className="provider-mini-logo" 
                    src={`https://models.dev/logos/${selectedModelDetails.providerId}.svg`} 
                    alt={selectedModelDetails.providerName}
                    onError={handleImageError}
                  />
                  <span>{selectedModelDetails.providerName}</span>
                </div>
                <h2 style={{ fontSize: '1.5rem', color: '#fff' }}>{selectedModelDetails.name}</h2>
                <code style={{ fontSize: '0.8rem', color: 'var(--color-secondary)' }}>ID: {selectedModelDetails.id}</code>
              </div>

              <button className="modal-close-btn" onClick={() => setSelectedModelDetails(null)} aria-label="Cerrar">
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* Technical Limits */}
              <div className="modal-section">
                <div className="modal-section-title">Límites y Parámetros Técnicos</div>
                <div className="detail-grid-modal">
                  <div className="detail-item-modal">
                    <span className="detail-label-modal">Ventana de Contexto</span>
                    <span className="detail-val-modal mono">{selectedModelDetails.limit.context.toLocaleString()} tokens</span>
                  </div>
                  <div className="detail-item-modal">
                    <span className="detail-label-modal">Entrada Máxima (Max Input)</span>
                    <span className="detail-val-modal mono">{selectedModelDetails.limit.input.toLocaleString()} tokens</span>
                  </div>
                  <div className="detail-item-modal">
                    <span className="detail-label-modal">Salida Máxima (Max Output)</span>
                    <span className="detail-val-modal mono">
                      {selectedModelDetails.limit.output > 0 ? `${selectedModelDetails.limit.output.toLocaleString()} tokens` : 'No especificada'}
                    </span>
                  </div>
                  <div className="detail-item-modal">
                    <span className="detail-label-modal">Soporta Temperatura</span>
                    <span className="detail-val-modal">{selectedModelDetails.temperature ? 'Sí' : 'No'}</span>
                  </div>
                </div>
              </div>

              {/* Cost specifications */}
              <div className="modal-section">
                <div className="modal-section-title">Costes Detallados del API (por 1M Tokens)</div>
                <div className="detail-grid-modal">
                  <div className="detail-item-modal">
                    <span className="detail-label-modal">Costo de Entrada</span>
                    <span className="detail-val-modal mono">${selectedModelDetails.cost.input.toFixed(2)}</span>
                  </div>
                  <div className="detail-item-modal">
                    <span className="detail-label-modal">Costo de Salida</span>
                    <span className="detail-val-modal mono">${selectedModelDetails.cost.output.toFixed(2)}</span>
                  </div>
                  <div className="detail-item-modal">
                    <span className="detail-label-modal">Costo de Razonamiento (CoT)</span>
                    <span className="detail-val-modal mono">${selectedModelDetails.cost.reasoning.toFixed(2)}</span>
                  </div>
                  <div className="detail-item-modal">
                    <span className="detail-label-modal">Costo Lectura de Caché</span>
                    <span className="detail-val-modal mono">${selectedModelDetails.cost.cache_read.toFixed(2)}</span>
                  </div>
                  <div className="detail-item-modal">
                    <span className="detail-label-modal">Costo Escritura de Caché</span>
                    <span className="detail-val-modal mono">${selectedModelDetails.cost.cache_write.toFixed(2)}</span>
                  </div>
                  <div className="detail-item-modal">
                    <span className="detail-label-modal">Costo Entrada de Audio</span>
                    <span className="detail-val-modal mono">${selectedModelDetails.cost.input_audio.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Metadata */}
              <div className="modal-section">
                <div className="modal-section-title">Información del Modelo y Lanzamiento</div>
                <div className="detail-grid-modal">
                  <div className="detail-item-modal">
                    <span className="detail-label-modal">Cutoff de Conocimiento</span>
                    <span className="detail-val-modal">{selectedModelDetails.knowledge || 'Desconocida'}</span>
                  </div>
                  <div className="detail-item-modal">
                    <span className="detail-label-modal">Fecha de Lanzamiento</span>
                    <span className="detail-val-modal">{selectedModelDetails.release_date || 'Desconocida'}</span>
                  </div>
                  <div className="detail-item-modal">
                    <span className="detail-label-modal">Licencia / Pesos Libres</span>
                    <span className="detail-val-modal">{selectedModelDetails.open_weights ? 'Pesos Abiertos' : 'Propietario / API Cerrada'}</span>
                  </div>
                  <div className="detail-item-modal">
                    <span className="detail-label-modal">Familia de Modelos</span>
                    <span className="detail-val-modal">{selectedModelDetails.family || 'No especificada'}</span>
                  </div>
                </div>
              </div>

              {/* SDK & Integration details */}
              <div className="modal-section">
                <div className="modal-section-title">Integración y Código de Ejemplo</div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
                  Este modelo se puede usar mediante el SDK unificado **AI SDK**.
                </p>
                <div className="detail-grid-modal" style={{ gridTemplateColumns: '1fr', gap: '0.5rem' }}>
                  <div className="detail-item-modal" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span className="detail-label-modal">Paquete NPM del Proveedor</span>
                      <div className="detail-val-modal mono" style={{ fontSize: '0.8rem', color: 'var(--color-primary)' }}>{selectedModelDetails.providerNpm}</div>
                    </div>
                    <a href={selectedModelDetails.providerDoc} target="_blank" rel="noopener noreferrer" className="btn" style={{ maxWidth: '120px', padding: '0.35rem' }}>
                      Docs ↗
                    </a>
                  </div>
                </div>

                <div className="code-block-wrapper">
                  <pre className="code-block-content">{`// Ejemplo de uso con AI SDK de Vercel
import { generateText } from 'ai';
import { createOpenAI } from '${selectedModelDetails.providerNpm}'; // o provider correspondiente

const provider = createOpenAI({
  apiKey: process.env.${selectedModelDetails.providerId.toUpperCase().replace('-', '_')}_API_KEY,
  ${selectedModelDetails.providerApi ? `baseURL: "${selectedModelDetails.providerApi}",` : ''}
});

const { text } = await generateText({
  model: provider('${selectedModelDetails.modelKey}'),
  prompt: 'Hola, ¿cómo estás?',
});`}</pre>
                </div>
              </div>

              {/* Raw JSON Details */}
              <div className="modal-section">
                <div className="modal-section-title">Especificación Completa JSON (API Schema)</div>
                <div className="code-block-wrapper" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  <pre className="code-block-content" style={{ color: 'var(--text-secondary)' }}>
                    {JSON.stringify(selectedModelDetails, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-tab-bar">
        <button 
          className={`mobile-tab-btn ${activeTab === 'explorer' ? 'active' : ''}`}
          onClick={() => setActiveTab('explorer')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="9"></rect>
            <rect x="14" y="3" width="7" height="5"></rect>
            <rect x="14" y="12" width="7" height="9"></rect>
            <rect x="3" y="16" width="7" height="5"></rect>
          </svg>
          <span>Explorador</span>
        </button>
        <button 
          className={`mobile-tab-btn ${activeTab === 'comparison' ? 'active' : ''}`}
          onClick={() => setActiveTab('comparison')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1"></path>
            <path d="M18 8h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-3"></path>
          </svg>
          <span>Comparar</span>
          {comparisonList.length > 0 && (
            <span className="mobile-badge-count">{comparisonList.length}</span>
          )}
        </button>
        <button 
          className={`mobile-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
          <span>Gráficos</span>
        </button>
      </nav>
    </>
  );
}
