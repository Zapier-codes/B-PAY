// app/(app)/airtime/international.tsx
import React, { useState, useEffect } from 'react';
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

const { width } = Dimensions.get('window');

// Quick Amount Presets (in USD)
const QUICK_AMOUNTS = [
  { label: '$5.00', value: 5.00 },
  { label: '$10.00', value: 10.00 },
  { label: '$20.00', value: 20.00 },
  { label: '$50.00', value: 50.00 },
];

const InternationalAirtimeScreen = () => {
  const { user, isAuthenticated, balance: authBalance } = useAuth();
  const internationalStore = useInternationalStore();
  
  const [phone, setPhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [airtimeLimits, setAirtimeLimits] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [balance, setBalance] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [isBalanceLoading, setIsBalanceLoading] = useState(true);
  const [showPinModal, setShowPinModal] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [quickAmountClicks, setQuickAmountClicks] = useState({});
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [countrySearch, setCountrySearch] = useState('');
  const [showCountriesList, setShowCountriesList] = useState(false);
  const [filteredCountries, setFilteredCountries] = useState([]);
  const [debitCurrency, setDebitCurrency] = useState('usd');
  const [convertedAmount, setConvertedAmount] = useState(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [supportedCountries, setSupportedCountries] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingLimits, setLoadingLimits] = useState(false);
  const [loadingCountries, setLoadingCountries] = useState(true);
  
  // Animations
  const watermarkPulse = useState(new Animated.Value(1))[0];
  const skeletonOpacity = useState(new Animated.Value(0.5))[0];

  // -------------------------------------------------------------------------
  // Initial Setup
  // -------------------------------------------------------------------------
  useEffect(() => {
    checkBiometricAvailability();
    loadCountries();
    
    console.log('🌍 International Airtime Screen mounted');
  }, []);

  useEffect(() => {
    if (isCheckingAuth || isBalanceLoading || loadingCountries) {
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
  }, [isCheckingAuth, isBalanceLoading, loadingCountries]);

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

  const checkBiometricAvailability = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHardware && isEnrolled);
    } catch (error) {
      console.error('Error checking biometric availability:', error);
    }
  };

  const loadCountries = async () => {
    try {
      console.log('🌍 Loading countries from store...');
      setLoadingCountries(true);
      const countries = await internationalStore.fetchCountries();
      
      console.log(`✅ Loaded ${countries.length} supported countries`);
      setSupportedCountries(countries);
      setFilteredCountries(countries.slice(0, 8));
      
      // Auto-select Ghana for testing
      if (__DEV__) {
        const ghana = countries.find(c => c.bpay_iso?.toUpperCase() === 'GH');
        if (ghana) {
          console.log('🇬🇭 Auto-selecting Ghana for testing');
          setTimeout(() => handleCountrySelect(ghana), 1000);
        }
      }
      
    } catch (error) {
      console.error('❌ Error loading countries:', error);
      Alert.alert('Error', 'Failed to load countries. Please try again.');
    } finally {
      setLoadingCountries(false);
    }
  };

  // -------------------------------------------------------------------------
  // Filter countries based on search
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (countrySearch.trim()) {
      const filtered = supportedCountries.filter(country =>
        (country.title?.toLowerCase() || '').includes(countrySearch.toLowerCase()) ||
        (country.iso?.toLowerCase() || '').includes(countrySearch.toLowerCase())
      );
      setFilteredCountries(filtered.slice(0, 20));
    } else {
      setFilteredCountries(supportedCountries.slice(0, 8));
    }
  }, [countrySearch, supportedCountries]);

  // -------------------------------------------------------------------------
  // Load providers when country is selected - ONLY AIRTIME PROVIDERS
  // -------------------------------------------------------------------------
  const loadProviders = async (country) => {
    if (!country) return;
    
    console.log(`📱 Loading AIRTIME providers for ${getCountryName(country)}...`);
    
    setLoadingProviders(true);
    setSelectedProvider(null);
    setAirtimeLimits(null);
    
    try {
      // Get the Payscribe ISO for this country - USE UPPERCASE
      const payscribeIso = (country.bpay_iso || country.iso || '').toUpperCase();
      
      console.log(`🔍 Payscribe ISO for ${getCountryName(country)}: ${payscribeIso}`);
      
      // Fetch ONLY airtime providers
      const providers = await internationalStore.fetchProvidersByCountry(payscribeIso, 'airtime');
      
      console.log(`✅ Found ${providers.length} airtime providers for ${payscribeIso}`);
      
      if (providers.length > 0) {
        setSelectedProvider(providers[0]);
        console.log(`🎯 Selected provider: ${providers[0].name} (${providers[0].code})`);
        
        // Load airtime limits for the first provider
        loadAirtimeLimits(payscribeIso, providers[0].code);
      } else {
        console.log(`⚠️ No airtime providers found for ${payscribeIso}`);
        
        // Check if there are any providers at all
        try {
          const allProviders = await internationalStore.fetchProvidersByCountry(payscribeIso, 'all');
          
          if (allProviders.length > 0) {
            // Show what services are available
            const serviceTypes = [...new Set(allProviders.map(p => p.service_type || 'unknown'))];
            const serviceList = serviceTypes.join(', ');
            
            Alert.alert(
              'No Airtime Providers',
              `This country has providers for: ${serviceList}.`,
              [
                { text: 'Switch to Data', onPress: () => router.push('/(app)/bundles/tabs/international') },
                { text: 'OK', style: 'cancel' }
              ]
            );
          } else {
            Alert.alert(
              'No Providers',
              'No service providers are available for this country at the moment.',
              [{ text: 'OK' }]
            );
          }
        } catch (error) {
          console.error('Error checking all providers:', error);
          Alert.alert(
            'No Airtime Service',
            'Airtime service is not available for this country.',
            [{ text: 'OK' }]
          );
        }
      }
    } catch (error) {
      console.error('❌ Error loading providers:', error);
      
      if (error.message.includes('Something went wrong when fetching the country')) {
        Alert.alert(
          'Service Unavailable',
          `International airtime service is not available for ${getCountryName(country)}. Please select another country.`,
          [{ text: 'OK' }]
        );
      } else if (error.message.includes('Failed to fetch')) {
        Alert.alert(
          'Network Error',
          'Unable to connect to the service. Please check your internet connection.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Failed to load service providers for this country.');
      }
    } finally {
      setLoadingProviders(false);
    }
  };

  // Load airtime limits for the provider
  const loadAirtimeLimits = async (payscribeIso, providerCode) => {
    console.log(`📊 Loading airtime limits for ${payscribeIso}/${providerCode}...`);
    
    setLoadingLimits(true);
    setAirtimeLimits(null);
    
    try {
      // Get airtime limits from store (this will try API but fall back to defaults)
      const limits = await internationalStore.getAirtimeLimits(payscribeIso, providerCode);
      
      console.log(`✅ Loaded airtime limits:`, {
        min_send: limits.min_send,
        max_send: limits.max_send,
        current_rate: limits.current_rate,
        send_currency: limits.send_currency,
        receive_currency: limits.receive_currency
      });
      setAirtimeLimits(limits);
      
      // Calculate estimate if we have an amount entered
      if (customAmount) {
        calculateEstimate();
      }
      
    } catch (error) {
      console.error('❌ Error loading airtime limits:', error);
      // Even if limits fail, we can still proceed with defaults
      Alert.alert(
        'Info',
        'Using standard airtime limits. You can proceed with the transaction.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoadingLimits(false);
    }
  };

  // -------------------------------------------------------------------------
  // Handle country selection
  // -------------------------------------------------------------------------
  const handleCountrySelect = (country) => {
    console.log(`📍 Country selected: ${getCountryName(country)} (${country.bpay_iso})`);
    
    setSelectedCountry(country);
    setShowCountriesList(false);
    setCountrySearch('');
    setSelectedProvider(null);
    setAirtimeLimits(null);
    setPhone('');
    
    // Load airtime providers for the selected country
    loadProviders(country);
  };

  // -------------------------------------------------------------------------
  // Handle provider selection
  // -------------------------------------------------------------------------
  const handleProviderSelect = (provider) => {
    console.log(`📱 Provider selected: ${provider.name} (${provider.code})`);
    
    setSelectedProvider(provider);
    setAirtimeLimits(null);
    
    if (selectedCountry && provider) {
      // Get Payscribe ISO for the selected country
      const payscribeIso = (selectedCountry.bpay_iso || selectedCountry.iso || '').toUpperCase();
      loadAirtimeLimits(payscribeIso, provider.code);
    }
  };

  // -------------------------------------------------------------------------
  // Calculate Estimate when amount changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (airtimeLimits && customAmount) {
      calculateEstimate();
    }
  }, [customAmount, airtimeLimits, debitCurrency]);

  const calculateEstimate = () => {
    if (!customAmount || !airtimeLimits) return;
    
    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount <= 0) return;
    
    setLoadingEstimate(true);
    
    try {
      const usdRate = airtimeLimits.current_rate; // Use only from API
      
      // Calculate converted amount for display
      if (debitCurrency === 'ngn') {
        const usdAmount = amount / usdRate;
        setConvertedAmount(usdAmount.toFixed(2));
      } else {
        const ngnAmount = amount * usdRate;
        setConvertedAmount(ngnAmount.toFixed(2));
      }
    } catch (error) {
      console.error('Error calculating estimate:', error);
    } finally {
      setLoadingEstimate(false);
    }
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
        
        const newReferenceId = `INT_AIRTIME_${user.id}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
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

  // -------------------------------------------------------------------------
  // Validation and Processing
  // -------------------------------------------------------------------------
  const validatePhoneNumber = (phoneNumber, country) => {
    if (!phoneNumber || !country) return false;
    
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    const countryPrefix = country.prefix || country.dial_code?.replace('+', '') || '';
    
    if (countryPrefix) {
      const startsWithPrefix = cleanPhone.startsWith(countryPrefix);
      const expectedLength = countryPrefix.length + 7;
      return startsWithPrefix && cleanPhone.length >= expectedLength;
    }
    
    return cleanPhone.length >= 10;
  };

  const validatePurchase = () => {
    if (!selectedCountry) {
      Alert.alert('Error', 'Please select a country');
      return false;
    }
    
    if (!phone) {
      Alert.alert('Error', 'Please enter a phone number');
      return false;
    }
    
    if (!validatePhoneNumber(phone, selectedCountry)) {
      const countryName = selectedCountry.title || selectedCountry.name || 'this country';
      Alert.alert('Error', `Please enter a valid ${countryName} phone number`);
      return false;
    }
    
    if (!selectedProvider) {
      Alert.alert('Error', 'Please select a service provider');
      return false;
    }
    
    const amount = parseFloat(customAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return false;
    }
    
    // Use airtime limits for validation
    if (airtimeLimits) {
      const minSend = parseFloat(airtimeLimits.min_send || 0.11);
      const maxSend = parseFloat(airtimeLimits.max_send || 100);
      
      if (amount < minSend) {
        Alert.alert('Error', `Minimum amount is ${airtimeLimits.send_currency} ${minSend}`);
        return false;
      }
      
      if (amount > maxSend && maxSend > 0) {
        Alert.alert('Error', `Maximum amount is ${airtimeLimits.send_currency} ${maxSend}`);
        return false;
      }
    } else {
      // Use default limits if airtimeLimits is not loaded
      if (amount < 0.11) {
        Alert.alert('Error', 'Minimum amount is $0.11 USD');
        return false;
      }
      
      if (amount > 100) {
        Alert.alert('Error', 'Maximum amount is $100 USD');
        return false;
      }
    }
    
    const usdRate = airtimeLimits?.current_rate || 0;
    const amountInNgn = debitCurrency === 'usd' 
      ? amount * usdRate
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
  // Payment Methods
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
        promptMessage: 'Authenticate to complete purchase',
        fallbackLabel: 'Use PIN instead',
        disableDeviceFallback: false,
      });

      if (result.success) {
        processInternationalAirtime('biometric');
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

  const processInternationalAirtime = async (authMethod) => {
    setIsProcessing(true);
    
    try {
      // Prepare transaction data - use Payscribe ISO (uppercase)
      const payscribeIso = (selectedCountry.bpay_iso || selectedCountry.iso || '').toUpperCase();
      
      const transactionData = {
        iso: payscribeIso,
        provider_code: selectedProvider.code,
        sku: airtimeLimits?.sku || `${payscribeIso}_${selectedProvider.code}_TopUp`,
        amount: customAmount,
        account: phone.replace(/\D/g, ''),
        debit_currency: debitCurrency,
        ref: referenceId,
        user_id: user.id,
        user_email: userEmail,
        status: 'pending',
        created_at: new Date().toISOString(),
        country_name: selectedCountry.title || selectedCountry.name,
        provider_name: selectedProvider.name,
        phone_number: phone,
        usd_rate: airtimeLimits?.current_rate || 0,
        amount_ngn: debitCurrency === 'usd' 
          ? parseFloat(customAmount) * (airtimeLimits?.current_rate || 0)
          : parseFloat(customAmount),
        amount_usd: debitCurrency === 'usd'
          ? parseFloat(customAmount)
          : parseFloat(customAmount) / (airtimeLimits?.current_rate || 1)
      };
      
      // Try to save to Supabase
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
      
      // Navigate to success page
      router.push({
        pathname: '/(app)/success',
        params: {
          type: 'international-airtime',
          amount: customAmount,
          phone: phone,
          country: selectedCountry.title || selectedCountry.name,
          provider: selectedProvider.name,
          currency: airtimeLimits?.receive_currency || 'USD',
          convertedAmount: convertedAmount,
          reference: referenceId,
          authMethod: authMethod,
          debitCurrency: debitCurrency,
          usdRate: airtimeLimits?.current_rate || 0
        }
      });
      
    } catch (error) {
      console.error('Error processing international airtime:', error);
      Alert.alert('Transaction Error', 'An error occurred while processing your transaction. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePinVerified = async (pin) => {
    setShowPinModal(false);
    processInternationalAirtime('pin');
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

  const getCountryFlag = (country) => {
    return country.flag_emoji || '🌍';
  };

  const getCountryName = (country) => {
    return country.title || country.name || 'Unknown Country';
  };

  const getCountryPrefix = (country) => {
    return country.prefix || country.dial_code?.replace('+', '') || '';
  };

  const handleQuickAmountClick = (amount) => {
    const currentAmount = parseFloat(customAmount) || 0;
    const newAmount = currentAmount + amount;
    setCustomAmount(newAmount.toFixed(2));
    
    setQuickAmountClicks(prev => ({
      ...prev,
      [amount]: (prev[amount] || 0) + 1
    }));
  };

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

  // -------------------------------------------------------------------------
  // Skeleton Components
  // -------------------------------------------------------------------------
  const SkeletonText = ({ width = '100%', height = 20 }) => (
    <Animated.View style={[styles.skeleton, { width, height, opacity: skeletonOpacity }]} />
  );

  const SkeletonInput = () => (
    <Animated.View style={[styles.skeleton, styles.skeletonInput, { opacity: skeletonOpacity }]} />
  );

  const SkeletonButton = ({ width = 80 }) => (
    <Animated.View style={[styles.skeleton, styles.skeletonButton, { width, opacity: skeletonOpacity }]} />
  );

  // Show skeleton UI while loading
  if (isCheckingAuth || isBalanceLoading || loadingCountries) {
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
              <View style={[styles.tab, styles.tabActive]}>
                <SkeletonText width={80} height={13} />
              </View>
              <View style={styles.tab}>
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
                <SkeletonText width={100} height={14} />
              </View>
              <SkeletonInput />
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <SkeletonText width={80} height={14} />
              </View>
              <SkeletonInput />
              
              <View style={styles.quickAmounts}>
                {QUICK_AMOUNTS.map((_, index) => (
                  <SkeletonButton key={index} width={80} />
                ))}
              </View>
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
              style={[styles.serviceButton, styles.serviceButtonActive]}
            >
              <Text style={styles.serviceButtonTextActive}>
                Airtime
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.serviceButton}
              onPress={() => router.push('/(app)/bundles/tabs/international')}
            >
              <Text style={styles.serviceButtonText}>
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
              onPress={() => router.push('/(app)/airtime')}
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

          {/* Country Selection */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="globe-outline" size={18} color="#FFD700" />
              <Text style={styles.sectionTitle}>Select Country</Text>
            </View>
            
            <View style={styles.countrySearchContainer}>
              <Ionicons name="search-outline" size={18} color="#666" style={styles.searchIcon} />
              <TextInput
                style={styles.countrySearchInput}
                placeholder="Search country..."
                placeholderTextColor="#666"
                value={countrySearch}
                onChangeText={setCountrySearch}
                onFocus={() => setShowCountriesList(true)}
              />
              {countrySearch ? (
                <TouchableOpacity onPress={() => setCountrySearch('')}>
                  <Ionicons name="close-circle" size={18} color="#666" />
                </TouchableOpacity>
              ) : null}
            </View>
            
            {/* Selected Country Display */}
            {selectedCountry && (
              <TouchableOpacity
                style={styles.selectedCountryCard}
                onPress={() => setShowCountriesList(!showCountriesList)}
              >
                <View style={styles.selectedCountryInfo}>
                  <Text style={styles.countryFlag}>{getCountryFlag(selectedCountry)}</Text>
                  <View style={styles.countryDetails}>
                    <Text style={styles.countryName}>{getCountryName(selectedCountry)}</Text>
                    <Text style={styles.countryCode}>+{getCountryPrefix(selectedCountry)}</Text>
                  </View>
                </View>
                <Ionicons 
                  name={showCountriesList ? "chevron-up" : "chevron-down"} 
                  size={20} 
                  color="#FFD700" 
                />
              </TouchableOpacity>
            )}
            
            {/* Countries List */}
            {showCountriesList && (
              <View style={styles.countriesListContainer}>
                <ScrollView 
                  style={styles.countriesList}
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={false}
                >
                  {filteredCountries.length > 0 ? (
                    filteredCountries.map((country) => (
                      <TouchableOpacity
                        key={country.iso || country.iso_code}
                        style={[
                          styles.countryItem,
                          selectedCountry?.iso === country.iso && styles.countryItemSelected
                        ]}
                        onPress={() => handleCountrySelect(country)}
                      >
                        <Text style={styles.countryItemFlag}>{getCountryFlag(country)}</Text>
                        <View style={styles.countryItemInfo}>
                          <Text style={styles.countryItemName}>{getCountryName(country)}</Text>
                          <Text style={styles.countryItemCode}>+{getCountryPrefix(country)}</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={styles.noResultsContainer}>
                      <Ionicons name="search-outline" size={24} color="#666" />
                      <Text style={styles.noResultsText}>No countries found</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            )}
            
            {/* Provider Selection - Only Airtime Providers */}
            {selectedCountry && (
              <View style={styles.providersContainer}>
                <View style={styles.providersHeader}>
                  <Text style={styles.providersTitle}>Select Mobile Network</Text>
                  <View style={styles.providerTypeBadge}>
                    <Ionicons name="call-outline" size={12} color="#FFD700" />
                    <Text style={styles.providerTypeText}>AIRTIME</Text>
                  </View>
                </View>
                
                {loadingProviders ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#FFD700" />
                    <Text style={styles.loadingText}>Loading mobile networks...</Text>
                  </View>
                ) : (
                  <View>
                    <ScrollView 
                      horizontal 
                      showsHorizontalScrollIndicator={false}
                      style={styles.providersScroll}
                      contentContainerStyle={styles.providersContent}
                    >
                      {/* Get ONLY airtime providers for this country */}
                      {internationalStore.getProvidersForCountry(selectedCountry.iso, 'airtime').length > 0 ? (
                        internationalStore.getProvidersForCountry(selectedCountry.iso, 'airtime').map((provider) => (
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
                                name="call" 
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
                        ))
                      ) : (
                        <View style={styles.noProvidersContainer}>
                          <Ionicons name="call-outline" size={32} color="#666" />
                          <Text style={styles.noProvidersTitle}>No Mobile Networks</Text>
                          <Text style={styles.noProvidersText}>
                            No airtime providers available for {getCountryName(selectedCountry)}.
                          </Text>
                          
                          <TouchableOpacity
                            style={styles.checkDataButton}
                            onPress={() => router.push('/(app)/bundles/tabs/international')}
                          >
                            <Ionicons name="cellular-outline" size={16} color="#60A5FA" />
                            <Text style={styles.checkDataButtonText}>
                              Check for data bundles
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </ScrollView>
                    
                    {/* Show provider count */}
                    {internationalStore.getProvidersForCountry(selectedCountry.iso, 'airtime').length > 0 && (
                      <Text style={styles.providerCountText}>
                        {internationalStore.getProvidersForCountry(selectedCountry.iso, 'airtime').length} 
                        mobile network{internationalStore.getProvidersForCountry(selectedCountry.iso, 'airtime').length !== 1 ? 's' : ''} available
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}
            
            {/* Airtime Limits Info */}
            {selectedProvider && airtimeLimits && airtimeLimits.current_rate > 0 && (
              <View style={styles.limitsInfoContainer}>
                <View style={styles.limitsHeader}>
                  <Ionicons name="information-circle-outline" size={14} color="#FFD700" />
                  <Text style={styles.limitsTitle}>Airtime Limits</Text>
                </View>
                <View style={styles.limitsGrid}>
                  <View style={styles.limitItem}>
                    <Text style={styles.limitLabel}>Min</Text>
                    <Text style={styles.limitValue}>
                      {airtimeLimits.send_currency} {airtimeLimits.min_send}
                    </Text>
                  </View>
                  <View style={styles.limitItem}>
                    <Text style={styles.limitLabel}>Max</Text>
                    <Text style={styles.limitValue}>
                      {airtimeLimits.send_currency} {airtimeLimits.max_send}
                    </Text>
                  </View>
                  {airtimeLimits.current_rate && airtimeLimits.current_rate > 0 && (
                    <View style={styles.limitItem}>
                      <Text style={styles.limitLabel}>Rate</Text>
                      <Text style={styles.limitValue}>
                        1 USD = {airtimeLimits.current_rate} NGN
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* Phone Input */}
          {selectedCountry && selectedProvider && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="call-outline" size={18} color="#FFD700" />
                <Text style={styles.sectionTitle}>
                  {getCountryName(selectedCountry)} Phone Number
                </Text>
              </View>
              
              <View style={styles.phoneInputContainer}>
                <View style={styles.countryCodeBadge}>
                  <Text style={styles.countryCodeText}>+{getCountryPrefix(selectedCountry)}</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder={`Enter ${getCountryName(selectedCountry)} number`}
                  placeholderTextColor="#666"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </View>
              
              {phone && !validatePhoneNumber(phone, selectedCountry) && (
                <Text style={styles.validationError}>
                  Please enter a valid {getCountryName(selectedCountry)} phone number
                </Text>
              )}
            </View>
          )}

          {/* Amount Input */}
          {selectedCountry && selectedProvider && (
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
                  placeholder={debitCurrency === 'usd' ? "10.00" : "15000.00"}
                  placeholderTextColor="#666"
                  value={customAmount}
                  onChangeText={handleAmountChange}
                  keyboardType="decimal-pad"
                />
              </View>
              
              {/* Conversion Display */}
              {customAmount && !loadingEstimate && convertedAmount && airtimeLimits?.current_rate && airtimeLimits.current_rate > 0 && (
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
                  {airtimeLimits.current_rate > 0 && (
                    <Text style={styles.conversionRate}>
                      Rate: 1 USD = {airtimeLimits.current_rate} NGN
                    </Text>
                  )}
                </View>
              )}
              
              {loadingEstimate && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#FFD700" />
                  <Text style={styles.loadingText}>Calculating conversion...</Text>
                </View>
              )}
              
              {/* Airtime Limits Info */}
              {airtimeLimits && (
                <View style={styles.productInfo}>
                  <Text style={styles.productInfoText}>
                    Amount range: {airtimeLimits.send_currency} {airtimeLimits.min_send} - {airtimeLimits.max_send}
                  </Text>
                  <Text style={styles.productInfoText}>
                    Recipient receives: {airtimeLimits.receive_currency}
                  </Text>
                </View>
              )}
              
              {/* Quick Amount Buttons */}
              <View style={styles.quickAmounts}>
                {QUICK_AMOUNTS.map((amount, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.quickAmountButton,
                      quickAmountClicks[amount.value] && styles.quickAmountButtonActive
                    ]}
                    onPress={() => handleQuickAmountClick(amount.value)}
                  >
                    <Text style={styles.quickAmountText}>{amount.label}</Text>
                    {quickAmountClicks[amount.value] > 1 && (
                      <Text style={styles.quickAmountCount}>×{quickAmountClicks[amount.value]}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Security Notice */}
          <View style={styles.securityNotice}>
            <Ionicons name="warning" size={14} color="#FFD700" />
            <Text style={styles.securityText}>
              International transactions are secured and processed in USD.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={[
                styles.payButton,
                (!phone || !customAmount || !selectedCountry || !selectedProvider) && styles.payButtonDisabled
              ]}
              onPress={handlePayButtonClick}
              disabled={!phone || !customAmount || !selectedCountry || !selectedProvider || isProcessing}
            >
              <Text style={styles.payButtonText}>
                {isProcessing ? 'Processing...' : `Pay ${debitCurrency === 'usd' ? '$' : '₦'}${formatCurrency(customAmount)}`}
              </Text>
            </TouchableOpacity>
            
            {biometricAvailable && (
              <TouchableOpacity
                style={[
                  styles.biometricButton,
                  (!phone || !customAmount || !selectedCountry || !selectedProvider) && styles.biometricButtonDisabled
                ]}
                onPress={handleFingerprintClick}
                disabled={!phone || !customAmount || !selectedCountry || !selectedProvider || isProcessing}
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

      {/* PIN Modal */}
      <PinModal
        visible={showPinModal}
        onClose={() => setShowPinModal(false)}
        onVerify={handlePinVerified}
        title="Enter Transaction PIN"
        description="Enter your 4-digit PIN to confirm this international purchase"
      />
    </KeyboardAvoidingView>
  );
};

// Styles with reduced provider card size
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
  skeletonButton: {
    height: 34,
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
  countrySearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  countrySearchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 10,
  },
  selectedCountryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  selectedCountryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  countryFlag: {
    fontSize: 24,
  },
  countryDetails: {
    gap: 2,
  },
  countryName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  countryCode: {
    color: '#FFD700',
    fontSize: 12,
  },
  countriesListContainer: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    marginBottom: 12,
  },
  countriesList: {
    padding: 8,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  countryItemSelected: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  countryItemFlag: {
    fontSize: 20,
    marginRight: 12,
  },
  countryItemInfo: {
    flex: 1,
    gap: 2,
  },
  countryItemName: {
    color: '#fff',
    fontSize: 14,
  },
  countryItemCode: {
    color: '#999',
    fontSize: 12,
  },
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  noResultsText: {
    color: '#666',
    fontSize: 12,
    marginTop: 8,
  },
  providersContainer: {
    marginTop: 12,
  },
  providersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  providersTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.8,
  },
  providerTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  providerTypeText: {
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '600',
  },
  providersScroll: {
    flexDirection: 'row',
  },
  providersContent: {
    paddingRight: 16,
  },
  // Reduced provider card size
  providerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    marginRight: 8,
    minWidth: 90,
    height: 40, // Reduced height
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
    width: width - 64,
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
    marginBottom: 16,
    lineHeight: 16,
  },
  checkDataButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  checkDataButtonText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '600',
  },
  providerCountText: {
    color: '#666',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  limitsInfoContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  limitsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  limitsTitle: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '600',
  },
  limitsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  limitItem: {
    alignItems: 'center',
  },
  limitLabel: {
    color: '#999',
    fontSize: 10,
    marginBottom: 2,
  },
  limitValue: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '600',
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  countryCodeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRightWidth: 1,
    borderRightColor: '#333',
  },
  countryCodeText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
  },
  phoneInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  validationError: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 6,
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
  conversionRate: {
    color: '#999',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  productInfo: {
    marginTop: 12,
    padding: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  productInfoText: {
    color: '#60A5FA',
    fontSize: 11,
    marginBottom: 2,
  },
  quickAmounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  quickAmountButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    alignItems: 'center',
    minWidth: 80,
  },
  quickAmountButtonActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderColor: '#FFD700',
  },
  quickAmountText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '600',
  },
  quickAmountCount: {
    color: '#FFD700',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 2,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 8,
  },
  loadingText: {
    color: '#FFD700',
    fontSize: 12,
    opacity: 0.8,
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

export default InternationalAirtimeScreen;