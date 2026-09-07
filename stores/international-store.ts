// stores/international-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/config/supabase';

interface Country {
  iso: string; // Our internal ISO (from iso_code)
  bpay_iso: string; // ISO code from Payscribe API
  title: string;
  prefix: string;
  flag_emoji?: string;
  dial_code?: string;
  currency_symbol?: string;
  currency_code?: string;
}

interface Provider {
  code: string;
  name: string;
  phone_regex: string;
  logo_url?: string;
  country_iso: string; // Payscribe ISO for API calls
  internal_country_iso: string; // Our internal ISO
  service_type?: 'airtime' | 'data' | 'utility' | 'unknown'; // Added service type
}

interface AirtimeLimits {
  min_send: number;
  max_send: number;
  min_receive: number;
  max_receive: number;
  receive_currency: string;
  send_currency: string;
  current_rate: number;
  sku: string;
  is_range: boolean;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  display_text: string;
  min_send: number;
  max_send: number;
  min_receive: number;
  max_receive: number;
  send_currency: string;
  receive_currency: string;
  current_rate: number;
  vend_type: string;
  lookup_required: boolean;
  uat: boolean;
}

interface InternationalStore {
  // Data
  countries: Country[];
  providers: Provider[];
  products: Map<string, Product[]>; // Key: countryIso_providerCode
  
  // Loading states
  loadingCountries: boolean;
  loadingProviders: boolean;
  loadingProducts: boolean;
  
  // Cache timestamps
  lastFetch: {
    countries: number | null;
    providers: number | null;
    products: number | null;
  };
  
  // Cache duration (10 minutes)
  cacheDuration: number;
  
  // Actions
  fetchCountries: (forceRefresh?: boolean) => Promise<Country[]>;
  fetchProvidersByCountry: (countryIso: string, serviceType?: 'airtime' | 'data' | 'utility' | 'all', forceRefresh?: boolean) => Promise<Provider[]>;
  fetchProductsByProvider: (countryIso: string, providerCode: string, forceRefresh?: boolean) => Promise<Product[]>;
  
  // Helper methods
  getCountryByIso: (iso: string) => Country | undefined;
  getCountryByPayscribeIso: (payscribeIso: string) => Country | undefined;
  getProvidersForCountry: (countryIso: string, serviceType?: 'airtime' | 'data' | 'utility' | 'all') => Provider[];
  getProductsForProvider: (countryIso: string, providerCode: string) => Product[];
  
  // Service type detection
  detectProviderType: (provider: Provider) => 'airtime' | 'data' | 'utility' | 'unknown';
  
  // Clear cache
  clearCache: () => void;
}

const API_BASE_URL = 'https://api.payscribe.ng/api/v1';
const API_KEY = 'ps_pk_live_zFSRW85fIwCMXyyyLvRTUxLMX8UQheJZDia';

export const useInternationalStore = create<InternationalStore>()(
  persist(
    (set, get) => ({
      // Initial state
      countries: [],
      providers: [],
      products: new Map(),
      loadingCountries: false,
      loadingProviders: false,
      loadingProducts: false,
      lastFetch: {
        countries: null,
        providers: null,
        products: null,
      },
      cacheDuration: 10 * 60 * 1000, // 10 minutes
      
      // Service type detection for providers
      detectProviderType: (provider: Provider): 'airtime' | 'data' | 'utility' | 'unknown' => {
        const name = (provider.name || '').toLowerCase();
        const code = (provider.code || '').toLowerCase();
        
        // Check for data/internet providers
        const isDataProvider = 
          name.includes('data') || 
          name.includes('internet') || 
          name.includes('broadband') ||
          name.includes('wifi') ||
          name.includes('fibre') ||
          name.includes('fiber') ||
          name.includes('isp') ||
          name.includes('bandwidth') ||
          code.includes('data') || 
          code.includes('internet') ||
          code.includes('bb') ||
          code.includes('isp');
        
        // Check for airtime/mobile providers
        const isAirtimeProvider = 
          name.includes('mobile') ||
          name.includes('mtn') ||
          name.includes('airtel') ||
          name.includes('vodafone') ||
          name.includes('orange') ||
          name.includes('t-mobile') ||
          name.includes('verizon') ||
          name.includes('at&t') ||
          name.includes('telkom') ||
          name.includes('telecom') ||
          name.includes('celcom') ||
          name.includes('digi') ||
          name.includes('maxis') ||
          name.includes('telenor') ||
          name.includes('globe') ||
          name.includes('smart') ||
          name.includes('telstra') ||
          name.includes('optus') ||
          code.includes('mt') || // MTN pattern
          code.includes('at') || // Airtel pattern
          code.includes('vf') || // Vodafone pattern
          code.includes('vm') || // Verizon Mobile
          code.includes('tm') || // T-Mobile
          code.includes('gl') || // Globe
          code.includes('sm');   // Smart
        
        // Check for utility/bills providers
        const isUtilityProvider = 
          name.includes('electric') ||
          name.includes('power') ||
          name.includes('water') ||
          name.includes('utility') ||
          name.includes('bill') ||
          name.includes('electricity') ||
          name.includes('energy') ||
          name.includes('gas');
        
        if (isDataProvider) return 'data';
        if (isAirtimeProvider) return 'airtime';
        if (isUtilityProvider) return 'utility';
        
        return 'unknown';
      },
      
      // Fetch all countries from database first, then API if needed
      fetchCountries: async (forceRefresh = false) => {
        const state = get();
        
        // Check cache if not forcing refresh
        if (!forceRefresh && state.countries.length > 0 && state.lastFetch.countries) {
          const now = Date.now();
          if (now - state.lastFetch.countries < state.cacheDuration) {
            console.log('Using cached countries');
            return state.countries;
          }
        }
        
        set({ loadingCountries: true });
        
        try {
          // First try to fetch from Supabase countries table
          // Filter out countries with incomplete data
          const { data: dbCountries, error: dbError } = await supabase
            .from('countries')
            .select('iso_code, name, dial_code, flag_emoji, currency_symbol, currency_code, title, prefix, iso, bpay_iso, ppp_reward_amount')
            .eq('is_active', true)
            .not('currency_symbol', 'is', null)
            .not('currency_code', 'is', null)
            .not('iso', 'is', null)
            .not('bpay_iso', 'is', null)
            .order('name', { ascending: true });
          
          if (dbError) throw dbError;
          
          if (dbCountries && dbCountries.length > 0) {
            console.log('Found countries in database:', dbCountries.length);
            
            // Transform database format to store format
            const transformedCountries: Country[] = dbCountries
              .filter((country: any) => {
                // Additional filtering for completeness
                return country.iso_code && 
                       country.bpay_iso && 
                       country.currency_symbol && 
                       country.currency_code &&
                       country.title;
              })
              .map((country: any) => {
                // Our internal ISO (from iso_code column)
                const internalIso = country.iso_code?.toLowerCase() || country.iso?.toLowerCase() || '';
                
                // Payscribe ISO - use stored value
                const payscribeIso = country.bpay_iso?.toLowerCase() || internalIso;
                
                return {
                  iso: internalIso, // Our internal ISO code
                  bpay_iso: payscribeIso, // ISO code for Payscribe API
                  title: country.title || country.name || '',
                  prefix: country.prefix || country.dial_code?.replace('+', '') || '',
                  flag_emoji: country.flag_emoji || getFlagEmoji(country.iso_code || country.iso),
                  dial_code: country.dial_code || (country.prefix ? `+${country.prefix}` : ''),
                  currency_symbol: country.currency_symbol || '',
                  currency_code: country.currency_code || '',
                };
              });
            
            console.log('Transformed countries after filtering:', transformedCountries.length);
            
            set({
              countries: transformedCountries,
              lastFetch: { ...state.lastFetch, countries: Date.now() },
            });
            
            return transformedCountries;
          }
          
          // If no countries in database, fetch from Payscribe API
          console.log('Fetching countries from Payscribe API...');
          const response = await fetch(`${API_BASE_URL}/international-bills/countries`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${API_KEY}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', errorText);
            throw new Error(`Failed to fetch countries: ${response.status} - ${errorText}`);
          }
          
          const result = await response.json();
          console.log('Payscribe API Countries Response:', result);
          
          if (result.status && result.message?.details) {
            // First, get our existing countries from DB to match with Payscribe response
            const { data: existingCountries } = await supabase
              .from('countries')
              .select('iso_code, name')
              .eq('is_active', true);
            
            const apiCountries: Country[] = result.message.details
              .filter((country: any) => country.iso && country.title && country.prefix)
              .map((country: any) => {
                const payscribeIso = country.iso?.toLowerCase() || '';
                const payscribeTitle = country.title || '';
                
                // Try to find matching country in our database
                let internalIso = '';
                let countryName = payscribeTitle;
                
                if (existingCountries) {
                  // Try to match by name first
                  const matchedCountry = existingCountries.find(
                    (ec: any) => ec.name?.toLowerCase() === payscribeTitle.toLowerCase()
                  );
                  
                  if (matchedCountry) {
                    internalIso = matchedCountry.iso_code?.toLowerCase() || '';
                    countryName = matchedCountry.name;
                  } else {
                    // If no match by name, use Payscribe ISO as internal ISO
                    internalIso = payscribeIso;
                  }
                } else {
                  internalIso = payscribeIso;
                }
                
                return {
                  iso: internalIso, // Our internal ISO
                  bpay_iso: payscribeIso, // Payscribe's ISO
                  title: countryName,
                  prefix: country.prefix || '',
                  flag_emoji: getFlagEmoji(country.iso),
                };
              });
            
            console.log('API Countries processed:', apiCountries.length);
            
            // Save to Supabase for future use
            try {
              const countriesToInsert = apiCountries.map(country => {
                const internalIso = country.iso || country.bpay_iso;
                
                return {
                  iso_code: internalIso.toUpperCase(),
                  name: country.title,
                  dial_code: country.prefix ? `+${country.prefix}` : '',
                  flag_emoji: country.flag_emoji,
                  title: country.title,
                  prefix: country.prefix,
                  iso: internalIso.toLowerCase(),
                  bpay_iso: country.bpay_iso.toUpperCase(), // Store Payscribe ISO
                  is_active: true,
                  currency_symbol: getCurrencySymbol(internalIso),
                  currency_code: getCurrencyCode(internalIso),
                };
              });
              
              const { error: insertError } = await supabase
                .from('countries')
                .upsert(countriesToInsert, { 
                  onConflict: 'iso_code',
                  ignoreDuplicates: false 
                });
              
              if (insertError) {
                console.warn('Failed to save countries to database:', insertError);
              } else {
                console.log('Saved countries to database with Payscribe ISO mapping');
              }
            } catch (insertError) {
              console.warn('Failed to save countries to database:', insertError);
            }
            
            set({
              countries: apiCountries,
              lastFetch: { ...state.lastFetch, countries: Date.now() },
            });
            
            return apiCountries;
          } else {
            console.error('Invalid API response format for countries:', result);
            throw new Error('Invalid response format from Payscribe API');
          }
          
        } catch (error: any) {
          console.error('Error in fetchCountries:', error);
          // Return cached countries if available
          if (state.countries.length > 0) {
            return state.countries;
          }
          throw error;
        } finally {
          set({ loadingCountries: false });
        }
      },
      
      // Fetch providers for a specific country from API with optional service type filtering
      fetchProvidersByCountry: async (countryIso: string, serviceType: 'airtime' | 'data' | 'utility' | 'all' = 'all', forceRefresh = false) => {
        const state = get();
        
        // Normalize the ISO code to lowercase for internal lookup
        const normalizedIso = countryIso.toLowerCase();
        
        // Check if we already have providers for this country
        const existingProviders = state.getProvidersForCountry(normalizedIso, serviceType);
        const lastFetch = state.lastFetch.providers;
        
        if (!forceRefresh && existingProviders.length > 0 && lastFetch) {
          const now = Date.now();
          if (now - lastFetch < state.cacheDuration) {
            console.log(`Using cached ${serviceType} providers for`, normalizedIso);
            return existingProviders;
          }
        }
        
        set({ loadingProviders: true });
        
        try {
          // First, try to find the country by various ISO codes
          let country = state.getCountryByIso(normalizedIso);
          if (!country) {
            // Try to find by Payscribe ISO (the parameter might already be a Payscribe ISO)
            country = state.getCountryByPayscribeIso(normalizedIso);
          }
          
          // If we still don't have a country, try to find by uppercase
          if (!country) {
            country = state.countries.find(c => 
              c.iso === normalizedIso || 
              c.bpay_iso === normalizedIso ||
              c.iso === countryIso.toUpperCase() ||
              c.bpay_iso === countryIso.toUpperCase()
            );
          }
          
          if (!country) {
            console.warn(`Country with ISO ${countryIso} not found in store. Fetching countries first...`);
            // Try to fetch countries first
            await state.fetchCountries();
            // Try to find the country again
            country = state.getCountryByIso(normalizedIso) || 
                      state.getCountryByPayscribeIso(normalizedIso) ||
                      state.countries.find(c => 
                        c.iso === normalizedIso || 
                        c.bpay_iso === normalizedIso ||
                        c.iso === countryIso.toUpperCase() ||
                        c.bpay_iso === countryIso.toUpperCase()
                      );
            
            if (!country) {
              throw new Error(`Country with ISO ${countryIso} not found even after fetching countries`);
            }
          }
          
          // Use Payscribe ISO for API calls (should be uppercase for API)
          const payscribeIso = country.bpay_iso.toUpperCase();
          const internalIso = country.iso.toLowerCase();
          
          console.log(`Fetching ${serviceType} providers for ${country.title} (Payscribe ISO: ${payscribeIso}, Internal ISO: ${internalIso}) from API...`);
          
          // First try to fetch from Supabase providers table
          const { data: dbProviders, error: dbError } = await supabase
            .from('providers')
            .select('*')
            .eq('internal_country_iso', internalIso)
            .eq('is_active', true)
            .order('name', { ascending: true });
          
          if (dbError) throw dbError;
          
          let providers: Provider[] = [];
          
          if (dbProviders && dbProviders.length > 0) {
            console.log('Found providers in database for', internalIso, ':', dbProviders.length);
            
            // Transform database format to store format with service type detection
            providers = dbProviders.map((provider: any) => {
              const baseProvider: Provider = {
                code: provider.code || '',
                name: provider.name || '',
                phone_regex: provider.phone_regex || '',
                logo_url: provider.logo_url || '',
                country_iso: provider.country_iso?.toLowerCase() || '', // Payscribe ISO
                internal_country_iso: provider.internal_country_iso || '', // Our internal ISO
              };
              
              // Detect service type
              const providerServiceType = state.detectProviderType(baseProvider);
              
              return {
                ...baseProvider,
                service_type: providerServiceType
              };
            });
            
          } else {
            // If no providers in database, fetch from Payscribe API
            console.log(`Fetching providers from Payscribe API for ISO: ${payscribeIso}`);
            const response = await fetch(
              `${API_BASE_URL}/international-bills/providers?iso=${payscribeIso}`,
              {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${API_KEY}`,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                },
              }
            );
            
            if (!response.ok) {
              const errorText = await response.text();
              console.error(`API Error ${response.status} for country ${payscribeIso}:`, errorText);
              
              try {
                const errorJson = JSON.parse(errorText);
                throw new Error(`Failed to fetch providers: ${response.status} - ${errorJson.message || errorJson.description || 'Unknown error'}`);
              } catch {
                throw new Error(`Failed to fetch providers: ${response.status} - ${errorText || 'Unknown error'}`);
              }
            }
            
            const result = await response.json();
            console.log(`API Response for ${payscribeIso}:`, result);
            
            if (result.status && result.message?.details) {
              providers = result.message.details.map((provider: any) => {
                const baseProvider: Provider = {
                  code: provider.code || '',
                  name: provider.name || '',
                  phone_regex: provider.phone_regex || '',
                  logo_url: provider.logo_url || '',
                  country_iso: payscribeIso.toLowerCase(), // Payscribe ISO (store as lowercase)
                  internal_country_iso: internalIso, // Our internal ISO
                };
                
                // Detect service type
                const providerServiceType = state.detectProviderType(baseProvider);
                
                return {
                  ...baseProvider,
                  service_type: providerServiceType
                };
              });
              
              console.log(`API Providers for ${payscribeIso}:`, providers.length);
              
              // Save to Supabase for future use
              try {
                const providersToInsert = providers.map(provider => ({
                  code: provider.code,
                  name: provider.name,
                  phone_regex: provider.phone_regex,
                  logo_url: provider.logo_url,
                  country_iso: provider.country_iso.toUpperCase(), // Payscribe ISO (store as uppercase in DB)
                  internal_country_iso: provider.internal_country_iso,
                  service_type: provider.service_type, // Store service type
                  is_active: true,
                }));
                
                const { error: insertError } = await supabase
                  .from('providers')
                  .upsert(providersToInsert, { 
                    onConflict: 'code',
                    ignoreDuplicates: false 
                  });
                
                if (insertError) {
                  console.warn('Failed to save providers to database:', insertError);
                } else {
                  console.log('Saved providers to database for', internalIso, 'with service type mapping');
                }
              } catch (insertError) {
                console.warn('Failed to save providers to database:', insertError);
              }
            } else {
              console.error('Invalid API response format for providers:', result);
              throw new Error('Invalid response format from Payscribe API');
            }
          }
          
          // Filter by service type if requested
          let filteredProviders = providers;
          if (serviceType !== 'all') {
            filteredProviders = providers.filter(provider => 
              provider.service_type === serviceType
            );
            console.log(`Filtered ${serviceType} providers: ${filteredProviders.length} out of ${providers.length}`);
          }
          
          // Update providers list
          const otherProviders = state.providers.filter(p => p.internal_country_iso !== internalIso);
          const updatedProviders = [...otherProviders, ...providers];
          
          set({
            providers: updatedProviders,
            lastFetch: { ...state.lastFetch, providers: Date.now() },
          });
          
          return filteredProviders;
          
        } catch (error: any) {
          console.error('Error in fetchProvidersByCountry for', countryIso, ':', error);
          // Return cached providers if available
          const cached = state.getProvidersForCountry(countryIso, serviceType);
          if (cached.length > 0) {
            return cached;
          }
          throw error;
        } finally {
          set({ loadingProviders: false });
        }
      },
      
      // Fetch products for a specific provider
      fetchProductsByProvider: async (countryIso: string, providerCode: string, forceRefresh = false) => {
        const state = get();
        
        const cacheKey = `${countryIso.toLowerCase()}_${providerCode}`;
        
        // Check cache if not forcing refresh
        if (!forceRefresh) {
          const cachedProducts = state.products.get(cacheKey);
          const lastFetch = state.lastFetch.products;
          
          if (cachedProducts && cachedProducts.length > 0 && lastFetch) {
            const now = Date.now();
            if (now - lastFetch < state.cacheDuration) {
              console.log(`Using cached products for ${cacheKey}`);
              return cachedProducts;
            }
          }
        }
        
        set({ loadingProducts: true });
        
        try {
          // Find the country
          let country = state.getCountryByIso(countryIso.toLowerCase());
          if (!country) {
            country = state.getCountryByPayscribeIso(countryIso.toLowerCase());
          }
          
          if (!country) {
            console.warn(`Country ${countryIso} not found, fetching countries...`);
            await state.fetchCountries();
            country = state.getCountryByIso(countryIso.toLowerCase()) || 
                      state.getCountryByPayscribeIso(countryIso.toLowerCase());
          }
          
          if (!country) {
            throw new Error(`Country with ISO ${countryIso} not found`);
          }
          
          // Use Payscribe ISO for API calls
          const payscribeIso = country.bpay_iso.toUpperCase();
          
          console.log(`Fetching products for ${payscribeIso}/${providerCode}...`);
          
          const response = await fetch(
            `${API_BASE_URL}/international-bills/products?iso=${payscribeIso}&code=${providerCode}`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
            }
          );
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch products: ${response.status} - ${errorText}`);
          }
          
          const result = await response.json();
          
          if (result.status && result.message?.details) {
            const products: Product[] = result.message.details.map((product: any) => ({
              id: product.sku || `${payscribeIso}_${providerCode}_${Date.now()}`,
              sku: product.sku,
              name: product.display_text,
              display_text: product.display_text,
              min_send: parseFloat(product.min_send) || 0,
              max_send: parseFloat(product.max_send) || 0,
              min_receive: parseFloat(product.min_receive) || 0,
              max_receive: parseFloat(product.max_receive) || 0,
              send_currency: product.send_currency || 'USD',
              receive_currency: product.receive_currency || 'USD',
              current_rate: parseFloat(product.current_rate) || 1500,
              vend_type: product.vend_type || 'range',
              lookup_required: product.lookup_required === '1',
              uat: product.uat || false,
            }));
            
            console.log(`Loaded ${products.length} products for ${payscribeIso}/${providerCode}`);
            
            // Update products map
            const newProducts = new Map(state.products);
            newProducts.set(cacheKey, products);
            
            set({
              products: newProducts,
              lastFetch: { ...state.lastFetch, products: Date.now() },
            });
            
            return products;
          } else {
            console.warn('No products found in API response');
            return [];
          }
          
        } catch (error) {
          console.error('Error fetching products:', error);
          // Return empty array if API fails
          return [];
        } finally {
          set({ loadingProducts: false });
        }
      },
      
      // Helper method to get country by our internal ISO code
      getCountryByIso: (iso: string) => {
        const state = get();
        const normalizedIso = iso.toLowerCase();
        return state.countries.find(country => country.iso === normalizedIso);
      },
      
      // Helper method to get country by Payscribe ISO code
      getCountryByPayscribeIso: (payscribeIso: string) => {
        const state = get();
        const normalizedIso = payscribeIso.toLowerCase();
        return state.countries.find(country => country.bpay_iso === normalizedIso);
      },
      
      // Helper method to get providers for a country (using our internal ISO) with optional service type filtering
      getProvidersForCountry: (countryIso: string, serviceType: 'airtime' | 'data' | 'utility' | 'all' = 'all') => {
        const state = get();
        const normalizedIso = countryIso.toLowerCase();
        
        const allProviders = state.providers.filter(provider => 
          provider.internal_country_iso === normalizedIso || 
          provider.country_iso.toLowerCase() === normalizedIso
        );
        
        if (serviceType === 'all') {
          return allProviders;
        }
        
        return allProviders.filter(provider => 
          provider.service_type === serviceType
        );
      },
      
      // Helper method to get products for a provider
      getProductsForProvider: (countryIso: string, providerCode: string) => {
        const state = get();
        const cacheKey = `${countryIso.toLowerCase()}_${providerCode}`;
        return state.products.get(cacheKey) || [];
      },
      
      // Clear all cache
      clearCache: () => {
        set({
          countries: [],
          providers: [],
          products: new Map(),
          lastFetch: {
            countries: null,
            providers: null,
            products: null,
          },
        });
      },
    }),
    {
      name: 'international-store',
      getStorage: () => localStorage,
      version: 4,
      migrate: (persistedState: any, version: number) => {
        if (version === 0 || version === 1 || version === 2 || version === 3) {
          // Migrate from older versions
          return {
            ...persistedState,
            products: persistedState.products || new Map(),
            lastFetch: {
              ...(persistedState.lastFetch || {}),
              products: persistedState.lastFetch?.products || null
            }
          };
        }
        return persistedState;
      },
    }
  )
);

// Helper function to get flag emoji from ISO code
function getFlagEmoji(iso: string): string {
  if (!iso) return '🌍';
  
  try {
    const isoCode = iso.toUpperCase();
    
    // Handle special cases for flag display
    const specialCases: Record<string, string> = {
      'UK': '🇬🇧', // UK shows as GB flag
      'GB': '🇬🇧', // GB is United Kingdom
    };
    
    if (specialCases[isoCode]) {
      return specialCases[isoCode];
    }
    
    if (isoCode.length !== 2) return '🌍';
    
    const codePoints = isoCode
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    
    return String.fromCodePoint(...codePoints);
  } catch (error) {
    console.warn('Error generating flag emoji for', iso, error);
    return '🌍';
  }
}

// Helper function to get currency symbol from ISO code
function getCurrencySymbol(iso: string): string {
  const currencyMap: Record<string, string> = {
    'us': '$',
    'gb': '£',
    'eu': '€',
    'jp': '¥',
    'cn': '¥',
    'in': '₹',
    'kr': '₩',
    'ru': '₽',
    'tr': '₺',
    'ng': '₦',
    'gh': 'GH₵',
    'ke': 'KSh',
    'za': 'R',
    'eg': 'E£',
    'br': 'R$',
    'mx': '$',
    'ca': '$',
    'au': '$',
    'nz': '$',
    'ch': 'CHF',
    'se': 'kr',
    'no': 'kr',
    'dk': 'kr',
    'pl': 'zł',
    'ua': '₴',
    'ph': '₱',
    'th': '฿',
    'vn': '₫',
    'id': 'Rp',
    'my': 'RM',
    'sg': '$',
    'ae': 'د.إ',
    'sa': '﷼',
    'qa': '﷼',
    'kw': 'د.ك',
  };
  
  return currencyMap[iso.toLowerCase()] || '$';
}

// Helper function to get currency code from ISO code
function getCurrencyCode(iso: string): string {
  const currencyCodeMap: Record<string, string> = {
    'us': 'USD',
    'gb': 'GBP',
    'eu': 'EUR',
    'jp': 'JPY',
    'cn': 'CNY',
    'in': 'INR',
    'kr': 'KRW',
    'ru': 'RUB',
    'tr': 'TRY',
    'ng': 'NGN',
    'gh': 'GHS',
    'ke': 'KES',
    'za': 'ZAR',
    'eg': 'EGP',
    'br': 'BRL',
    'mx': 'MXN',
    'ca': 'CAD',
    'au': 'AUD',
    'nz': 'NZD',
    'ch': 'CHF',
    'se': 'SEK',
    'no': 'NOK',
    'dk': 'DKK',
    'pl': 'PLN',
    'ua': 'UAH',
    'ph': 'PHP',
    'th': 'THB',
    'vn': 'VND',
    'id': 'IDR',
    'my': 'MYR',
    'sg': 'SGD',
    'ae': 'AED',
    'sa': 'SAR',
    'qa': 'QAR',
    'kw': 'KWD',
    'zw': 'ZWL',
    'zm': 'ZMW',
    'tz': 'TZS',
    'ug': 'UGX',
  };
  
  return currencyCodeMap[iso.toLowerCase()] || 'USD';
}

// Export a utility function to clear the store cache
export const clearInternationalStoreCache = () => {
  const store = useInternationalStore.getState();
  store.clearCache();
};

// Export helper function to detect service type for any provider
export const detectProviderServiceType = (providerName: string, providerCode: string): 'airtime' | 'data' | 'utility' | 'unknown' => {
  const name = (providerName || '').toLowerCase();
  const code = (providerCode || '').toLowerCase();
  
  // Check for data/internet providers
  const isDataProvider = 
    name.includes('data') || 
    name.includes('internet') || 
    name.includes('broadband') ||
    name.includes('wifi') ||
    name.includes('fibre') ||
    name.includes('fiber') ||
    name.includes('isp') ||
    name.includes('bandwidth') ||
    code.includes('data') || 
    code.includes('internet') ||
    code.includes('bb') ||
    code.includes('isp');
  
  // Check for airtime/mobile providers
  const isAirtimeProvider = 
    name.includes('mobile') ||
    name.includes('mtn') ||
    name.includes('airtel') ||
    name.includes('vodafone') ||
    name.includes('orange') ||
    name.includes('t-mobile') ||
    name.includes('verizon') ||
    name.includes('at&t') ||
    name.includes('telkom') ||
    name.includes('telecom') ||
    name.includes('celcom') ||
    name.includes('digi') ||
    name.includes('maxis') ||
    name.includes('telenor') ||
    name.includes('globe') ||
    name.includes('smart') ||
    name.includes('telstra') ||
    name.includes('optus') ||
    code.includes('mt') || // MTN pattern
    code.includes('at') || // Airtel pattern
    code.includes('vf') || // Vodafone pattern
    code.includes('vm') || // Verizon Mobile
    code.includes('tm') || // T-Mobile
    code.includes('gl') || // Globe
    code.includes('sm');   // Smart
  
  // Check for utility/bills providers
  const isUtilityProvider = 
    name.includes('electric') ||
    name.includes('power') ||
    name.includes('water') ||
    name.includes('utility') ||
    name.includes('bill') ||
    name.includes('electricity') ||
    name.includes('energy') ||
    name.includes('gas');
  
  if (isDataProvider) return 'data';
  if (isAirtimeProvider) return 'airtime';
  if (isUtilityProvider) return 'utility';
  
  return 'unknown';
};