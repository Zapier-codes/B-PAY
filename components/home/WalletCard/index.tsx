// src/components/home/WalletCard.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Modal,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "@/config/supabase";
import { useAuth } from "@/stores/auth-store";
import { bpay } from "@/services/edgeFunctions";

interface WalletProfile {
  id: string;
  username: string | null;
  bpay_tag: string | null;
  bonus_percent: number;
  balance: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  country_code?: string | null;
  currency_symbol?: string | null;
  flag_emoji?: string | null;
  dial_code?: string | null;
  country?: string | null;
  tier?: number | null;
}

export default function WalletCard() {
  const router = useRouter();
  const { 
    currentAccount, 
    isAuthenticated, 
    logout, 
    getFormattedBpayTag, 
    formatBpayTag,
    forceRefreshProfile,
    updateProfile,
    user
  } = useAuth();
  
  const [profile, setProfile] = useState<WalletProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [showTagRequiredModal, setShowTagRequiredModal] = useState(false);
  const [targetRoute, setTargetRoute] = useState<string | null>(null);

  // Listen for auth store changes (especially bpay_tag updates)
  useEffect(() => {
    console.log("🔄 WalletCard: Auth store updated", {
      hasAccount: !!currentAccount,
      bpayTag: currentAccount?.bpay_tag,
      isAuthenticated
    });
    
    // If we have auth store data but our local profile is out of sync, refresh
    if (currentAccount && profile?.id === currentAccount.id && 
        profile?.bpay_tag !== currentAccount.bpay_tag) {
      console.log("🔄 BPAY tag changed in auth store, updating local profile");
      setProfile(prev => prev ? { ...prev, bpay_tag: currentAccount.bpay_tag } : null);
    }
    
    // Always fetch fresh data when auth state changes
    if (isAuthenticated && currentAccount) {
      fetchUserProfile();
    } else {
      setLoading(false);
      setProfile(null);
    }
  }, [isAuthenticated, currentAccount?.id, currentAccount?.bpay_tag]);

  // Silent, best-effort balance refresh via BPay — never calls a provider
  // directly, never holds a provider credential client-side. See
  // services/edgeFunctions.ts for why this is the only allowed shape.
  const syncBalanceFromBpay = async (userId: string) => {
    try {
      const { balance: newBalance } = await bpay.getWalletBalance();
      if (newBalance === undefined) return;

      // Update in Supabase
      await supabase
        .from("profiles")
        .update({ balance: newBalance })
        .eq("id", userId);

      // Update in local state
      setProfile(prev => prev ? { ...prev, balance: newBalance } : null);

      // Update in auth store
      if (currentAccount) {
        await updateProfile({ balance: newBalance });
      }

      console.log("💰 Balance synced:", newBalance);
    } catch (err) {
      // Silent fail — this stays best-effort until BPay backend exposes a
      // balance route (see supabase/functions/wallet-balance/index.ts).
    }
  };

  const fetchUserProfile = async () => {
    if (!currentAccount) return;
    
    try {
      setLoading(true);
      setProfileError(null);

      let fetchedProfile: WalletProfile | null = null;
      const userId = currentAccount.user_id || currentAccount.id;

      console.log("📋 Fetching profile for user:", userId);

      // First, try to use the auth store data directly
      if (currentAccount.bpay_tag) {
        console.log("✅ Using auth store data for BPAY tag:", currentAccount.bpay_tag);
        fetchedProfile = {
          id: currentAccount.id,
          username: currentAccount.username,
          bpay_tag: currentAccount.bpay_tag,
          bonus_percent: currentAccount.bonus_percent,
          balance: currentAccount.balance,
          first_name: currentAccount.first_name,
          last_name: currentAccount.last_name,
          email: currentAccount.email,
          phone: currentAccount.phone,
          country_code: currentAccount.country_code,
          currency_symbol: currentAccount.currency_symbol,
          flag_emoji: currentAccount.flag_emoji,
          dial_code: currentAccount.dial_code,
          country: currentAccount.country,
          tier: currentAccount.tier,
        };
      } else {
        // Fallback to Supabase fetch
        const { data, error } = await supabase
          .from("profiles")
          .select(`
            id, username, bpay_tag, bonus_percent, balance, first_name, last_name,
            email, phone, country_code, currency_symbol, flag_emoji, dial_code, country, tier
          `)
          .eq("id", userId)
          .maybeSingle();

        if (error && error.code !== "PGRST116") {
          console.error("❌ Supabase error:", error);
          throw error;
        }
        
        if (data) {
          console.log("✅ Profile found in Supabase:", data);
          fetchedProfile = data;
        }
      }

      if (!fetchedProfile) {
        console.log("❌ No profile found for current account");
        setProfileError("Profile not found in database");
        setProfile(null);
        return;
      }

      // Sync live balance silently
      console.log("🔄 Syncing balance for user:", fetchedProfile.id);
      await syncBalanceFromBpay(fetchedProfile.id);

      // Set profile data
      setProfile(fetchedProfile);

      console.log("✅ Profile loaded successfully:", {
        id: fetchedProfile.id,
        bpay_tag: fetchedProfile.bpay_tag,
        formatted_bpay_tag: formatBpayTag(fetchedProfile.bpay_tag),
        balance: fetchedProfile.balance
      });

    } catch (error) {
      console.error("❌ Error in fetchUserProfile:", error);
      setProfileError("Failed to load profile");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!currentAccount) return;
    
    setRefreshing(true);
    try {
      // Force refresh from auth store
      await forceRefreshProfile();
      
      // Manually fetch profile data
      await fetchUserProfile();
      
      Alert.alert("Refreshed", "Wallet data updated successfully!");
    } catch (error) {
      console.error("Error refreshing wallet:", error);
      Alert.alert("Error", "Failed to refresh wallet data");
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const copyTag = () => {
    const formattedTag = getFormattedBpayTag();
    if (formattedTag) {
      Alert.alert("Copied!", `${formattedTag} copied to clipboard.`);
    }
  };

  const formatBalance = (balance: number) => {
    const currencySymbol = profile?.currency_symbol || currentAccount?.currency_symbol || "₦";
    
    // Helper function to add commas to numbers
    const addCommas = (numStr: string): string => {
      const parts = numStr.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parts.join('.');
    };
    
    // Format the balance based on size
    if (balance < 1000000) {
      // For numbers below 1 million, show full with commas
      return `${currencySymbol}${addCommas(balance.toFixed(2))}`;
    } else if (balance < 1000000000) {
      // For millions: 1M, 1.5M, 10M, etc.
      const millions = balance / 1000000;
      // Check if it's a whole number
      if (Math.floor(millions) === millions) {
        return `${currencySymbol}${millions.toFixed(0)}M`;
      } else {
        // Show 1 decimal place for non-whole millions
        return `${currencySymbol}${millions.toFixed(1)}M`;
      }
    } else if (balance < 1000000000000) {
      // For billions
      const billions = balance / 1000000000;
      if (Math.floor(billions) === billions) {
        return `${currencySymbol}${billions.toFixed(0)}B`;
      } else {
        return `${currencySymbol}${billions.toFixed(1)}B`;
      }
    } else {
      // For trillions and above
      const trillions = balance / 1000000000000;
      if (Math.floor(trillions) === trillions) {
        return `${currencySymbol}${trillions.toFixed(0)}T`;
      } else {
        return `${currencySymbol}${trillions.toFixed(1)}T`;
      }
    }
  };

  // Helper function for dynamic font sizing
  const calculateFontSize = (balanceText: string) => {
    const length = balanceText.length;
    if (length <= 10) return 38;
    if (length <= 15) return 32;
    if (length <= 20) return 28;
    return 24; // For very long numbers
  };

  const getDisplayName = () => {
    // Try profile first
    if (profile?.username) return profile.username;
    if (profile?.first_name && profile?.last_name) return `${profile.first_name} ${profile.last_name}`;
    if (profile?.first_name) return profile.first_name;
    if (profile?.email) return profile.email.split("@")[0];
    
    // Fallback to auth store
    if (currentAccount?.username) return currentAccount.username;
    if (currentAccount?.first_name && currentAccount?.last_name) return `${currentAccount.first_name} ${currentAccount.last_name}`;
    if (currentAccount?.first_name) return currentAccount.first_name;
    if (currentAccount?.email) return currentAccount.email.split("@")[0];
    
    return "User";
  };

  const hasCountryData = () => {
    return (profile?.country_code && profile?.flag_emoji) || 
           (currentAccount?.country_code && currentAccount?.flag_emoji);
  };

  const getCountryCode = () => {
    return profile?.country_code || currentAccount?.country_code;
  };

  const getFlagEmoji = () => {
    return profile?.flag_emoji || currentAccount?.flag_emoji;
  };

  const getCurrencySymbol = () => {
    return profile?.currency_symbol || currentAccount?.currency_symbol;
  };

  // Check if user has a BPAY tag
  const hasTag = () => {
    const tag = profile?.bpay_tag || currentAccount?.bpay_tag;
    return tag && tag.trim().length > 0;
  };

  // Get formatted BPAY tag with @ symbol
  const getFormattedTag = () => {
    const tag = profile?.bpay_tag || currentAccount?.bpay_tag;
    return formatBpayTag(tag || '');
  };

  // Navigation handlers with tag check
  const handleNavigate = (route: string) => {
    if (!hasTag()) {
      setTargetRoute(route);
      setShowTagRequiredModal(true);
      return;
    }
    router.push(`/${route}`);
  };

  const goToSend = () => handleNavigate("send");
  const goToFund = () => handleNavigate("fund");
  const goToBills = () => handleNavigate("bills");
  const goToGetTag = () => router.push("/get-tag");

  const handleCreateTag = () => {
    setShowTagRequiredModal(false);
    router.push("/get-tag");
  };

  const handleCloseModal = () => {
    setShowTagRequiredModal(false);
    setTargetRoute(null);
  };

  const getRouteName = () => {
    switch (targetRoute) {
      case "send": return "Send Money";
      case "fund": return "Fund Wallet";
      case "bills": return "Pay Bills";
      default: return "this feature";
    }
  };

  if (loading) {
    return (
      <View style={styles.walletSection}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonBalance} />
        <View style={styles.skeletonTag} />
        <View style={styles.actionRow}>
          <View style={styles.skeletonButton} />
          <View style={styles.skeletonButton} />
          <View style={styles.skeletonButton} />
        </View>
      </View>
    );
  }

  if (!isAuthenticated || !currentAccount) {
    return (
      <View style={styles.walletSection}>
        <Text style={styles.errorText}>Please log in to view wallet</Text>
        <TouchableOpacity onPress={() => router.push("/login")} style={styles.retryButton}>
          <Text style={styles.retryText}>Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if ((!profile || profileError) && !currentAccount.bpay_tag) {
    return (
      <View style={styles.walletSection}>
        <Text style={styles.errorText}>Profile Not Found</Text>
        <Text style={styles.errorSubtext}>
          The account "{currentAccount.identifier}" was not found in our database.
        </Text>
        <Text style={styles.errorSubtext}>
          This usually happens when an account is deleted or not properly created.
        </Text>

        <View style={styles.buttonGroup}>
          <TouchableOpacity onPress={fetchUserProfile} style={styles.retryButton}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Use Different Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Use auth store data if profile fetch failed but we have auth data
  const displayProfile = profile || {
    id: currentAccount.id,
    username: currentAccount.username,
    bpay_tag: currentAccount.bpay_tag,
    bonus_percent: currentAccount.bonus_percent,
    balance: currentAccount.balance,
    first_name: currentAccount.first_name,
    last_name: currentAccount.last_name,
    email: currentAccount.email,
    phone: currentAccount.phone,
    country_code: currentAccount.country_code,
    currency_symbol: currentAccount.currency_symbol,
    flag_emoji: currentAccount.flag_emoji,
    dial_code: currentAccount.dial_code,
    country: currentAccount.country,
    tier: currentAccount.tier,
  };

  // Get formatted balance text for dynamic font sizing
  const balanceText = formatBalance(displayProfile.balance);
  const fontSize = calculateFontSize(balanceText);

  return (
    <>
      <View style={styles.walletSection}>
        {/* Header with name and flag */}
        <View style={styles.headerRow}>
          <Text style={styles.walletTitle}>{getDisplayName()}</Text>
          {hasCountryData() && (
            <View style={styles.flagContainer}>
              <Text style={styles.flagText}>{getFlagEmoji()}</Text>
              <Text style={styles.countryText}>{getCountryCode()}</Text>
            </View>
          )}
          
          {/* Refresh button */}
          <TouchableOpacity onPress={handleRefresh} style={styles.refreshButtonHeader}>
            <Ionicons 
              name="refresh" 
              size={20} 
              color="#FFD700" 
              style={refreshing && styles.refreshingIcon}
            />
          </TouchableOpacity>
        </View>

        {/* Balance with dynamic currency symbol */}
        <View style={styles.balanceContainer}>
          <View style={styles.balanceWrapper}>
            <Text 
              style={[styles.balance, { fontSize }]} 
              numberOfLines={1} 
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {balanceText}
            </Text>
          </View>
          {displayProfile.bonus_percent > 0 && (
            <View style={styles.bonusBadge}>
              <Text style={styles.bonusText}>+{displayProfile.bonus_percent}%</Text>
            </View>
          )}
        </View>

        {/* BPAY Tag Section - Only show Get Tag button if user doesn't have a tag */}
        <View style={styles.tagRow}>
          {hasTag() ? (
            <>
              <Text style={styles.bpayTag}>{getFormattedTag()}</Text>
              <TouchableOpacity onPress={copyTag} style={styles.copyButton}>
                <MaterialCommunityIcons name="content-copy" size={16} color="#aaa" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
                <Ionicons name="refresh" size={16} color="#aaa" />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.getTagButton} onPress={goToGetTag}>
              <View style={styles.getTagContent}>
                <Ionicons name="sparkles" size={16} color="#FFD700" />
                <Text style={styles.getTagText}>Get Your BPAY Tag</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Additional Country Info */}
        {hasCountryData() && getCurrencySymbol() && (
          <View style={styles.countryInfo}>
            <Text style={styles.countryInfoText}>
              {getFlagEmoji()} {getCountryCode()} • {getCurrencySymbol()}
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={goToSend}
            disabled={!hasTag()}
          >
            <View style={[styles.actionIcon, { backgroundColor: hasTag() ? "#007AFF" : "#5a5a5a" }]}>
              <Ionicons name="arrow-up" size={20} color="#fff" />
            </View>
            <Text style={[styles.actionLabel, !hasTag() && styles.disabledLabel]}>Send</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={goToFund}
            disabled={!hasTag()}
          >
            <View style={[styles.actionIcon, { backgroundColor: hasTag() ? "#00FF7F" : "#5a5a5a" }]}>
              <Ionicons name="flash" size={20} color={hasTag() ? "#000" : "#aaa"} />
            </View>
            <Text style={[styles.actionLabel, !hasTag() && styles.disabledLabel]}>Fund</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={goToBills}
            disabled={!hasTag()}
          >
            <View style={[styles.actionIcon, { backgroundColor: hasTag() ? "#FF9500" : "#5a5a5a" }]}>
              <Ionicons name="business-outline" size={20} color="#fff" />
            </View>
            <Text style={[styles.actionLabel, !hasTag() && styles.disabledLabel]}>Bills</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tag Required Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showTagRequiredModal}
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Ionicons name="key-outline" size={40} color="#FFD700" />
              <Text style={styles.modalTitle}>BPAY Tag Required</Text>
            </View>
            
            <View style={styles.modalContent}>
              <Text style={styles.modalText}>
                You need a BPAY Tag to access <Text style={styles.modalHighlight}>{getRouteName()}</Text>.
              </Text>
              
              <Text style={styles.modalSubtext}>
                Your BPAY Tag is your unique identifier that makes sending, receiving, and managing money secure and easy.
              </Text>

              <View style={styles.benefitsContainer}>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#00FF7F" />
                  <Text style={styles.benefitText}>Secure transactions</Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#00FF7F" />
                  <Text style={styles.benefitText}>Quick money transfers</Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#00FF7F" />
                  <Text style={styles.benefitText}>Easy bill payments</Text>
                </View>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.secondaryButton}
                onPress={handleCloseModal}
              >
                <Text style={styles.secondaryButtonText}>Not Now</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.primaryButton}
                onPress={handleCreateTag}
              >
                <View style={styles.primaryButtonContent}>
                  <Ionicons name="sparkles" size={18} color="#000" />
                  <Text style={styles.primaryButtonText}>Create BPAY Tag</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// Styles - Added refresh button and animations
const styles = StyleSheet.create({
  walletSection: {
    alignItems: "center",
    marginBottom: 28,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    position: "relative",
    width: "100%",
  },
  walletTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginRight: 8,
  },
  refreshButtonHeader: {
    position: "absolute",
    right: 0,
    padding: 8,
  },
  refreshingIcon: {
    transform: [{ rotate: "360deg" }],
  },
  flagContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  flagText: {
    fontSize: 14,
    marginRight: 4,
  },
  countryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  balanceContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginVertical: 8,
    maxWidth: "100%",
  },
  balanceWrapper: {
    maxWidth: "55%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignSelf: "center",
    minWidth: 100,
  },
  balance: {
    color: "#fff",
    fontWeight: "700",
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    includeFontPadding: false,
    textAlign: "center",
  },
  bonusBadge: {
    backgroundColor: "#8B4513",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    transform: [{ rotate: "-12deg" }],
    position: "absolute",
    right: -20,
    top: -10,
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  bonusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
    minHeight: 40,
  },
  bpayTag: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.5,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  copyButton: {
    marginLeft: 8,
    padding: 6,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  refreshButton: {
    marginLeft: 4,
    padding: 6,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  getTagButton: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.4)",
    borderStyle: "dashed",
  },
  getTagContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  getTagText: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 6,
  },
  countryInfo: {
    marginBottom: 16,
  },
  countryInfoText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 12,
    fontWeight: "500",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginTop: 20,
    paddingHorizontal: 10,
  },
  actionButton: {
    alignItems: "center",
    width: 80,
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  actionLabel: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  disabledLabel: {
    color: "rgba(255, 255, 255, 0.4)",
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 10,
    fontWeight: "600",
  },
  errorSubtext: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 10,
    lineHeight: 20,
  },
  buttonGroup: {
    flexDirection: "column",
    gap: 12,
    width: "100%",
    marginTop: 10,
  },
  retryButton: {
    backgroundColor: "#00FF7F",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  logoutButton: {
    backgroundColor: "rgba(255, 107, 107, 0.2)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ff6b6b",
  },
  retryText: {
    color: "#000",
    fontWeight: "600",
    textAlign: "center",
  },
  logoutText: {
    color: "#ff6b6b",
    fontWeight: "600",
    textAlign: "center",
  },
  skeletonTitle: {
    width: 120,
    height: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    marginBottom: 6,
  },
  skeletonBalance: {
    width: 100,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    marginBottom: 8,
  },
  skeletonTag: {
    width: 150,
    height: 18,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    marginBottom: 20,
  },
  skeletonButton: {
    width: 80,
    height: 70,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalContainer: {
    backgroundColor: "#1a1a1a",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },
  modalContent: {
    marginBottom: 24,
  },
  modalText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 22,
  },
  modalHighlight: {
    color: "#FFD700",
    fontWeight: "700",
  },
  modalSubtext: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  benefitsContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
  },
  benefitItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  benefitText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 14,
    marginLeft: 10,
    fontWeight: "500",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  secondaryButtonText: {
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    fontWeight: "600",
    fontSize: 14,
  },
  primaryButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255, 215, 0, 0.9)",
  },
  primaryButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#000",
    textAlign: "center",
    fontWeight: "700",
    fontSize: 14,
    marginLeft: 8,
  },
});