// app/(app)/bundles/tabs/international.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Image,
  Alert,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '@/config/supabase';
import { useAuth } from '@/stores/auth-store';
import { useInternationalStore } from '@/stores/international-store';
import * as LocalAuthentication from 'expo-local-authentication';
import PinModal from '@/components/send/PinModal';
import CountryPickerModal from '@/components/CountryPickerModal'; // Import the new component

const { width, height } = Dimensions.get('window');

// API Base URL
const API_BASE_URL = 'https://api.payscribe.ng/api/v1';
const API_KEY = 'ps_pk_live_zFSRW85fIwCMXyyyLvRTUxLMX8UQheJZDia';

// Default data bundles for fallback
const DEFAULT_DATA_BUNDLES = [
  { 
    id: 'data1', 
    name: 'Basic Data', 
    display_text: '1GB Data Bundle',
    data: '1GB', 
    validity: '30 Days', 
    min_send: 5.00,
    max_send: 5.00,
    min_receive: 1.00,
    max_receive: 1.00,
    send_currency: 'USD',
    receive_currency: 'Local',
    current_rate: 1500,
    vend_type: 'fixed',
    lookup_required: false,
    uat: false,
  },
  { 
    id: 'data2', 
    name: 'Standard Data', 
    display_text: '3GB Data Bundle',
    data: '3GB', 
    validity: '30 Days', 
    min_send: 10.00,
    max_send: 10.00,
    min_receive: 3.00,
    max_receive: 3.00,
    send_currency: 'USD',
    receive_currency: 'Local',
    current_rate: 1500,
    vend_type: 'fixed',
    lookup_required: false,
    uat: false,
  },
  { 
    id: 'data3', 
    name: 'Premium Data', 
    display_text: '5GB Data Bundle',
    data: '5GB', 
    validity: '30 Days', 
    min_send: 20.00,
    max_send: 20.00,
    min_receive: 5.00,
    max_receive: 5.00,
    send_currency: 'USD',
    receive_currency: 'Local',
    current_rate: 1500,
    vend_type: 'fixed',
    lookup_required: false,
    uat: false,
  },
  { 
    id: 'data4', 
    name: 'Ultra Data', 
    display_text: '10GB Data Bundle',
    data: '10GB', 
    validity: '30 Days', 
    min_send: 30.00,
    max_send: 30.00,
    min_receive: 10.00,
    max_receive: 10.00,
    send_currency: 'USD',
    receive_currency: 'Local',
    current_rate: 1500,
    vend_type: 'fixed',
    lookup_required: false,
    uat: false,
  },
];

const InternationalDataScreen = () => {
  const { user, isAuthenticated, balance: authBalance } = useAuth();
  const internationalStore = useInternationalStore();
  
  // Phone input state
  const [phoneInput, setPhoneInput] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [dataProducts, setDataProducts] = useState([]);
  const [customAmount, setCustomAmount] = useState('');
  const [balance, setBalance] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [isBalanceLoading, setIsBalanceLoading] = useState(true);
  const [showPinModal, setShowPinModal] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  // Country picker state
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [providersList, setProvidersList] = useState([]); // Store fetched providers
  
  // Currency and amount state
  const [debitCurrency, setDebitCurrency] = useState('usd');
  const [convertedAmount, setConvertedAmount] = useState(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  
  // Animations
  const watermarkPulse = useState(new Animated.Value(1))[0];
  const skeletonOpacity = useState(new Animated.Value(0.5))[0];
  
  // Ref for phone input
  const phoneInputRef = useRef(null);

  // -------------------------------------------------------------------------
  // Initial Setup
  // -------------------------------------------------------------------------
  useEffect(() => {
    checkBiometricAvailability();
    
    console.log('🌍 International Data Screen mounted');
  }, []);

  useEffect(() => {
    if (isCheckingAuth || isBalanceLoading || internationalStore.loadingCountries) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(skeletonOpacity, {
            toValue: 0.3,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(skeletonOpacity, {
            toValue: 0.7,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      skeletonOpacity.setValue(1);
    }
  }, [isCheckingAuth, isBalanceLoading, internationalStore.loadingCountries]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(watermarkPulse, {
          toValue: 1.06,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(watermarkPulse, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  // -------------------------------------------------------------------------
  // Load Data Functions
  // -------------------------------------------------------------------------
  const loadProviders = async (country) => {
    if (!country) return;
    
    console.log(`📶 Loading providers for ${country.title}...`);
    setLoadingProviders(true);
    setProvidersList([]); // Clear previous providers
    
    try {
      const providers = await internationalStore.fetchProvidersByCountry(country.bpay_iso, 'data');
      
      // Manual filtering for data providers
      const dataProviders = providers.filter(provider => {
        // If service_type is set, use it
        if (provider.service_type === 'data') return true;
        
        // Otherwise, use name-based detection
        const name = (provider.name || '').toLowerCase();
        return name.includes('data') || 
               name.includes('internet') || 
               name.includes('broadband') ||
               name.includes('wifi') ||
               name.includes('fibre') ||
               name.includes('fiber') ||
               name.includes('rogers ignite') ||
               name.includes('bell fibe') ||
               name.includes('telus optik') ||
               name.includes('shaw');
      });
      
      console.log(`Found ${dataProviders.length} data providers out of ${providers.length} total providers`);
      
      setProvidersList(dataProviders.length > 0 ? dataProviders : providers);
      
      if (dataProviders.length > 0) {
        setSelectedProvider(dataProviders[0]);
        await loadProducts(country, dataProviders[0]);
      } else if (providers.length > 0) {
        setSelectedProvider(providers[0]);
        await loadProducts(country, providers[0]);
      } else {
        Alert.alert(
          'No Providers',
          'No data providers found for this country.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('❌ Error loading providers:', error);
      Alert.alert(
        'Error',
        'Could not load service providers. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoadingProviders(false);
    }
  };

  const loadProducts = async (country, provider) => {
    if (!country || !provider) return;
    
    console.log(`📦 Loading products for ${provider.name}...`);
    setLoadingProducts(true);
    
    try {
      const products = await internationalStore.fetchProductsByProvider(country.bpay_iso, provider.code);
      
      if (products.length > 0) {
        setDataProducts(products);
        setSelectedProduct(products[0]);
        const defaultAmount = products[0].min_send > 0 ? products[0].min_send : 5.00;
        setCustomAmount(defaultAmount.toString());
      } else {
        // Use default bundles as fallback
        console.log('⚠️ Using default data bundles');
        setDataProducts(DEFAULT_DATA_BUNDLES);
        setSelectedProduct(DEFAULT_DATA_BUNDLES[0]);
        setCustomAmount(DEFAULT_DATA_BUNDLES[0].min_send.toString());
      }
    } catch (error) {
      console.error('❌ Error loading products:', error);
      // Use default bundles as fallback
      setDataProducts(DEFAULT_DATA_BUNDLES);
      setSelectedProduct(DEFAULT_DATA_BUNDLES[0]);
      setCustomAmount(DEFAULT_DATA_BUNDLES[0].min_send.toString());
    } finally {
      setLoadingProducts(false);
    }
  };

  // -------------------------------------------------------------------------
  // Country Selection
  // -------------------------------------------------------------------------
  const handleCountrySelect = (country) => {
    console.log(`📍 Country selected: ${country.title} (+${country.prefix})`);
    
    setSelectedCountry(country);
    setSelectedProvider(null);
    setSelectedProduct(null);
    setDataProducts([]);
    setPhoneInput('');
    setCustomAmount('');
    setProvidersList([]);
    
    // Close country picker
    setShowCountryPicker(false);
    
    // Load providers for the selected country
    loadProviders(country);
  };

  // -------------------------------------------------------------------------
  // Phone Number Handling
  // -------------------------------------------------------------------------
  const handlePhoneInputChange = (text) => {
    // Remove all non-digit characters
    const cleaned = text.replace(/\D/g, '');
    
    // Auto-detect country if user starts typing country code
    if (cleaned.length > 0 && !selectedCountry) {
      // Look for country by prefix in the input
      const matchedCountry = internationalStore.countries.find(country => {
        const prefix = country.prefix;
        return cleaned.startsWith(prefix) || 
               text.includes(`+${prefix}`) ||
               text.includes(`00${prefix}`);
      });
      
      if (matchedCountry && matchedCountry.iso !== selectedCountry?.iso) {
        console.log(`🌍 Auto-detected country: ${matchedCountry.title}`);
        setSelectedCountry(matchedCountry);
        // Extract number without country code
        const numberOnly = cleaned.startsWith(matchedCountry.prefix)
          ? cleaned.slice(matchedCountry.prefix.length)
          : cleaned;
        
        setPhoneInput(numberOnly);
        loadProviders(matchedCountry);
        return;
      }
    }
    
    // If we have a selected country, check if input includes country code
    if (selectedCountry && cleaned.length > 0) {
      const prefix = selectedCountry.prefix;
      if (cleaned.startsWith(prefix)) {
        // Remove country code for display
        setPhoneInput(cleaned.slice(prefix.length));
      } else {
        setPhoneInput(cleaned);
      }
    } else {
      setPhoneInput(cleaned);
    }
  };

  // Get full phone number with country code
  const getFullPhoneNumber = () => {
    if (!selectedCountry || !phoneInput) return '';
    
    const cleanPhone = phoneInput.replace(/\D/g, '');
    if (!cleanPhone) return '';
    
    return `+${selectedCountry.prefix}${cleanPhone}`;
  };

  // Format phone number for display
  const formatPhoneDisplay = () => {
    if (!phoneInput) return '';
    
    const cleaned = phoneInput.replace(/\D/g, '');
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
    if (cleaned.length <= 9) return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 10)}`;
  };

  // -------------------------------------------------------------------------
  // Provider Selection
  // -------------------------------------------------------------------------
  const handleProviderSelect = async (provider) => {
    console.log(`📱 Provider selected: ${provider.name} (${provider.code})`);
    
    setSelectedProvider(provider);
    setSelectedProduct(null);
    setDataProducts([]);
    
    if (selectedCountry && provider) {
      await loadProducts(selectedCountry, provider);
    }
  };

  // -------------------------------------------------------------------------
  // Product Selection
  // -------------------------------------------------------------------------
  const handleProductSelect = (product) => {
    console.log(`📦 Product selected: ${product.display_text}`);
    setSelectedProduct(product);
    
    // Set default amount based on product
    const defaultAmount = product.min_send > 0 ? product.min_send : 5.00;
    setCustomAmount(defaultAmount.toString());
  };

  // -------------------------------------------------------------------------
  // Amount Handling
  // -------------------------------------------------------------------------
  const handleAmountChange = (text) => {
    let cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    
    if (parts[1] && parts[1].length > 2) {
      cleaned = parts[0] + '.' + parts[1].slice(0, 2);
    }
    
    setCustomAmount(cleaned);
  };

  // Calculate converted amount
  useEffect(() => {
    if (selectedProduct && customAmount && !isNaN(parseFloat(customAmount))) {
      calculateConversion();
    }
  }, [customAmount, selectedProduct, debitCurrency]);

  const calculateConversion = () => {
    const amount = parseFloat(customAmount);
    if (!amount || !selectedProduct) return;
    
    const rate = selectedProduct.current_rate || 1500;
    
    if (debitCurrency === 'usd') {
      const ngnAmount = amount * rate;
      setConvertedAmount(ngnAmount.toFixed(2));
    } else {
      const usdAmount = amount / rate;
      setConvertedAmount(usdAmount.toFixed(2));
    }
  };

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------
  const validatePhoneNumber = () => {
    if (!selectedCountry || !phoneInput) return false;
    
    const cleanPhone = phoneInput.replace(/\D/g, '');
    if (cleanPhone.length < 7) return false;
    
    // Basic validation - can be enhanced with country-specific regex
    return cleanPhone.length >= 7;
  };

  const validatePurchase = () => {
    if (!selectedCountry) {
      Alert.alert('Error', 'Please select a country');
      return false;
    }
    
    if (!validatePhoneNumber()) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return false;
    }
    
    if (!selectedProvider) {
      Alert.alert('Error', 'Please select a service provider');
      return false;
    }
    
    if (!selectedProduct) {
      Alert.alert('Error', 'Please select a data product');
      return false;
    }
    
    const amount = parseFloat(customAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return false;
    }
    
    // Validate against product limits
    if (selectedProduct.min_send && amount < selectedProduct.min_send) {
      Alert.alert('Error', `Minimum amount is ${selectedProduct.send_currency} ${formatCurrency(selectedProduct.min_send)}`);
      return false;
    }
    
    if (selectedProduct.max_send && amount > selectedProduct.max_send) {
      Alert.alert('Error', `Maximum amount is ${selectedProduct.send_currency} ${formatCurrency(selectedProduct.max_send)}`);
      return false;
    }
    
    // Calculate total cost in NGN
    const rate = selectedProduct.current_rate || 1500;
    const amountInNgn = debitCurrency === 'usd' 
      ? amount * rate
      : amount;
    
    if (amountInNgn > balance) {
      Alert.alert(
        'Insufficient Balance',
        `You need ₦${formatCurrency(amountInNgn)} but only have ₦${formatCurrency(balance)}`
      );
      return false;
    }
    
    return true;
  };

  // -------------------------------------------------------------------------
  // User Data and PIN Verification
  // -------------------------------------------------------------------------
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setIsCheckingAuth(true);
        
        if (!isAuthenticated || !user) {
          console.log('User not authenticated via useAuth hook');
          setIsBalanceLoading(false);
          setIsCheckingAuth(false);
          
          router.replace('/(auth)/login');
          return;
        }
        
        const email = user.currentAccount || user.email;
        if (!email) {
          throw new Error("User email not found");
        }
        
        setUserEmail(email);
        setBalance(authBalance || 0);
        
        try {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("transaction_pin")
            .eq("id", user.id)
            .single();

          if (!profileError && profile?.transaction_pin) {
            setHasPin(true);
          }
        } catch (profileErr) {
          console.log("Could not fetch PIN status:", profileErr);
        }
        
        const newReferenceId = `INT_DATA_${user.id}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        setReferenceId(newReferenceId);
        
        setIsBalanceLoading(false);
        setIsCheckingAuth(false);
        
      } catch (error) {
        console.error("Error in fetchUserData:", error);
        setIsBalanceLoading(false);
        setIsCheckingAuth(false);
        
        if (error.message.includes('authenticated') || error.message.includes('email')) {
          Alert.alert(
            'Session Expired',
            'Your session has expired. Please log in again.',
            [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
          );
        }
      }
    };
    
    fetchUserData();
  }, [isAuthenticated, user, authBalance]);

  const checkBiometricAvailability = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHardware && isEnrolled);
    } catch (error) {
      console.error('Error checking biometric availability:', error);
    }
  };

  // -------------------------------------------------------------------------
  // Payment Processing
  // -------------------------------------------------------------------------
  const handlePayButtonClick = () => {
    if (!validatePurchase()) return;
    
    if (!hasPin) {
      Alert.alert(
        'Transaction PIN Required',
        'Please set up a transaction PIN before making purchases.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Set PIN', onPress: () => router.push('/(app)/settings/pin') }
        ]
      );
      return;
    }
    
    setShowPinModal(true);
  };

  const handleFingerprintClick = async () => {
    if (!validatePurchase()) return;
    
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to purchase data bundle',
        fallbackLabel: 'Use PIN instead',
        disableDeviceFallback: false,
      });

      if (result.success) {
        processInternationalData('biometric');
      } else {
        Alert.alert(
          'Authentication Failed',
          'Biometric authentication was not successful. Please try PIN instead.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Biometric authentication error:', error);
      Alert.alert(
        'Authentication Error',
        'An error occurred during biometric authentication. Please use PIN instead.',
        [{ text: 'OK' }]
      );
    }
  };

  const processInternationalData = async (authMethod) => {
    setIsProcessing(true);
    
    try {
      const fullPhoneNumber = getFullPhoneNumber();
      const amount = parseFloat(customAmount);
      const rate = selectedProduct.current_rate || 1500;
      
      // Prepare transaction data
      const transactionData = {
        iso: selectedCountry.bpay_iso.toUpperCase(),
        provider_code: selectedProvider.code,
        sku: selectedProduct.sku || selectedProduct.id,
        amount: amount.toString(),
        account: phoneInput.replace(/\D/g, ''),
        debit_currency: debitCurrency,
        ref: referenceId,
        user_id: user.id,
        user_email: userEmail,
        status: 'pending',
        created_at: new Date().toISOString(),
        country_name: selectedCountry.title,
        provider_name: selectedProvider.name,
        product_name: selectedProduct.display_text || selectedProduct.name,
        phone_number: fullPhoneNumber,
        usd_rate: rate,
        amount_ngn: debitCurrency === 'usd' ? amount * rate : amount,
        amount_usd: debitCurrency === 'usd' ? amount : amount / rate,
        service_type: 'data',
      };
      
      // Save to Supabase first
      try {
        const { data: transaction, error } = await supabase
          .from('international_transactions')
          .insert([transactionData])
          .select()
          .single();
        
        if (error) {
          console.warn('Could not save to database:', error);
        }
      } catch (dbError) {
        console.warn('Database error:', dbError);
      }
      
      // Call Payscribe API
      const response = await fetch(`${API_BASE_URL}/international-bills/vend`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          iso: selectedCountry.bpay_iso.toUpperCase(),
          provider_code: selectedProvider.code,
          sku: selectedProduct.sku || selectedProduct.id,
          amount: amount.toString(),
          account: phoneInput.replace(/\D/g, ''),
          debit_currency: debitCurrency,
          ref: referenceId
        })
      });
      
      const apiResponse = await response.json();
      
      if (apiResponse.status) {
        // Success
        router.push({
          pathname: '/(app)/success',
          params: {
            type: 'international-data',
            amount: customAmount,
            phone: fullPhoneNumber,
            country: selectedCountry.title,
            provider: selectedProvider.name,
            product: selectedProduct.display_text || selectedProduct.name,
            currency: selectedProduct.send_currency || 'USD',
            convertedAmount: convertedAmount,
            reference: referenceId,
            authMethod: authMethod,
            debitCurrency: debitCurrency,
            usdRate: rate,
            apiStatus: 'success',
            apiMessage: apiResponse.description || 'Transaction successful'
          }
        });
      } else {
        throw new Error(apiResponse.description || 'Transaction failed');
      }
      
    } catch (error) {
      console.error('Error processing international data:', error);
      Alert.alert(
        'Transaction Error',
        error.message || 'An error occurred while processing your transaction. Please try again.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePinVerified = async (pin) => {
    setShowPinModal(false);
    processInternationalData('pin');
  };

  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------
  const formatCurrency = (amount) => {
    if (!amount) return '0.00';
    const num = parseFloat(amount);
    return isNaN(num) ? '0.00' : num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // -------------------------------------------------------------------------
  // Skeleton Components
  // -------------------------------------------------------------------------
  const SkeletonText = ({ width = '100%', height = 20 }) => (
    <Animated.View style={[styles.skeleton, { width, height, opacity: skeletonOpacity }]} />
  );

  const SkeletonInput = () => (
    <Animated.View style={[styles.skeleton, styles.skeletonInput, { opacity: skeletonOpacity }]} />
  );

  // Show skeleton UI while loading
  if (isCheckingAuth || isBalanceLoading) {
    return (
      <View style={styles.container}>
        <Animated.View pointerEvents="none" style={styles.watermarkWrapper}>
          <Animated.Image
            source={require('@/assets/icons/home.png')}
            style={[styles.watermark, { transform: [{ scale: watermarkPulse }] }]}
            resizeMode="contain"
          />
        </Animated.View>

        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.balanceContainer}>
              <SkeletonText width={60} height={14} />
            </View>
            
            <View style={styles.serviceToggle}>
              <View style={styles.serviceButton}>
                <SkeletonText width={40} height={12} />
              </View>
              <View style={[styles.serviceButton, styles.serviceButtonActive]}>
                <SkeletonText width={40} height={12} />
              </View>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.tabContainer}>
              <View style={styles.tab}>
                <SkeletonText width={80} height={13} />
              </View>
              <View style={[styles.tab, styles.tabActive]}>
                <SkeletonText width={80} height={13} />
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <SkeletonText width={100} height={14} />
              </View>
              <SkeletonInput />
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <SkeletonText width={80} height={14} />
              </View>
              <SkeletonInput />
            </View>

            <View style={styles.securityNotice}>
              <SkeletonText width="100%" height={14} />
            </View>

            <View style={styles.actionButtonsContainer}>
              <View style={[styles.payButton, styles.payButtonDisabled]}>
                <SkeletonText width={60} height={16} />
              </View>
              <View style={[styles.biometricButton, styles.biometricButtonDisabled]} />
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Main Render
  // -------------------------------------------------------------------------
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Animated.View pointerEvents="none" style={styles.watermarkWrapper}>
        <Animated.Image
          source={require('@/assets/icons/home.png')}
          style={[styles.watermark, { transform: [{ scale: watermarkPulse }] }]}
          resizeMode="contain"
        />
      </Animated.View>

      <View style={styles.content}>
        {/* Header with Balance and Toggle */}
        <View style={styles.header}>
          <View style={styles.balanceContainer}>
            <Ionicons name="wallet-outline" size={16} color="#FFD700" />
            <Text style={styles.balanceText}>
              {`₦${formatCurrency(balance)}`}
            </Text>
          </View>
          
          <View style={styles.serviceToggle}>
            <TouchableOpacity
              style={styles.serviceButton}
              onPress={() => router.push('/(app)/airtime')}
            >
              <Text style={styles.serviceButtonText}>
                Airtime
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.serviceButton, styles.serviceButtonActive]}
            >
              <Text style={styles.serviceButtonTextActive}>
                Data
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Tab Navigation - Local/International */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={styles.tab}
              onPress={() => router.push('/(app)/data')}
            >
              <Text style={styles.tabText}>
                🇳🇬 Local
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, styles.tabActive]}
            >
              <Text style={styles.tabTextActive}>
                🌍 International
              </Text>
            </TouchableOpacity>
          </View>

          {/* Phone Input with Country Selector */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="call-outline" size={18} color="#FFD700" />
              <Text style={styles.sectionTitle}>
                {selectedCountry ? `${selectedCountry.title} Phone Number` : 'Phone Number'}
              </Text>
            </View>
            
            <TouchableOpacity
              style={styles.phoneInputContainer}
              onPress={() => phoneInputRef.current?.focus()}
            >
              {/* Country Selector Button */}
              <TouchableOpacity
                style={styles.countrySelectorButton}
                onPress={() => setShowCountryPicker(true)}
              >
                {selectedCountry ? (
                  <>
                    <Text style={styles.countryFlag}>
                      {selectedCountry.flag_emoji || '🌍'}
                    </Text>
                    <Text style={styles.countryCode}>
                      +{selectedCountry.prefix}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#FFD700" />
                  </>
                ) : (
                  <>
                    <Text style={styles.countryFlag}>🌍</Text>
                    <Ionicons name="chevron-down" size={16} color="#FFD700" />
                  </>
                )}
              </TouchableOpacity>
              
              {/* Phone Input */}
              <TextInput
                ref={phoneInputRef}
                style={styles.phoneInput}
                placeholder={selectedCountry ? `Enter ${selectedCountry.title} number` : 'Select country first'}
                placeholderTextColor="#666"
                value={formatPhoneDisplay()}
                onChangeText={handlePhoneInputChange}
                keyboardType="phone-pad"
                editable={!!selectedCountry}
              />
            </TouchableOpacity>
            
            {/* Country Info */}
            {selectedCountry && (
              <View style={styles.countryInfo}>
                <Text style={styles.countryInfoText}>
                  {selectedCountry.title} • +{selectedCountry.prefix}
                </Text>
                {selectedCountry.currency_code && (
                  <Text style={styles.currencyInfoText}>
                    {selectedCountry.currency_code} ({selectedCountry.currency_symbol})
                  </Text>
                )}
              </View>
            )}
            
            {/* Phone Validation */}
            {phoneInput && !validatePhoneNumber() && (
              <Text style={styles.validationError}>
                Please enter a valid phone number
              </Text>
            )}
          </View>

          {/* Provider Selection - Only show if country selected */}
          {selectedCountry && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="cellular-outline" size={18} color="#FFD700" />
                <Text style={styles.sectionTitle}>Select Data Provider</Text>
                {loadingProviders && (
                  <ActivityIndicator size="small" color="#FFD700" style={styles.loadingIndicator} />
                )}
              </View>
              
              {loadingProviders ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Loading providers...</Text>
                </View>
              ) : providersList.length > 0 ? (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.providersScroll}
                  contentContainerStyle={styles.providersContent}
                >
                  {providersList.map((provider) => (
                    <TouchableOpacity
                      key={provider.code}
                      style={[
                        styles.providerButton,
                        selectedProvider?.code === provider.code && styles.providerButtonActive
                      ]}
                      onPress={() => handleProviderSelect(provider)}
                    >
                      <View style={styles.providerButtonContent}>
                        <Ionicons 
                          name="cellular" 
                          size={16} 
                          color={selectedProvider?.code === provider.code ? '#FFD700' : '#999'} 
                        />
                        <Text style={[
                          styles.providerButtonText,
                          selectedProvider?.code === provider.code && styles.providerButtonTextActive
                        ]}>
                          {provider.name}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.noProvidersContainer}>
                  <Ionicons name="cellular-outline" size={32} color="#666" />
                  <Text style={styles.noProvidersTitle}>No Data Providers</Text>
                  <Text style={styles.noProvidersText}>
                    No data providers available for {selectedCountry.title}.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Data Product Selection - Only show if provider selected */}
          {selectedProvider && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="wifi-outline" size={18} color="#FFD700" />
                <Text style={styles.sectionTitle}>Select Data Product</Text>
                {loadingProducts && (
                  <ActivityIndicator size="small" color="#FFD700" style={styles.loadingIndicator} />
                )}
              </View>
              
              {loadingProducts ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Loading data products...</Text>
                </View>
              ) : dataProducts.length > 0 ? (
                <ScrollView 
                  style={styles.productsScroll}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled={true}
                >
                  {dataProducts.map((product) => (
                    <TouchableOpacity
                      key={product.id}
                      style={[
                        styles.productButton,
                        selectedProduct?.id === product.id && styles.productButtonActive
                      ]}
                      onPress={() => handleProductSelect(product)}
                    >
                      <View style={styles.productContent}>
                        <View style={styles.productInfo}>
                          <Text style={[
                            styles.productName,
                            selectedProduct?.id === product.id && styles.productNameActive
                          ]}>
                            {product.display_text || product.name}
                          </Text>
                          <View style={styles.productDetails}>
                            <Text style={styles.productDetailText}>
                              {product.send_currency} {formatCurrency(product.min_send)} - {formatCurrency(product.max_send)}
                            </Text>
                            <Text style={styles.productReceive}>
                              Receive: {product.receive_currency} {formatCurrency(product.min_receive)} - {formatCurrency(product.max_receive)}
                            </Text>
                          </View>
                        </View>
                        <Ionicons 
                          name={selectedProduct?.id === product.id ? "checkmark-circle" : "radio-button-off"} 
                          size={20} 
                          color={selectedProduct?.id === product.id ? '#FFD700' : '#666'} 
                        />
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.noProductsContainer}>
                  <Ionicons name="wifi-outline" size={32} color="#666" />
                  <Text style={styles.noProductsTitle}>No Data Products</Text>
                  <Text style={styles.noProductsText}>
                    No data products available for {selectedProvider.name}.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Amount Input - Only show if product selected */}
          {selectedProduct && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="cash-outline" size={18} color="#FFD700" />
                <Text style={styles.sectionTitle}>Enter Amount</Text>
              </View>
              
              {/* Currency Toggle */}
              <View style={styles.currencyToggleContainer}>
                <TouchableOpacity
                  style={[
                    styles.currencyToggleButton,
                    debitCurrency === 'usd' && styles.currencyToggleButtonActive
                  ]}
                  onPress={() => setDebitCurrency('usd')}
                >
                  <Text style={[
                    styles.currencyToggleText,
                    debitCurrency === 'usd' && styles.currencyToggleTextActive
                  ]}>
                    Pay in USD
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.currencyToggleButton,
                    debitCurrency === 'ngn' && styles.currencyToggleButtonActive
                  ]}
                  onPress={() => setDebitCurrency('ngn')}
                >
                  <Text style={[
                    styles.currencyToggleText,
                    debitCurrency === 'ngn' && styles.currencyToggleTextActive
                  ]}>
                    Pay in NGN
                  </Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.amountInputContainer}>
                <Text style={styles.currencySymbol}>
                  {debitCurrency === 'usd' ? '$' : '₦'}
                </Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor="#666"
                  value={customAmount}
                  onChangeText={handleAmountChange}
                  keyboardType="decimal-pad"
                />
              </View>
              
              {/* Product Limits */}
              {selectedProduct && (
                <View style={styles.productLimits}>
                  <Text style={styles.productLimitsText}>
                    Min: {selectedProduct.send_currency} {formatCurrency(selectedProduct.min_send)} • Max: {formatCurrency(selectedProduct.max_send)}
                  </Text>
                  {selectedProduct.current_rate > 0 && (
                    <Text style={styles.rateText}>
                      Rate: 1 USD = {selectedProduct.current_rate} NGN
                    </Text>
                  )}
                </View>
              )}
              
              {/* Conversion Display */}
              {customAmount && !isNaN(parseFloat(customAmount)) && convertedAmount && (
                <View style={styles.conversionDisplay}>
                  <Text style={styles.conversionText}>
                    {debitCurrency === 'usd' ? (
                      <>
                        <Text style={styles.conversionHighlight}>
                          ${formatCurrency(customAmount)} USD
                        </Text>
                        {' = '}
                        <Text style={styles.conversionHighlight}>
                          ₦{formatCurrency(convertedAmount)} NGN
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.conversionHighlight}>
                          ₦{formatCurrency(customAmount)} NGN
                        </Text>
                        {' = '}
                        <Text style={styles.conversionHighlight}>
                          ${formatCurrency(convertedAmount)} USD
                        </Text>
                      </>
                    )}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Security Notice */}
          <View style={styles.securityNotice}>
            <Ionicons name="warning" size={14} color="#FFD700" />
            <Text style={styles.securityText}>
              International data products are secured and processed through Payscribe API.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={[
                styles.payButton,
                (!phoneInput || !customAmount || !selectedCountry || !selectedProvider || !selectedProduct) && styles.payButtonDisabled
              ]}
              onPress={handlePayButtonClick}
              disabled={!phoneInput || !customAmount || !selectedCountry || !selectedProvider || !selectedProduct || isProcessing}
            >
              <Text style={styles.payButtonText}>
                {isProcessing ? 'Processing...' : `Buy ${debitCurrency === 'usd' ? '$' : '₦'}${formatCurrency(customAmount)}`}
              </Text>
            </TouchableOpacity>
            
            {biometricAvailable && (
              <TouchableOpacity
                style={[
                  styles.biometricButton,
                  (!phoneInput || !customAmount || !selectedCountry || !selectedProvider || !selectedProduct) && styles.biometricButtonDisabled
                ]}
                onPress={handleFingerprintClick}
                disabled={!phoneInput || !customAmount || !selectedCountry || !selectedProvider || !selectedProduct || isProcessing}
              >
                <Ionicons 
                  name={Platform.OS === 'ios' ? 'fingerprint' : 'finger-print'} 
                  size={24} 
                  color="#FFD700" 
                />
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Country Picker Modal */}
      <CountryPickerModal
        visible={showCountryPicker}
        onClose={() => setShowCountryPicker(false)}
        onSelect={handleCountrySelect}
        selectedCountry={selectedCountry}
      />

      {/* PIN Modal */}
      <PinModal
        visible={showPinModal}
        onClose={() => setShowPinModal(false)}
        onVerify={handlePinVerified}
        title="Enter Transaction PIN"
        description="Enter your 4-digit PIN to confirm this international data purchase"
      />
    </KeyboardAvoidingView>
  );
};

// Styles (same as before, just keep them)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  skeleton: {
    backgroundColor: '#333',
    borderRadius: 4,
  },
  skeletonInput: {
    height: 48,
    width: '100%',
    borderRadius: 8,
  },
  watermarkWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  watermark: {
    width: 300,
    height: 300,
    opacity: 0.1,
  },
  content: {
    flex: 1,
    zIndex: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#000',
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  balanceText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
  },
  serviceToggle: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderRadius: 20,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  serviceButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  serviceButtonActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  serviceButtonText: {
    color: '#999',
    fontSize: 12,
    fontWeight: '600',
  },
  serviceButtonTextActive: {
    color: '#FFD700',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderRadius: 20,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabActive: {
    borderColor: '#FFD700',
    backgroundColor: 'transparent',
  },
  tabText: {
    color: '#999',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFD700',
  },
  sectionCard: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingIndicator: {
    marginLeft: 8,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  countrySelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRightWidth: 1,
    borderRightColor: '#333',
  },
  countryFlag: {
    fontSize: 20,
  },
  countryCode: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4,
  },
  phoneInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  countryInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  countryInfoText: {
    color: '#999',
    fontSize: 12,
  },
  currencyInfoText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '600',
  },
  validationError: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 6,
  },
  providersScroll: {
    flexDirection: 'row',
  },
  providersContent: {
    paddingRight: 16,
  },
  providerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    marginRight: 8,
    minWidth: 90,
    height: 40,
    justifyContent: 'center',
  },
  providerButtonActive: {
    borderColor: '#FFD700',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  providerButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  providerButtonText: {
    color: '#999',
    fontSize: 12,
  },
  providerButtonTextActive: {
    color: '#FFD700',
    fontWeight: '600',
  },
  noProvidersContainer: {
    alignItems: 'center',
    padding: 20,
  },
  noProvidersTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },
  noProvidersText: {
    color: '#999',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#FFD700',
    fontSize: 12,
    marginTop: 8,
  },
  productsScroll: {
    maxHeight: 200,
  },
  productButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 8,
  },
  productButtonActive: {
    borderColor: '#FFD700',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  productContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  productNameActive: {
    color: '#FFD700',
  },
  productDetails: {
    gap: 2,
  },
  productDetailText: {
    color: '#999',
    fontSize: 12,
  },
  productReceive: {
    color: '#FFD700',
    fontSize: 11,
  },
  noProductsContainer: {
    alignItems: 'center',
    padding: 20,
  },
  noProductsTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },
  noProductsText: {
    color: '#999',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  currencyToggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderRadius: 20,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
    alignSelf: 'flex-start',
  },
  currencyToggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  currencyToggleButtonActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  currencyToggleText: {
    color: '#999',
    fontSize: 12,
    fontWeight: '600',
  },
  currencyToggleTextActive: {
    color: '#FFD700',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 14,
  },
  currencySymbol: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: '300',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    paddingVertical: 12,
  },
  productLimits: {
    marginTop: 12,
    padding: 8,
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  productLimitsText: {
    color: '#FFD700',
    fontSize: 12,
    marginBottom: 4,
  },
  rateText: {
    color: '#999',
    fontSize: 11,
  },
  conversionDisplay: {
    marginTop: 12,
    padding: 10,
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  conversionText: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
  },
  conversionHighlight: {
    color: '#FFD700',
    fontWeight: '600',
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'transparent',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  securityText: {
    flex: 1,
    color: '#FFD7',
    fontSize: 11,
    lineHeight: 14,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 30,
    marginTop: 10,
  },
  payButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#FFD700',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  payButtonDisabled: {
    borderColor: '#666',
    opacity: 0.5,
  },
  payButtonText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  biometricButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
  },
  biometricButtonDisabled: {
    borderColor: '#666',
    opacity: 0.5,
  },
});

export default InternationalDataScreen;