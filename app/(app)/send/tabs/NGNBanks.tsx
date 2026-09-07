import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/config/supabase';
import { useAuth } from '@/stores/auth-store';
import FreeTransfersIndicator from '@/components/send/FreeTransfersIndicator';
import SuccessRateMonitor from '@/components/send/SuccessRateMonitor';

const { width, height } = Dimensions.get('window');

// Bank-specific color mapping using ACTUAL bank_code from your schema
const BANK_COLORS = {
  '100004': '#FFFFFF', // OPay
  '100033': '#FFFFFF', // PalmPay
  '090110': '#FFFFFF', // VFD MFB (Moniepoint equivalent in your schema)
  '000013': '#FFFFFF', // GTBANK PLC
  '000015': '#FFFFFF', // ZENITH BANK
  '000014': '#FFFFFF', // ACCESS BANK
  '000016': '#FFFFFF', // FIRST BANK OF NIGERIA
  '000004': '#FFFFFF', // UNITED BANK FOR AFRICA
  '000033': '#FFFFFF', // ENAIRA
  '000029': '#FFFFFF', // LOTUS BANK
  '000037': '#FFFFFF', // ALTERNATIVE BANK LIMITED
  'default': '#666666'
};

// BankLogo component for reuse
const BankLogo = ({ bankCode, bankName, size = 32, style = {}, logoUrl, isSelected = false }) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  // Get bank-specific color using actual bank_code from schema
  const getBankColor = (code) => {
    return BANK_COLORS[code] || BANK_COLORS.default;
  };
  
  const bankColor = getBankColor(bankCode);
  const isWhiteBackground = bankColor === '#FFFFFF';
  
  if (logoUrl && !imageError) {
    return (
      <View style={[styles.bankLogoContainer, { width: size, height: size }]}>
        {isSelected && (
          <View style={[
            styles.selectedIndicator,
            { 
              width: size + 6,
              height: size + 6,
              borderRadius: (size + 6) / 2,
            }
          ]} />
        )}
        <View style={[
          styles.bankLogoBackground, 
          { 
            backgroundColor: bankColor,
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: isWhiteBackground ? 1 : 0,
            borderColor: isWhiteBackground ? '#333' : 'transparent',
          }
        ]}>
          <Image
            source={{ uri: logoUrl }}
            style={[
              styles.bankLogoImage, 
              { 
                width: size * 0.7, 
                height: size * 0.7,
                opacity: imageLoaded ? 1 : 0,
              }
            ]}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
          {!imageLoaded && (
            <View style={styles.loadingPlaceholder}>
              <Text style={[
                styles.bankLogoInitial, 
                { 
                  fontSize: size * 0.3,
                  color: isWhiteBackground ? '#000' : '#fff'
                }
              ]}>
                {bankName ? bankName[0].toUpperCase() : 'B'}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }
  
  // Fallback to initial with colored background
  const initial = bankName ? bankName[0].toUpperCase() : 'B';
  
  return (
    <View style={[styles.bankLogoContainer, { width: size, height: size }]}>
      {isSelected && (
        <View style={[
          styles.selectedIndicator,
          { 
            width: size + 6,
            height: size + 6,
            borderRadius: (size + 6) / 2,
          }
        ]} />
      )}
      <View 
        style={[
          styles.bankLogoFallback, 
          { 
            width: size, 
            height: size, 
            backgroundColor: bankColor,
            borderRadius: size / 2,
            borderWidth: isWhiteBackground ? 1 : 0,
            borderColor: isWhiteBackground ? '#333' : 'transparent',
          },
          style
        ]}
      >
        <Text style={[
          styles.bankLogoInitial, 
          { 
            fontSize: size * 0.35,
            color: isWhiteBackground ? '#000' : '#fff'
          }
        ]}>
          {initial}
        </Text>
      </View>
    </View>
  );
};

// Updated Recent Beneficiaries Component with 3 small cards
const RecentBeneficiariesSection = ({ beneficiaries, bankLogoMap, onNavigateToSettings }) => {
  // Always show only 3 beneficiaries
  const displayBeneficiaries = beneficiaries.slice(0, 3);
  
  // State for showing unlock tooltip
  const [showUnlockTooltip, setShowUnlockTooltip] = useState(false);
  
  // Handle tooltip timeout
  useEffect(() => {
    let timeoutId;
    if (showUnlockTooltip) {
      timeoutId = setTimeout(() => {
        setShowUnlockTooltip(false);
      }, 5000); // Hide after 5 seconds
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [showUnlockTooltip]);
  
  // If no beneficiaries, show placeholder
  if (displayBeneficiaries.length === 0) {
    return (
      <View style={styles.recentBeneficiariesSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Beneficiaries</Text>
          <TouchableOpacity
            style={styles.lockedArrowContainer}
            onPress={() => setShowUnlockTooltip(!showUnlockTooltip)}
            onLongPress={onNavigateToSettings}
          >
            <Ionicons name="lock-closed" size={14} color="#666" />
            <Ionicons name="chevron-forward" size={14} color="#666" />
          </TouchableOpacity>
        </View>
        {showUnlockTooltip && (
          <TouchableOpacity 
            style={styles.unlockTooltip}
            onPress={onNavigateToSettings}
            activeOpacity={0.7}
          >
            <Text style={styles.unlockTooltipText}>🔒 Unlock in Settings</Text>
          </TouchableOpacity>
        )}
        <View style={styles.noBeneficiariesContainer}>
          <Ionicons name="people-outline" size={24} color="#666" />
          <Text style={styles.noBeneficiariesText}>No recent beneficiaries</Text>
        </View>
      </View>
    );
  }
  
  return (
    <View style={styles.recentBeneficiariesSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Beneficiaries</Text>
        <TouchableOpacity
          style={styles.lockedArrowContainer}
          onPress={() => setShowUnlockTooltip(!showUnlockTooltip)}
          onLongPress={onNavigateToSettings}
        >
          <Ionicons name="lock-closed" size={14} color="#666" />
          <Ionicons name="chevron-forward" size={14} color="#666" />
        </TouchableOpacity>
      </View>
      
      {showUnlockTooltip && (
        <TouchableOpacity 
          style={styles.unlockTooltip}
          onPress={onNavigateToSettings}
          activeOpacity={0.7}
        >
          <Text style={styles.unlockTooltipText}>🔒 Unlock in Settings</Text>
        </TouchableOpacity>
      )}
      
      <View style={styles.beneficiariesGrid}>
        {displayBeneficiaries.map((beneficiary) => (
          <TouchableOpacity
            key={beneficiary.id}
            style={styles.beneficiaryCard}
            onPress={() => {
              // Get bank initial for fallback
              const bankInitial = beneficiary.bank_name ? beneficiary.bank_name[0].toUpperCase() : 'B';
              
              // Directly navigate to next page since beneficiary is already verified
              router.push({
                pathname: '/(app)/send/amount',
                params: {
                  accountNumber: beneficiary.account_number,
                  accountName: beneficiary.account_name,
                  bankCode: beneficiary.bank_code,
                  bankName: beneficiary.bank_name,
                  bankLogoUrl: bankLogoMap[beneficiary.bank_code],
                  bankInitial: bankInitial,
                },
              });
            }}
          >
            <BankLogo 
              bankCode={beneficiary.bank_code}
              bankName={beneficiary.bank_name}
              size={36}
              logoUrl={bankLogoMap[beneficiary.bank_code]}
            />
            <Text style={styles.beneficiaryName} numberOfLines={1}>
              {beneficiary.account_name}
            </Text>
            <Text style={styles.beneficiaryAccount} numberOfLines={1}>
              {beneficiary.account_number.slice(-4)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

// Verification Success Banner Component
const VerificationSuccessBanner = ({ accountName, bankName, accountNumber, pulseAnimation }) => {
  return (
    <Animated.View 
      style={[
        styles.successBanner,
        { transform: [{ scale: pulseAnimation }] }
      ]}
    >
      <View style={styles.successBannerContent}>
        <View style={styles.successBannerHeader}>
          <Ionicons name="trending-up" size={18} color="#22C55E" />
          <Text style={styles.successBannerTitle}>Verified</Text>
        </View>
        
        <View style={styles.successBannerDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Bank:</Text>
            <Text style={styles.detailValue}>{bankName}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Account Name:</Text>
            <Text style={styles.detailValue}>{accountName}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Account Number:</Text>
            <Text style={styles.detailValue}>{accountNumber}</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

// Verification Failed Banner Component
const VerificationFailedBanner = ({ bankName, pulseAnimation, onSelectDifferentBank }) => {
  return (
    <Animated.View 
      style={[
        styles.failedBanner,
        { transform: [{ scale: pulseAnimation }] }
      ]}
    >
      <View style={styles.failedBannerContent}>
        <View style={styles.failedBannerHeader}>
          <Ionicons name="alert-circle" size={18} color="#EF4444" />
          <Text style={styles.failedBannerTitle}>Verification Failed</Text>
        </View>
        
        <View style={styles.failedBannerDetails}>
          <View style={styles.failedMessageContainer}>
            <Text style={styles.failedBannerMessage}>
              Account doesn't exist for {bankName}
            </Text>
            <Text style={styles.warningSymbol}>⚠</Text>
          </View>
          
          <TouchableOpacity
            style={styles.selectDifferentBankButton}
            onPress={onSelectDifferentBank}
          >
            <Ionicons name="card" size={16} color="#22C55E" />
            <Text style={styles.selectDifferentBankText}>Select a different bank</Text>
            <Ionicons name="chevron-forward" size={16} color="#22C55E" />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
};

// Green Circular Spinner Component
const GreenSpinner = ({ size = 20 }) => {
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <Ionicons name="refresh" size={size} color="#22C55E" />
    </Animated.View>
  );
};

// QuickSendGrid component with DYNAMIC popular banks based on user preferences
const QuickSendGrid = ({ onBankSelect, bankPrefixes, selectedBank, userRecentBanks }) => {
  // Default popular banks using ACTUAL bank_code from your schema
  const defaultQuickBanks = [
    { bank_code: '100004', bank_name: 'OPay' },
    { bank_code: '100033', bank_name: 'PalmPay' },
    { bank_code: '090110', bank_name: 'VFD MFB' }, // Moniepoint equivalent
    { bank_code: '000013', bank_name: 'GTBank' },
    { bank_code: '000015', bank_name: 'Zenith' },
    { bank_code: '000014', bank_name: 'Access' },
    { bank_code: '000016', bank_name: 'FirstBank' },
    { bank_code: '000004', bank_name: 'UBA' },
  ];

  // Use user's recent banks if available, otherwise use default
  const quickBanks = useMemo(() => {
    if (userRecentBanks && userRecentBanks.length > 0) {
      // Take the most recent 8 banks
      const recentBanks = userRecentBanks.slice(0, 8);
      
      // If we have less than 8 recent banks, fill with default popular banks
      if (recentBanks.length < 8) {
        const remainingSlots = 8 - recentBanks.length;
        const recentBankCodes = new Set(recentBanks.map(b => b.bank_code));
        
        // Filter default banks that aren't already in recent banks
        const additionalBanks = defaultQuickBanks
          .filter(bank => !recentBankCodes.has(bank.bank_code))
          .slice(0, remainingSlots);
        
        return [...recentBanks, ...additionalBanks];
      }
      
      return recentBanks;
    }
    
    return defaultQuickBanks;
  }, [userRecentBanks]);

  // Get logo URL from bank prefixes
  const getLogoUrl = (bankCode) => {
    if (!bankPrefixes) return null;
    const bank = bankPrefixes.find(b => b.bank_code === bankCode);
    return bank?.logo_url || null;
  };

  return (
    <View style={styles.quickSendContainer}>
      <Text style={styles.quickSendTitle}>Quick Send</Text>
      <View style={styles.quickSendGrid}>
        {/* First Row */}
        <View style={styles.quickSendRow}>
          {quickBanks.slice(0, 4).map((bank) => (
            <TouchableOpacity
              key={bank.bank_code}
              style={styles.quickSendItem}
              onPress={() => onBankSelect({
                code: bank.bank_code,
                name: bank.bank_name,
              })}
            >
              <BankLogo 
                bankCode={bank.bank_code}
                bankName={bank.bank_name}
                size={36}
                logoUrl={getLogoUrl(bank.bank_code)}
                isSelected={selectedBank?.code === bank.bank_code}
              />
              <Text style={styles.quickSendBankName} numberOfLines={1}>
                {bank.bank_name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        {/* Second Row */}
        <View style={styles.quickSendRow}>
          {quickBanks.slice(4, 8).map((bank) => (
            <TouchableOpacity
              key={bank.bank_code}
              style={styles.quickSendItem}
              onPress={() => onBankSelect({
                code: bank.bank_code,
                name: bank.bank_name,
              })}
            >
              <BankLogo 
                bankCode={bank.bank_code}
                bankName={bank.bank_name}
                size={36}
                logoUrl={getLogoUrl(bank.bank_code)}
                isSelected={selectedBank?.code === bank.bank_code}
              />
              <Text style={styles.quickSendBankName} numberOfLines={1}>
                {bank.bank_name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
};

const RecipientSelectionScreen = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [accountNumber, setAccountNumber] = useState('');
  const [selectedBank, setSelectedBank] = useState(null);
  const [detectedBank, setDetectedBank] = useState(null); // For visibility only
  const [verificationStage, setVerificationStage] = useState('idle');
  const [verificationMessage, setVerificationMessage] = useState('Enter 10 digits Account Number');
  const [isValidating, setIsValidating] = useState(false);
  const [verifiedAccountDetails, setVerifiedAccountDetails] = useState(null);
  const [verificationFailed, setVerificationFailed] = useState(false);
  
  // Track if account number is being typed for the first time
  const [isFirstTimeTyping, setIsFirstTimeTyping] = useState(true);
  
  // Track if current account number has an existing beneficiary
  const [hasExistingBeneficiary, setHasExistingBeneficiary] = useState(false);
  const [existingBeneficiaryDetails, setExistingBeneficiaryDetails] = useState(null);
  
  // Watermark pulse animation
  const watermarkPulse = useRef(new Animated.Value(1)).current;
  // Success banner pulse animation
  const successPulse = useRef(new Animated.Value(1)).current;
  // Failed banner pulse animation
  const failedPulse = useRef(new Animated.Value(1)).current;

  // Start pulse animation for watermark icon - EXACTLY LIKE REFERENCE
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
      ])
    ).start();
  }, []);

  // Start pulse animation for success banner when verification is successful
  useEffect(() => {
    if (verificationStage === 'verified' && !hasExistingBeneficiary) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(successPulse, {
            toValue: 1.02,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(successPulse, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      successPulse.setValue(1);
    }
  }, [verificationStage, hasExistingBeneficiary]);

  // Start pulse animation for failed banner when verification fails
  useEffect(() => {
    if (verificationFailed && !hasExistingBeneficiary) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(failedPulse, {
            toValue: 1.02,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(failedPulse, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      failedPulse.setValue(1);
    }
  }, [verificationFailed, hasExistingBeneficiary]);

  // Fetch free transfers only
  const { data: balanceData } = useQuery({
    queryKey: ['userFreeTransfers', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('free_transfers_remaining')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch recent beneficiaries - UPDATED to include all beneficiaries for an account number
  const { data: recentBeneficiaries } = useQuery({
    queryKey: ['recentBeneficiaries', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_beneficiaries')
        .select('*')
        .eq('user_id', user.id)
        .order('last_transferred_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch user's recent banks based on transaction history
  const { data: userRecentBanks } = useQuery({
    queryKey: ['userRecentBanks', user.id],
    queryFn: async () => {
      // First, try to get from user_bank_preferences table
      const { data: preferencesData, error: prefError } = await supabase
        .from('user_bank_preferences')
        .select('bank_code, bank_name, last_used, usage_count')
        .eq('user_id', user.id)
        .order('last_used', { ascending: false })
        .limit(12);
      
      if (prefError) {
        console.error('Error fetching user bank preferences:', prefError);
        return [];
      }
      
      // If we have preferences data, use it
      if (preferencesData && preferencesData.length > 0) {
        return preferencesData.map(bank => ({
          bank_code: bank.bank_code,
          bank_name: bank.bank_name,
          last_used: bank.last_used,
          usage_count: bank.usage_count,
        }));
      }
      
      // Fallback to getting banks from recent beneficiaries
      const { data: beneficiariesData, error: benError } = await supabase
        .from('bank_beneficiaries')
        .select('bank_code, bank_name, last_transferred_at')
        .eq('user_id', user.id)
        .order('last_transferred_at', { ascending: false })
        .limit(12);
      
      if (benError) {
        console.error('Error fetching beneficiaries for recent banks:', benError);
        return [];
      }
      
      if (beneficiariesData && beneficiariesData.length > 0) {
        // Group by bank and get the most recent transaction for each bank
        const bankMap = new Map();
        beneficiariesData.forEach(beneficiary => {
          if (!bankMap.has(beneficiary.bank_code) || 
              new Date(beneficiary.last_transferred_at) > new Date(bankMap.get(beneficiary.bank_code).last_used)) {
            bankMap.set(beneficiary.bank_code, {
              bank_code: beneficiary.bank_code,
              bank_name: beneficiary.bank_name,
              last_used: beneficiary.last_transferred_at,
              usage_count: 1,
            });
          }
        });
        
        return Array.from(bankMap.values())
          .sort((a, b) => new Date(b.last_used) - new Date(a.last_used));
      }
      
      return [];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Fetch bank prefixes with logos - CORRECTED TO USE YOUR SCHEMA
  const { data: bankPrefixes } = useQuery({
    queryKey: ['bankPrefixesWithLogos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_account_prefixes')
        .select('bank_code, bank_name, prefixes, logo_url, is_fintech, popularity_score')
        .eq('is_active', true)
        .order('popularity_score', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Create a map of bank logos for quick access
  const bankLogoMap = useMemo(() => {
    if (!bankPrefixes) return {};
    const map = {};
    bankPrefixes.forEach(bank => {
      map[bank.bank_code] = bank.logo_url;
    });
    return map;
  }, [bankPrefixes]);

  // Function to detect bank from account number prefixes (FOR VISIBILITY ONLY)
  const detectBankFromPrefix = (accountNumber, prefixesData) => {
    if (!prefixesData || accountNumber.length < 2) return null;
    
    // Check prefixes in order of length (longest first for specificity)
    const sortedPrefixes = [...prefixesData]
      .filter(bank => bank.prefixes && bank.prefixes.length > 0)
      .flatMap(bank => 
        bank.prefixes.map(prefix => ({ 
          bank_code: bank.bank_code, 
          bank_name: bank.bank_name, 
          prefix,
          length: prefix.length 
        }))
      )
      .sort((a, b) => b.length - a.length); // Longest prefixes first

    for (const { bank_code, bank_name, prefix } of sortedPrefixes) {
      if (accountNumber.startsWith(prefix)) {
        return { code: bank_code, name: bank_name };
      }
    }
    
    return null;
  };

  // Get most recent beneficiary for an account number
  const getMostRecentBeneficiary = useCallback((accNumber) => {
    if (!recentBeneficiaries) return null;
    
    // Filter beneficiaries for this account number and sort by last_transferred_at (most recent first)
    const beneficiariesForAccount = recentBeneficiaries
      .filter(b => b.account_number === accNumber)
      .sort((a, b) => new Date(b.last_transferred_at) - new Date(a.last_transferred_at));
    
    return beneficiariesForAccount[0] || null;
  }, [recentBeneficiaries]);

  // Get all beneficiaries for an account number (for suggestions)
  const getAllBeneficiariesForAccount = useCallback((accNumber) => {
    if (!recentBeneficiaries) return [];
    
    // Filter beneficiaries for this account number and sort by last_transferred_at (most recent first)
    return recentBeneficiaries
      .filter(b => b.account_number === accNumber)
      .sort((a, b) => new Date(b.last_transferred_at) - new Date(a.last_transferred_at));
  }, [recentBeneficiaries]);

  // Handle account number input - UPDATED to handle existing beneficiaries
  useEffect(() => {
    if (!accountNumber) {
      setVerificationStage('idle');
      setVerificationMessage('Enter 10 digits Account Number');
      setSelectedBank(null);
      setDetectedBank(null); // Clear detection too
      setVerifiedAccountDetails(null);
      setVerificationFailed(false);
      setHasExistingBeneficiary(false);
      setExistingBeneficiaryDetails(null);
      setIsFirstTimeTyping(true);
      return;
    }

    // Reset first time typing when account is cleared
    if (accountNumber.length === 0) {
      setIsFirstTimeTyping(true);
      setDetectedBank(null);
      setHasExistingBeneficiary(false);
      setExistingBeneficiaryDetails(null);
    }

    // Check if account number exists in beneficiaries first
    const mostRecentBeneficiary = getMostRecentBeneficiary(accountNumber);

    // If account number exists in beneficiaries, set as verified
    if (mostRecentBeneficiary && accountNumber.length === 10) {
      const beneficiaryBank = {
        code: mostRecentBeneficiary.bank_code,
        name: mostRecentBeneficiary.bank_name,
      };
      
      setHasExistingBeneficiary(true);
      setExistingBeneficiaryDetails(mostRecentBeneficiary);
      setSelectedBank(beneficiaryBank);
      setDetectedBank(beneficiaryBank);
      setVerificationStage('verified');
      setVerificationMessage(`${beneficiaryBank.name}: Verified Beneficiary`);
      
      setVerifiedAccountDetails({
        accountName: mostRecentBeneficiary.account_name,
        bankName: beneficiaryBank.name,
        accountNumber: accountNumber,
      });
      
      setIsFirstTimeTyping(false);
      return; // Skip prefix detection for known beneficiaries
    } else if (mostRecentBeneficiary) {
      // If account number exists but not yet 10 digits
      const beneficiaryBank = {
        code: mostRecentBeneficiary.bank_code,
        name: mostRecentBeneficiary.bank_name,
      };
      
      // Only update if different from current detected bank
      if (!detectedBank || detectedBank.code !== beneficiaryBank.code) {
        setDetectedBank(beneficiaryBank);
        
        // If user has previously selected this account with a different bank,
        // update the selected bank as well
        if (selectedBank && selectedBank.code !== beneficiaryBank.code) {
          setSelectedBank(beneficiaryBank);
        }
      }
      
      setVerificationMessage(`Detected: ${beneficiaryBank.name} (select to verify)`);
      setIsFirstTimeTyping(false);
      return; // Skip prefix detection for known beneficiaries
    }

    // Reset existing beneficiary status if we typed beyond the previous match
    setHasExistingBeneficiary(false);
    setExistingBeneficiaryDetails(null);

    // When 10 digits are entered
    if (accountNumber.length === 10) {
      // Reset existing beneficiary status if no beneficiary found
      if (!hasExistingBeneficiary) {
        setVerificationStage('awaiting_bank');
        
        // Update message based on detected bank
        if (detectedBank) {
          setVerificationMessage(`${detectedBank.name}: select bank to verify`);
        } else {
          setVerificationMessage('Complete: select bank to verify');
        }
        
        // Check for cached fingerprints but don't auto-select
        checkCachedFingerprints(accountNumber);
      }
      
      setIsFirstTimeTyping(false);
    } else if (accountNumber.length > 10) {
      setAccountNumber(accountNumber.substring(0, 10));
    }
    // Auto-detect bank as user types (2+ digits) - ONLY FOR NEW ACCOUNTS
    else if (accountNumber.length >= 2 && bankPrefixes) {
      // Only detect if not a known beneficiary
      const detected = detectBankFromPrefix(accountNumber, bankPrefixes);
      setDetectedBank(detected); // Store for display only
      
      if (detected) {
        setVerificationMessage(`Detected: ${detected.name} (select to verify)`);
      } else {
        setVerificationMessage('Enter 10 digits Account Number');
      }
    }
  }, [accountNumber, bankPrefixes, recentBeneficiaries, getMostRecentBeneficiary]);

  // Check for cached fingerprints
  const checkCachedFingerprints = async (accountNumber) => {
    // First check local beneficiaries
    const mostRecentBeneficiary = getMostRecentBeneficiary(accountNumber);
    
    if (mostRecentBeneficiary) {
      if (!detectedBank) {
        setVerificationMessage(`${mostRecentBeneficiary.bank_name}: select bank to verify`);
      }
      return;
    }
    
    // Only check database if not found locally
    const { data: cachedData } = await supabase
      .from('account_fingerprints')
      .select('*')
      .eq('user_id', user.id)
      .eq('account_number', accountNumber)
      .limit(1);

    if (cachedData && cachedData.length > 0) {
      const fingerprint = cachedData[0];
      if (!detectedBank) {
        setVerificationMessage(`${fingerprint.bank_name}: select bank to verify`);
      }
    }
  };

  // Handle bank selection - REMOVED BANK MISMATCH ALERT
  const handleBankSelect = async (bank) => {
    // Manual bank selection
    setSelectedBank(bank);
    setDetectedBank(null); // Clear detection once user manually selects
    setVerificationFailed(false);
    setHasExistingBeneficiary(false);
    setExistingBeneficiaryDetails(null);
    
    // If we already have an account number, verify immediately
    if (accountNumber.length === 10) {
      await verifyWithSelectedBank(accountNumber, bank);
    } else {
      // Wait for account number
      setVerificationStage('awaiting_account');
      setVerificationMessage(`Enter account number for ${bank.name}`);
    }
  };

  const verifyWithSelectedBank = async (accountNumber, bank) => {
    setVerificationStage('verifying');
    setVerificationMessage(`Verifying with ${bank.name}...`);
    setVerificationFailed(false);
    setHasExistingBeneficiary(false);
    setExistingBeneficiaryDetails(null);

    try {
      const result = await verifyAccount(accountNumber, bank.code);
      
      if (result.success) {
        setVerifiedAccountDetails({
          accountName: result.accountName,
          bankName: bank.name,
          accountNumber: accountNumber,
        });
        setVerificationStage('verified');
        setVerificationFailed(false);
        
        await saveBeneficiary({
          account_number: accountNumber,
          account_name: result.accountName,
          bank_code: bank.code,
          bank_name: bank.name,
        });

        await promoteBank(bank.code, bank.name);
        
        // Reset first time typing after successful verification
        setIsFirstTimeTyping(false);
      } else {
        // Show failed banner instead of alert
        setVerificationFailed(true);
        setVerificationStage('failed');
      }
    } catch (error) {
      // Show failed banner for network errors too
      setVerificationFailed(true);
      setVerificationStage('failed');
      console.error('Verification error:', error);
    }
  };

  const handleSelectDifferentBank = () => {
    // Navigate to bank list screen
    router.push({
      pathname: '/(app)/send/banklist',
      params: {
        accountNumber,
        returnScreen: 'recipient-selection',
      },
    });
  };

  const verifyAccount = async (accountNumber, bankCode) => {
    try {
      // Resolve the account name via BPay. No screen ever calls a
      // provider directly or holds a provider credential — see
      // services/edgeFunctions.ts.
      const result = await bpay.lookupBankAccount({
        account_number: accountNumber,
        bank_code: bankCode,
      });

      return {
        success: true,
        accountName: result.account_name || 'Verified Account',
      };
    } catch (error) {
      console.error('Verification error:', error);
      const message =
        error instanceof BPayError
          ? error.message
          : 'Network error. Please check your internet connection.';
      return {
        success: false,
        error: message,
      };
    }
  };

  const saveBeneficiary = async (beneficiary) => {
    try {
      const beneficiaryId = `${user.id}_${beneficiary.account_number}_${beneficiary.bank_code}`;
      
      const { data: existingBeneficiary, error: fetchError } = await supabase
        .from('bank_beneficiaries')
        .select('*')
        .eq('beneficiary_id', beneficiaryId)
        .maybeSingle();

      if (fetchError) {
        console.error('Error checking beneficiary:', fetchError);
        return;
      }

      const beneficiaryData = {
        user_id: user.id,
        beneficiary_id: beneficiaryId,
        account_number: beneficiary.account_number,
        account_name: beneficiary.account_name,
        bank_code: beneficiary.bank_code,
        bank_name: beneficiary.bank_name,
        last_transferred_at: new Date().toISOString(),
      };

      if (existingBeneficiary) {
        // Update
        await supabase
          .from('bank_beneficiaries')
          .update(beneficiaryData)
          .eq('id', existingBeneficiary.id);
      } else {
        // Insert
        await supabase
          .from('bank_beneficiaries')
          .insert(beneficiaryData);
      }
      
      console.log('Beneficiary saved successfully');
    } catch (error) {
      console.error('Error saving beneficiary:', error);
    }
  };

  const promoteBank = async (bankCode, bankName) => {
    try {
      const { error } = await supabase
        .from('user_bank_preferences')
        .upsert({
          user_id: user.id,
          bank_code: bankCode, // Use actual bank_code from schema
          bank_name: bankName,
          last_used: new Date().toISOString(),
          usage_count: 1,
        }, {
          onConflict: 'user_id,bank_code',
        });

      if (error) throw error;
      
      // Invalidate the userRecentBanks query to refresh the Quick Send grid
      queryClient.invalidateQueries(['userRecentBanks', user.id]);
    } catch (error) {
      console.error('Error promoting bank:', error);
    }
  };

  const handleNext = () => {
    // Check if we have an existing beneficiary or verified account
    if (hasExistingBeneficiary && existingBeneficiaryDetails) {
      // Get bank logo URL and initial
      const bankLogoUrl = bankLogoMap[existingBeneficiaryDetails.bank_code];
      const bankInitial = existingBeneficiaryDetails.bank_name ? existingBeneficiaryDetails.bank_name[0].toUpperCase() : 'B';
      
      // Navigate with existing beneficiary details
      router.push({
        pathname: '/(app)/send/amount',
        params: {
          accountNumber: existingBeneficiaryDetails.account_number,
          accountName: existingBeneficiaryDetails.account_name,
          bankCode: existingBeneficiaryDetails.bank_code,
          bankName: existingBeneficiaryDetails.bank_name,
          bankLogoUrl: bankLogoUrl,
          bankInitial: bankInitial,
        },
      });
    } else if (verificationStage === 'verified' && verifiedAccountDetails && selectedBank) {
      // Get bank logo URL and initial for newly verified account
      const bankLogoUrl = bankLogoMap[selectedBank.code];
      const bankInitial = selectedBank.name ? selectedBank.name[0].toUpperCase() : 'B';
      
      // Navigate with newly verified account details
      router.push({
        pathname: '/(app)/send/amount',
        params: {
          accountNumber: accountNumber,
          accountName: verifiedAccountDetails.accountName,
          bankCode: selectedBank.code,
          bankName: selectedBank.name,
          bankLogoUrl: bankLogoUrl,
          bankInitial: bankInitial,
        },
      });
    } else {
      Alert.alert('Complete Verification', 'Please verify the account before proceeding.');
      return;
    }
  };

  // Get filtered beneficiaries for suggestions (shows all beneficiaries for the account number)
  const filteredBeneficiaries = useMemo(() => {
    if (!accountNumber) return [];
    
    // Get all beneficiaries for this account number
    const allBeneficiariesForAccount = getAllBeneficiariesForAccount(accountNumber);
    
    // Also filter by name if account number is less than 10 digits
    if (accountNumber.length < 10) {
      return recentBeneficiaries?.filter(beneficiary =>
        beneficiary.account_name?.toLowerCase().includes(accountNumber.toLowerCase()) ||
        beneficiary.account_number?.includes(accountNumber)
      ) || [];
    }
    
    return allBeneficiariesForAccount;
  }, [recentBeneficiaries, accountNumber, getAllBeneficiariesForAccount]);

  const getVerificationColor = () => {
    switch (verificationStage) {
      case 'verified': return '#22C55E';
      case 'verifying': return '#22C55E';
      case 'awaiting_account': return '#8B5CF6';
      case 'awaiting_bank': return '#FFD700'; // Yellow for awaiting selection
      case 'searching': return '#22C55E';
      case 'failed': return '#EF4444';
      default: return '#9CA3AF';
    }
  };

  const getVerificationIcon = () => {
    switch (verificationStage) {
      case 'verified': return 'checkmark-circle';
      case 'verifying': return 'refresh';
      case 'awaiting_account': return 'card';
      case 'awaiting_bank': return 'trending-up';
      case 'searching': return 'search';
      case 'failed': return 'alert-circle';
      default: return 'ellipse';
    }
  };

  // Function to navigate to bank list
  const navigateToBankList = () => {
    router.push({
      pathname: '/(app)/send/banklist',
      params: {
        accountNumber,
        returnScreen: 'recipient-selection',
      },
    });
  };

  // Function to navigate to settings
  const navigateToSettings = () => {
    router.push('/(app)/settings');
  };

  // Check if proceed button should be active
  const isProceedButtonActive = () => {
    return verificationStage === 'verified' || hasExistingBeneficiary;
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* NON-BLOCKING PULSING WATERMARK - EXACTLY LIKE REFERENCE */}
      <Animated.View pointerEvents="none" style={styles.watermarkWrapper}>
        <Animated.Image
          source={require('@/assets/icons/home.png')}
          style={[styles.watermark, { transform: [{ scale: watermarkPulse }] }]}
          resizeMode="contain"
        />
      </Animated.View>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {/* Simplified Header - Only History */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft} />
            <TouchableOpacity 
              style={styles.historyButton}
              onPress={() => router.push('/(app)/send/history')}
            >
              <Ionicons name="trending-up" size={20} color="#3B82F6" />
              <Text style={styles.historyText}>History</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Free Transfers Indicator - Moved up with proper spacing */}
        <View style={styles.freeTransfersContainer}>
          <FreeTransfersIndicator count={balanceData?.free_transfers_remaining || 3} />
        </View>

        {/* Quick Send Grid with DYNAMIC banks based on user transaction history */}
        <QuickSendGrid 
          onBankSelect={handleBankSelect}
          bankPrefixes={bankPrefixes}
          selectedBank={selectedBank}
          userRecentBanks={userRecentBanks}
        />

        {/* Recipient Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recipient Account</Text>
          
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.accountInput}
              placeholder="Enter 10 digits Account Number"
              placeholderTextColor="#666"
              value={accountNumber}
              onChangeText={setAccountNumber}
              keyboardType="number-pad"
              maxLength={10}
              autoFocus
            />
            
            {accountNumber.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setAccountNumber('');
                  setVerificationFailed(false);
                  setVerificationStage('idle');
                  setSelectedBank(null);
                  setDetectedBank(null);
                  setHasExistingBeneficiary(false);
                  setExistingBeneficiaryDetails(null);
                }}
                style={styles.clearButton}
              >
                <Ionicons name="close-circle" size={20} color="#666" />
              </TouchableOpacity>
            )}
          </View>

          {/* Real-time Suggestions - Shows all beneficiaries for the account number */}
          {accountNumber.length > 0 && filteredBeneficiaries.length > 0 && !hasExistingBeneficiary && (
            <View style={styles.suggestionsContainer}>
              {filteredBeneficiaries.slice(0, 3).map((beneficiary, index) => (
                <TouchableOpacity
                  key={`${beneficiary.id}_${index}`}
                  style={styles.suggestionItem}
                  onPress={() => {
                    // Get bank initial for fallback
                    const bankInitial = beneficiary.bank_name ? beneficiary.bank_name[0].toUpperCase() : 'B';
                    
                    // Directly navigate to next page since beneficiary is already verified
                    router.push({
                      pathname: '/(app)/send/amount',
                      params: {
                        accountNumber: beneficiary.account_number,
                        accountName: beneficiary.account_name,
                        bankCode: beneficiary.bank_code,
                        bankName: beneficiary.bank_name,
                        bankLogoUrl: bankLogoMap[beneficiary.bank_code],
                        bankInitial: bankInitial,
                      },
                    });
                  }}
                >
                  <BankLogo 
                    bankCode={beneficiary.bank_code}
                    bankName={beneficiary.bank_name}
                    size={32}
                    logoUrl={bankLogoMap[beneficiary.bank_code]}
                  />
                  <View style={styles.suggestionInfo}>
                    <Text style={styles.suggestionName}>{beneficiary.account_name}</Text>
                    <Text style={styles.suggestionDetail}>
                      {beneficiary.account_number} • {beneficiary.bank_name}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Verification Status - Show only for NEW accounts, not for existing beneficiaries */}
          {!hasExistingBeneficiary && verificationStage !== 'verified' && verificationStage !== 'failed' && (
            <View style={styles.verificationContainer}>
              <View style={[styles.verificationIcon, { backgroundColor: getVerificationColor() + '20' }]}>
                {(verificationStage === 'verifying' || verificationStage === 'searching') ? (
                  <GreenSpinner size={16} />
                ) : (
                  <Ionicons
                    name={getVerificationIcon()}
                    size={16}
                    color={getVerificationColor()}
                  />
                )}
              </View>
              <Text style={[styles.verificationText, { color: getVerificationColor() }]}>
                {verificationMessage}
              </Text>
            </View>
          )}

          {/* Verification Success Banner - Show ONLY for newly verified accounts, NOT for existing beneficiaries */}
          {verificationStage === 'verified' && !hasExistingBeneficiary && (
            <VerificationSuccessBanner
              accountName={verifiedAccountDetails.accountName}
              bankName={verifiedAccountDetails.bankName}
              accountNumber={accountNumber}
              pulseAnimation={successPulse}
            />
          )}

          {/* Verification Failed Banner */}
          {verificationFailed && selectedBank && !hasExistingBeneficiary && (
            <VerificationFailedBanner
              bankName={selectedBank.name}
              pulseAnimation={failedPulse}
              onSelectDifferentBank={handleSelectDifferentBank}
            />
          )}

          {/* Existing Beneficiary Suggestions - Show when account is already in beneficiaries */}
          {hasExistingBeneficiary && filteredBeneficiaries.length > 0 && (
            <View style={styles.existingBeneficiaryContainer}>
              <View style={styles.existingBeneficiaryHeader}>
                <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                <Text style={styles.existingBeneficiaryTitle}>Verified Beneficiary</Text>
              </View>
              
              {filteredBeneficiaries.map((beneficiary, index) => {
                const bankInitial = beneficiary.bank_name ? beneficiary.bank_name[0].toUpperCase() : 'B';
                
                return (
                  <TouchableOpacity
                    key={`${beneficiary.id}_${index}`}
                    style={[
                      styles.existingBeneficiaryItem,
                      index === 0 && styles.existingBeneficiaryFirstItem
                    ]}
                    onPress={() => {
                      // Directly navigate to next page since beneficiary is already verified
                      router.push({
                        pathname: '/(app)/send/amount',
                        params: {
                          accountNumber: beneficiary.account_number,
                          accountName: beneficiary.account_name,
                          bankCode: beneficiary.bank_code,
                          bankName: beneficiary.bank_name,
                          bankLogoUrl: bankLogoMap[beneficiary.bank_code],
                          bankInitial: bankInitial,
                        },
                      });
                    }}
                  >
                    <BankLogo 
                      bankCode={beneficiary.bank_code}
                      bankName={beneficiary.bank_name}
                      size={32}
                      logoUrl={bankLogoMap[beneficiary.bank_code]}
                    />
                    <View style={styles.existingBeneficiaryInfo}>
                      <Text style={styles.existingBeneficiaryName}>{beneficiary.account_name}</Text>
                      <Text style={styles.existingBeneficiaryDetail}>
                        {beneficiary.account_number} • {beneficiary.bank_name}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#666" />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Single Select Bank Button - Only shown when 10 digits complete and no bank selected */}
          {accountNumber.length === 10 && !selectedBank && verificationStage !== 'verified' && !verificationFailed && !hasExistingBeneficiary && (
            <TouchableOpacity
              style={styles.bankSelectorButton}
              onPress={navigateToBankList}
            >
              <View style={styles.bankSelectorButtonContent}>
                <Ionicons name="card" size={18} color="green" />
                <Text style={styles.bankSelectorText}>
                  {detectedBank ? `Select Bank ` : 'Select Bank'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="green" />
            </TouchableOpacity>
          )}
          
          {/* Success Rate Monitor */}
          <SuccessRateMonitor />
        </View>

        {/* Recent Beneficiaries - Updated component with 3 small cards */}
        <RecentBeneficiariesSection
          beneficiaries={recentBeneficiaries || []}
          bankLogoMap={bankLogoMap}
          onNavigateToSettings={navigateToSettings}
        />

        {/* Proceed Button */}
        <TouchableOpacity
          style={[
            styles.proceedButton,
            isProceedButtonActive() ? styles.proceedButtonActive : styles.proceedButtonDisabled
          ]}
          onPress={handleNext}
          disabled={!isProceedButtonActive()}
        >
          <Text style={styles.proceedButtonText}>Proceed</Text>
          <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120,
    zIndex: 10,
  },
  // WATERMARK — EXACTLY LIKE REFERENCE
  watermarkWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  watermark: {
    width: 300,
    height: 300,
    opacity: 0.10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    zIndex: 2,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  headerLeft: {
    width: 40,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  freeTransfersContainer: {
    marginBottom: 4,
  },
  section: {
    marginBottom: 20,
    zIndex: 2,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  accountInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    padding: 0,
  },
  clearButton: {
    padding: 4,
  },
  suggestionsContainer: {
    marginTop: 8,
    backgroundColor: '#111',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#222',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  suggestionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  suggestionName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  suggestionDetail: {
    color: '#FFD700',
    fontSize: 12,
  },
  // Existing Beneficiary Styles
  existingBeneficiaryContainer: {
    marginTop: 12,
    backgroundColor: '#111',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#222',
  },
  existingBeneficiaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  existingBeneficiaryTitle: {
    color: '#22C55E',
    fontSize: 13,
    fontWeight: '600',
  },
  existingBeneficiaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  existingBeneficiaryFirstItem: {
    borderTopWidth: 0,
  },
  existingBeneficiaryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  existingBeneficiaryName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  existingBeneficiaryDetail: {
    color: '#FFD700',
    fontSize: 12,
  },
  // Bank Logo Styles
  bankLogoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  selectedIndicator: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankLogoBackground: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bankLogoImage: {
    resizeMode: 'contain',
  },
  loadingPlaceholder: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  bankLogoFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  bankLogoInitial: {
    fontWeight: 'bold',
  },
  verificationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 4,
    gap: 8,
    zIndex: 2,
  },
  verificationIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verificationText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  // Success Banner Styles
  successBanner: {
    marginTop: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  successBannerContent: {
    gap: 8,
  },
  successBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  successBannerTitle: {
    color: '#22C55E',
    fontSize: 14,
    fontWeight: 'bold',
  },
  successBannerDetails: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    padding: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  detailLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  detailValue: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Failed Banner Styles
  failedBanner: {
    marginTop: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  failedBannerContent: {
    gap: 8,
  },
  failedBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  failedBannerTitle: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: 'bold',
  },
  failedBannerDetails: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    padding: 8,
  },
  failedMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  failedBannerMessage: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  warningSymbol: {
    color: '#FBBF24',
    fontSize: 16,
    marginLeft: 8,
  },
  selectDifferentBankButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  selectDifferentBankText: {
    color: '#22C55E',
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: 8,
  },
  // Single Select Bank Button
  bankSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    zIndex: 2,
  },
  bankSelectorButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bankSelectorText: {
    color: '#FFD700',
    fontSize: 15,
    fontWeight: '600',
  },
  // Proceed Button Styles
  proceedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: -12,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    zIndex: 2,
  },
  proceedButtonActive: {
    backgroundColor: 'transparent',
    borderColor: '#FFD700',
  },
  proceedButtonDisabled: {
    backgroundColor: 'transparent',
    borderColor: '#333',
    opacity: 0.5,
  },
  proceedButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Quick Send Grid Styles - UPDATED
  quickSendContainer: {
    marginTop: 16,
    marginBottom: 24,
    zIndex: 2,
  },
  quickSendTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
  },
  quickSendGrid: {
    gap: 16,
  },
  quickSendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickSendItem: {
    alignItems: 'center',
    width: '23%',
  },
  quickSendBankName: {
    color: '#999',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 8,
  },
  // Recent Beneficiaries Section Styles - NEW
  recentBeneficiariesSection: {
    marginTop: 20,
    marginBottom: 20,
    zIndex: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  lockedArrowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 8,
    borderRadius: 8,
  },
  unlockTooltip: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-end',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  unlockTooltipText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '600',
  },
  beneficiariesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  beneficiaryCard: {
    alignItems: 'center',
    width: '31%',
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#222',
  },
  beneficiaryName: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
  beneficiaryAccount: {
    color: '#FFD700',
    fontSize: 10,
    marginTop: 2,
  },
  noBeneficiariesContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: '#222',
  },
  noBeneficiariesText: {
    color: '#666',
    fontSize: 12,
    marginTop: 8,
  },
});

export default RecipientSelectionScreen;