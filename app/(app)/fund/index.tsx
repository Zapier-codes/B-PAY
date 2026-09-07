// app/fund.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Image,
  Dimensions,
  Alert,
} from "react-native";
import { FontAwesome5, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/stores/auth-store";
import * as Clipboard from 'expo-clipboard';
import { supabase } from "@/config/supabase";
import { bpay, BPayError } from "@/services/edgeFunctions";

// Custom hooks
import useVirtualAccount from "@/hooks/useVirtualAccount";

// Components
import WalletCard from "./tabs/fundCard";
import TransferOption from "./tabs/TransferOption";
import TierUpgradeModal from "./tabs/TierUpgradeModal";

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function Fund() {
  const { currentAccount, forceRefreshProfile } = useAuth();
  
  // Custom hooks
  const {
    ngnAccount,
    setNgnAccount,
    isGenerating,
    setIsGenerating,
    hasExistingAccount,
    setHasExistingAccount,
    checkExistingVirtualAccount,
    maskAccountNumber,
  } = useVirtualAccount();

  // Local state
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Copy to clipboard function
  const copyToClipboard = async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert("Copied!", "Account number copied to clipboard");
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      Alert.alert("Error", "Failed to copy to clipboard");
    }
  };

  // Toggle account details view
  const toggleAccountDetails = () => {
    setShowAccountDetails(!showAccountDetails);
  };

  // Handle Generate NGN Account
  const handleGenerateNgn = async () => {
    console.log('🎯 Handle Generate NGN clicked');
    
    // If already has account, toggle details view
    if (hasExistingAccount) {
      toggleAccountDetails();
      return;
    }
    
    // Check tier first using currentAccount from auth store
    if (currentAccount?.tier === 0 || currentAccount?.tier === null) {
      console.log('⚠️ User needs upgrade, showing upgrade modal');
      setShowUpgradeModal(true);
      return;
    }
    
    // If tier is 1 or higher, proceed with virtual account creation
    if (currentAccount?.tier >= 1) {
      console.log('✅ User is Tier 1+, proceeding with virtual account creation');
      await createVirtualAccountFlow();
      return;
    }
  };

  // Create virtual account flow
  const createVirtualAccountFlow = async () => {
    if (!currentAccount?.user_id) {
      Alert.alert("Error", "User not authenticated. Please log in again.");
      return;
    }
    
    if (!currentAccount?.bpay_customer_id) {
      Alert.alert(
        "Customer ID Missing", 
        "Your profile is not properly linked with Payscribe. Please complete the Tier 1 upgrade first."
      );
      return;
    }

    console.log('🔍 Using customer ID from auth store:', currentAccount.bpay_customer_id);
    
    setIsGenerating(true);
    
    try {
      // Create a collection account for this customer via BPay. No screen
      // ever calls a provider directly or holds a provider credential —
      // see services/edgeFunctions.ts.
      let accountDetails: { account_number: string; bank_name: string; account_name: string } | null = null;
      let creationFailed: string | null = null;

      try {
        const account = await bpay.createVirtualAccount({
          customer_id: currentAccount.bpay_customer_id,
          ...(currentAccount.identification_number
            ? { bvn: currentAccount.identification_number }
            : {}),
        });
        accountDetails = {
          account_number: account.account_number,
          bank_name: account.bank_name,
          account_name: account.account_name,
        };
      } catch (creationError) {
        creationFailed =
          creationError instanceof BPayError
            ? creationError.message
            : "Failed to create virtual account";
      }

      if (accountDetails) {
        console.log('✅ Virtual account created successfully:', accountDetails);
        
        // Update database
        const { error } = await supabase
          .from("profiles")
          .update({
            bpay_account_number: accountDetails.account_number,
            bpay_bank_name: accountDetails.bank_name,
            bpay_account_name: accountDetails.account_name,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentAccount.id);

        if (error) {
          console.error('❌ Error updating profile:', error);
          throw new Error("Failed to save account details to database");
        }

        // CRITICAL: Force refresh the auth store to get updated data
        console.log('🔄 Force refreshing auth store...');
        const refreshedData = await forceRefreshProfile();
        
        if (refreshedData?.bpay_account_number) {
          const fullAccountNumber = refreshedData.bpay_account_number;
          setNgnAccount({
            bankName: refreshedData.bpay_bank_name || accountDetails.bank_name || "9PSB",
            accountNumber: fullAccountNumber, // Show full number, not masked
            accountName: refreshedData.bpay_account_name || accountDetails.account_name || `${refreshedData.first_name} ${refreshedData.last_name}`,
            fullAccountNumber: fullAccountNumber
          });
          
          setHasExistingAccount(true);
          setShowAccountDetails(true); // Show details after creation
          
          Alert.alert(
            "Success! 🎉", 
            `Your virtual account has been created!\n\n🏦 Bank: ${refreshedData.bpay_bank_name || accountDetails.bank_name}\n🔢 Account: ${fullAccountNumber}\n👤 Account Name: ${refreshedData.bpay_account_name || accountDetails.account_name}\n\nYou can now receive payments to this account.`
          );
        } else {
          // Fallback to response data if auth store refresh failed
          const fullAccountNumber = accountDetails.account_number;
          setNgnAccount({
            bankName: accountDetails.bank_name,
            accountNumber: fullAccountNumber, // Show full number, not masked
            accountName: accountDetails.account_name,
            fullAccountNumber: fullAccountNumber
          });
          
          setHasExistingAccount(true);
          setShowAccountDetails(true);
          
          Alert.alert(
            "Success! 🎉", 
            `Your virtual account has been created!\n\n🏦 Bank: ${accountDetails.bank_name}\n🔢 Account: ${fullAccountNumber}\n👤 Account Name: ${accountDetails.account_name}\n\nYou can now receive payments to this account.`
          );
        }
      } else {
        // Handle failure or unexpected response
        const errorMsg = creationFailed || "Failed to create virtual account";
        console.error('❌ VA creation failed:', errorMsg);
        
        // Handle specific error cases
        if (errorMsg.includes("already exists") || errorMsg.includes("duplicate")) {
          // Check if we already have the account in database
          const { data: profile } = await supabase
            .from("profiles")
            .select("bpay_account_number, bpay_bank_name, bpay_account_name, first_name, last_name")
            .eq("id", currentAccount.id)
            .single();
          
          if (profile?.bpay_account_number) {
            // Also refresh auth store to ensure consistency
            await forceRefreshProfile();
            
            const fullAccountNumber = profile.bpay_account_number;
            setNgnAccount({
              bankName: profile.bpay_bank_name || "9PSB",
              accountNumber: fullAccountNumber, // Show full number, not masked
              accountName: profile.bpay_account_name || `${profile.first_name} ${profile.last_name}`,
              fullAccountNumber: fullAccountNumber
            });
            setHasExistingAccount(true);
            setShowAccountDetails(true);
            Alert.alert(
              "Account Already Exists ✅", 
              `Your virtual account is already active!\n\n🏦 Bank: ${profile.bpay_bank_name || "9PSB"}\n🔢 Account: ${fullAccountNumber}\n👤 Account Name: ${profile.bpay_account_name || `${profile.first_name} ${profile.last_name}`}`
            );
            return;
          }
        }
        
        if (errorMsg.includes("Customer not found for this business")) {
          Alert.alert(
            "Customer Not Found on Payscribe",
            "Your customer ID exists in our database but was not found on Payscribe's system. This could happen if:\n\n1. The customer record was deleted on Payscribe\n2. There's a different business/account context\n\nPlease contact support or try upgrading to Tier 1 again."
          );
        } else if (errorMsg.includes("Customer not eligible")) {
          Alert.alert(
            "Account Not Eligible",
            "Your account needs additional verification. Please ensure:\n\n1. You have completed Tier 1 verification\n2. Your BVN is valid and matches your account\n3. Your address information is complete\n\nTry the Tier 1 upgrade process again."
          );
        } else if (errorMsg.includes("Tier 1")) {
          Alert.alert(
            "Tier 1 Required",
            "Your account needs to be upgraded to Tier 1 before creating a virtual account.\n\nPlease complete the Tier 1 upgrade process first."
          );
          setShowUpgradeModal(true);
        } else {
          Alert.alert("Virtual Account Creation Failed", errorMsg);
        }
      }
      
    } catch (error: any) {
      console.error("❌ Error in createVirtualAccountFlow:", error);
      Alert.alert("Error", error.message || "Failed to create virtual account. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle successful upgrade from modal
  const handleUpgradeSuccess = async () => {
    console.log('✅ Upgrade successful, closing modal and refreshing');
    
    // Close modal
    setShowUpgradeModal(false);
    
    // Force refresh auth store to get updated tier and customer ID
    const refreshedData = await forceRefreshProfile();
    
    if (refreshedData?.bpay_account_number) {
      // Virtual account already created during upgrade
      const fullAccountNumber = refreshedData.bpay_account_number;
      setNgnAccount({
        bankName: refreshedData.bpay_bank_name || "9PSB",
        accountNumber: fullAccountNumber, // Show full number, not masked
        accountName: refreshedData.bpay_account_name || `${refreshedData.first_name} ${refreshedData.last_name}`,
        fullAccountNumber: fullAccountNumber
      });
      setHasExistingAccount(true);
      setShowAccountDetails(true);
      
      Alert.alert(
        "Success! 🎉", 
        "You have been upgraded to Tier 1 and your virtual account has been created!\n\nYou can now receive payments to your virtual account."
      );
    } else if (refreshedData?.bpay_customer_id && refreshedData?.tier >= 1) {
      // Customer ID exists and user is Tier 1, offer to create VA
      Alert.alert(
        "Tier 1 Upgrade Complete! ✅", 
        "You have been successfully upgraded to Tier 1.\n\nWould you like to create your virtual account now?",
        [
          {
            text: "Create Virtual Account",
            style: "default",
            onPress: () => {
              // Automatically create virtual account after upgrade
              createVirtualAccountFlow();
            }
          },
          {
            text: "Later",
            style: "cancel"
          }
        ]
      );
    } else {
      Alert.alert(
        "Upgrade Complete",
        "Your account has been upgraded. Please refresh the page or try creating a virtual account again."
      );
    }
  };

  // Load existing virtual account on component mount
  useEffect(() => {
    const initializeData = async () => {
      console.log('🔄 Initializing fund page data...');
      setIsLoading(true);
      
      const hasAccount = await checkExistingVirtualAccount();
      console.log('🔍 Check existing VA result:', hasAccount);
      
      // Check current auth state for VA data
      if (currentAccount?.bpay_account_number && !hasExistingAccount) {
        console.log('🔍 Current auth store VA data:', {
          hasPayscribeAccount: !!currentAccount.bpay_account_number,
          bpay_account_number: currentAccount.bpay_account_number,
          tier: currentAccount.tier
        });
        
        console.log('🔄 Syncing VA data from auth store to local state');
        const fullAccountNumber = currentAccount.bpay_account_number;
        setNgnAccount({
          bankName: currentAccount.bpay_bank_name || "9PSB",
          accountNumber: fullAccountNumber, // Show full number, not masked
          accountName: currentAccount.bpay_account_name || `${currentAccount.first_name} ${currentAccount.last_name}`,
          fullAccountNumber: fullAccountNumber
        });
        setHasExistingAccount(true);
      }
      
      setIsLoading(false);
    };

    initializeData();
  }, [currentAccount?.user_id]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading account information...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Image
        source={require("@/assets/icons/home.png")}
        style={styles.watermark}
        resizeMode="contain"
      />

      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color="#FFD700" />
          </TouchableOpacity>
          <Text style={styles.title}>Fund Wallet</Text>
        </View>

        <View style={styles.walletContainer}>
          {/* NGN WALLET */}
          {!showAccountDetails || !hasExistingAccount ? (
            <WalletCard
              currency="NGN"
              balance="₦0.00"
              subBalance="$0.00"
              showGenerateButton={!hasExistingAccount}
              isGenerating={isGenerating}
              onGenerate={handleGenerateNgn}
              buttonText={hasExistingAccount ? "View Account" : "Generate NGN Account"}
            >
              {hasExistingAccount && ngnAccount && (
                <View style={styles.hiddenAccountView}>
                  <TouchableOpacity 
                    style={styles.tapToSeeButton}
                    onPress={toggleAccountDetails}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="eye-outline" size={40} color="#FFD700" />
                  </TouchableOpacity>
                </View>
              )}
            </WalletCard>
          ) : (
            <View style={styles.virtualAccountCard}>
              <View style={styles.accountDetailsContainer}>
                {/* Close button - Red X positioned higher */}
                <TouchableOpacity 
                  style={styles.closeButton}
                  onPress={toggleAccountDetails}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={22} color="#FF4444" />
                </TouchableOpacity>
                
                {/* Bank Logo with home.png icon - No yellow edges */}
                <View style={styles.bankHeader}>
                  <View style={styles.bankLogo}>
                    <Image 
                      source={require("@/assets/icons/home.png")} 
                      style={styles.bankLogoImage}
                      resizeMode="cover"
                    />
                  </View>
                  <Text style={styles.bankName}>{ngnAccount?.bankName || "9PSB"}</Text>
                </View>
                
                {/* Account Number with Copy button inline */}
                <View style={styles.accountNumberRow}>
                  <Text style={styles.accountNumber}>{ngnAccount?.accountNumber || ""}</Text>
                  <TouchableOpacity 
                    style={styles.copyIconButton}
                    onPress={() => copyToClipboard(ngnAccount?.fullAccountNumber || '')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="copy-outline" size={18} color="#FFD700" />
                  </TouchableOpacity>
                </View>
                
                {/* Account Name */}
                <View style={styles.accountDetails}>
                  <Text style={styles.accountName}>{ngnAccount?.accountName || ""}</Text>
                </View>
                
                {/* User Tag */}
                {currentAccount?.bpay_tag && (
                  <View style={styles.tagContainer}>
                    <Text style={styles.tagText}>@{currentAccount.bpay_tag}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* USD WALLET */}
          <WalletCard
            currency="USD"
            balance="$0.00"
            subBalance="₦0.00"
            showLock={true}
          >
            <View style={styles.usdNote}>
              <Text style={styles.usdNoteText}>Locked for conversion</Text>
            </View>
          </WalletCard>
        </View>

        <ConvertSection />
        
        <FundingOptionsSection />
      </View>

      {/* Tier Upgrade Modal */}
      <TierUpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onUpgradeSuccess={handleUpgradeSuccess}
        customerId={currentAccount?.bpay_customer_id || ''}
      />
    </SafeAreaView>
  );
}

// Convert Section Component
function ConvertSection() {
  return (
    <View style={styles.convertSection}>
      <TouchableOpacity style={styles.convertButton}>
        <View style={styles.convertIconCircle}>
          <MaterialCommunityIcons name="swap-horizontal" size={28} color="#FFD700" />
        </View>
        <Text style={styles.convertText}>Convert NGN to USD</Text>
      </TouchableOpacity>
    </View>
  );
}

// Funding Options Section Component
function FundingOptionsSection() {
  const fundingOptions = [
    {
      icon: "bank-transfer",
      title: "Bank Transfer",
      subtitle: "Use your virtual account",
      iconLib: MaterialCommunityIcons,
    },
    {
      icon: "card",
      title: "Card Deposit",
      subtitle: "Visa, Mastercard, Verve",
      iconLib: Ionicons,
    },
    {
      icon: "qrcode-scan",
      title: "Scan QR Code",
      subtitle: "Pay with mobile app",
      iconLib: MaterialCommunityIcons,
    },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>FUNDING OPTIONS</Text>
      
      {fundingOptions.map((option, index) => (
        <TransferOption
          key={index}
          icon={option.icon}
          title={option.title}
          subtitle={option.subtitle}
          iconLib={option.iconLib}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    paddingHorizontal: 16,
  },
  watermark: {
    position: "absolute",
    top: "30%",
    left: "10%",
    width: 300,
    height: 300,
    opacity: 0.08,
    zIndex: 2,
  },
  content: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: 20,
    zIndex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 28,
  },
  backButton: {
    padding: 4,
  },
  title: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
    marginLeft: 12,
  },
  walletContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  virtualAccountCard: {
    backgroundColor: "#111",
    borderRadius: 16,
    padding: 16,
    width: SCREEN_WIDTH * 0.44,
    borderWidth: 1,
    borderColor: "#222",
    minHeight: 180,
    justifyContent: 'center',
    position: 'relative',
  },
  // Account Details Styles
  accountDetailsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Red X - positioned outside container
  closeButton: {
    position: 'absolute',
    top: -25,
    right: -22,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  bankHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  bankLogo: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    overflow: 'hidden',
  },
  bankLogoImage: {
    width: 50,
    height: 50,
  },
  bankName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  accountNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    position: 'relative',
  },
  accountNumber: {
    color: '#2ECC71',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginRight: 8,
  },
  copyIconButton: {
    position: 'relative',
    top: -4,
    padding: 4,
    backgroundColor: 'transparent',
  },
  accountDetails: {
    marginBottom: 12,
    alignItems: 'center',
  },
  accountName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tagContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#FFD700',
  },
  tagText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: 'bold',
  },
  hiddenAccountView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tapToSeeButton: {
    alignItems: 'center',
    padding: 10,
  },
  usdNote: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  usdNoteText: {
    color: "#aaa",
    fontSize: 11,
  },
  convertSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  convertButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  convertIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  convertText: {
    color: "#FFD700",
    fontSize: 15,
    fontWeight: "600",
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },
  transferOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  transferText: {
    flex: 1,
  },
  transferTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  transferSubtitle: {
    color: "#aaa",
    fontSize: 13,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  loadingText: {
    color: '#FFD700',
    fontSize: 16,
  },
});