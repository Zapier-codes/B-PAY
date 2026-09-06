// app/settings.tsx
'use client';

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Image,
  Switch,
  ScrollView,
  Dimensions,
  Animated,
  Modal,
} from "react-native";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import { useAuth } from "@/stores/auth-store";
import { router } from "expo-router";
import { useThemeColors } from "@/hooks/useThemeColors";
import * as Haptics from "expo-haptics";

const SCREEN_WIDTH = Dimensions.get("window").width;

// Custom Alert Modal Component
const LogoutAlertModal = ({ 
  visible, 
  onClose, 
  onConfirm,
  countdown
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  countdown: number;
}) => {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
    >
      <View style={alertStyles.overlay}>
        <View style={alertStyles.container}>
          {/* Warning Icon */}
          <View style={alertStyles.iconContainer}>
            <Ionicons name="log-out-outline" size={50} color="#FFD700" />
          </View>

          {/* Title */}
          <Text style={alertStyles.title}>Confirm Logout</Text>
          
          {/* Message */}
          <Text style={alertStyles.message}>
            Are you sure you want to logout? You'll be redirected to the welcome screen to choose another account.
          </Text>

          {/* Countdown Display */}
          <View style={alertStyles.countdownContainer}>
            <Text style={alertStyles.countdownText}>
              Logout available in {countdown}s
            </Text>
          </View>

          {/* Buttons */}
          <View style={alertStyles.buttonContainer}>
            <TouchableOpacity
              style={[alertStyles.button, alertStyles.cancelButton]}
              onPress={onClose}
            >
              <Ionicons name="close-circle" size={24} color="#FFD700" />
              <Text style={alertStyles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                alertStyles.button, 
                alertStyles.confirmButton,
                countdown > 0 && alertStyles.confirmButtonDisabled
              ]}
              onPress={onConfirm}
              disabled={countdown > 0}
            >
              <Ionicons 
                name="log-out" 
                size={24} 
                color={countdown > 0 ? "#666" : "#FF4444"} 
              />
              <Text style={[
                alertStyles.confirmButtonText,
                countdown > 0 && alertStyles.confirmButtonTextDisabled
              ]}>
                {countdown > 0 ? `Wait ${countdown}s` : 'Logout'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const alertStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#FFD700',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#FFD700',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
    opacity: 0.9,
  },
  countdownContainer: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  countdownText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderColor: '#FFD700',
  },
  confirmButton: {
    backgroundColor: 'transparent',
    borderColor: '#FF4444',
  },
  confirmButtonDisabled: {
    borderColor: '#666',
    opacity: 0.6,
  },
  cancelButtonText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButtonText: {
    color: '#FF4444',
    fontSize: 16,
    fontWeight: 'bold',
  },
  confirmButtonTextDisabled: {
    color: '#666',
  },
});

// Account Info Modal
const AccountInfoModal = ({ 
  visible, 
  onClose,
  user,
  currentAccount
}: {
  visible: boolean;
  onClose: () => void;
  user: any;
  currentAccount: any;
}) => {
  const maskIdentifier = (id: string) => {
    if (id.includes('@')) {
      const [local, domain] = id.split('@');
      return `${local[0]}***@${domain}`;
    } else {
      const digits = id.replace(/\D/g, '');
      if (digits.length < 6) return id;
      return `${id.slice(0, 4)}*****${id.slice(-3)}`;
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
    >
      <View style={accountModalStyles.overlay}>
        <View style={accountModalStyles.container}>
          {/* Header */}
          <View style={accountModalStyles.header}>
            <Text style={accountModalStyles.title}>Account Information</Text>
            <TouchableOpacity onPress={onClose} style={accountModalStyles.closeButton}>
              <Ionicons name="close" size={24} color="#FFD700" />
            </TouchableOpacity>
          </View>

          {/* Profile Section */}
          <View style={accountModalStyles.profileSection}>
            <View style={accountModalStyles.avatarContainer}>
              {user?.avatar_url ? (
                <Image 
                  source={{ uri: user.avatar_url }} 
                  style={accountModalStyles.avatar}
                />
              ) : (
                <View style={accountModalStyles.avatarPlaceholder}>
                  <Ionicons name="person" size={30} color="#FFD700" />
                </View>
              )}
              {user?.is_verified && (
                <View style={accountModalStyles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#FFD700" />
                </View>
              )}
            </View>
            
            <Text style={accountModalStyles.userName}>
              {user?.full_name || 'No Name Set'}
            </Text>
            <Text style={accountModalStyles.userIdentifier}>
              {currentAccount ? maskIdentifier(currentAccount.identifier) : ''}
            </Text>
          </View>

          {/* Account Details */}
          <View style={accountModalStyles.detailsSection}>
            <View style={accountModalStyles.detailItem}>
              <Text style={accountModalStyles.detailLabel}>User ID</Text>
              <Text style={accountModalStyles.detailValue}>{user?.id || 'N/A'}</Text>
            </View>
            
            <View style={accountModalStyles.detailItem}>
              <Text style={accountModalStyles.detailLabel}>Email</Text>
              <Text style={accountModalStyles.detailValue}>
                {user?.email || 'Not set'}
              </Text>
            </View>
            
            <View style={accountModalStyles.detailItem}>
              <Text style={accountModalStyles.detailLabel}>Phone</Text>
              <Text style={accountModalStyles.detailValue}>
                {user?.phone || 'Not set'}
              </Text>
            </View>
            
            <View style={accountModalStyles.detailItem}>
              <Text style={accountModalStyles.detailLabel}>Verification Status</Text>
              <View style={accountModalStyles.statusBadge}>
                <Text style={[
                  accountModalStyles.statusText,
                  user?.is_verified ? accountModalStyles.verified : accountModalStyles.unverified
                ]}>
                  {user?.is_verified ? 'Verified' : 'Unverified'}
                </Text>
              </View>
            </View>
            
            {user?.country_code && (
              <View style={accountModalStyles.detailItem}>
                <Text style={accountModalStyles.detailLabel}>Country</Text>
                <Text style={accountModalStyles.detailValue}>
                  {user.flag_emoji} {user.country_code}
                </Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <TouchableOpacity 
            style={accountModalStyles.closeBtn} 
            onPress={onClose}
          >
            <Ionicons name="close-circle" size={20} color="#FFD700" />
            <Text style={accountModalStyles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const accountModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  title: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#000',
    borderRadius: 10,
    padding: 2,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  userName: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userIdentifier: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.8,
  },
  detailsSection: {
    marginBottom: 24,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  detailLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.8,
  },
  detailValue: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  verified: {
    color: '#00FF7F',
  },
  unverified: {
    color: '#FF4444',
  },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD700',
    gap: 8,
  },
  closeBtnText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default function Settings() {
  const auth = useAuth();
  const [notifications, setNotifications] = useState(true);
  const [biometric, setBiometric] = useState(false);
  const { isDark, setColorScheme } = useThemeColors();
  const [showLogoutAlert, setShowLogoutAlert] = useState(false);
  const [showAccountInfo, setShowAccountInfo] = useState(false);
  const [logoutCountdown, setLogoutCountdown] = useState(0);

  // Refs for animations and intervals
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Handle logout press with countdown
  const handleLogoutPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowLogoutAlert(true);
    setLogoutCountdown(5); // Start 5-second countdown
    
    // Start countdown timer
    countdownRef.current = setInterval(() => {
      setLogoutCountdown(prev => {
        if (prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Handle logout confirmation
  const handleLogoutConfirm = async () => {
    if (logoutCountdown > 0) return; // Prevent logout during countdown
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Fade animation
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(async () => {
      // Logout using Zustand store
      await auth.logout();
      setShowLogoutAlert(false);
      
      // Redirect to welcome-back screen (not login)
      router.replace("/(app)/(Auth)/welcome-back");
    });
  };

  // Handle logout cancel
  const handleLogoutCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowLogoutAlert(false);
    
    // Clear countdown
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setLogoutCountdown(0);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  const handleSwitchAccount = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/(app)/(Auth)/welcome-back");
  };

  const handleAccountInfo = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowAccountInfo(true);
  };

  // Show loading while checking auth
  if (!auth.isInitialized || auth.isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading Settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show redirect if not authenticated (shouldn't happen with new flow)
  if (!auth.isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Redirecting...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Image
        source={require("@/assets/icons/home.png")}
        style={styles.watermark}
        resizeMode="contain"
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={28} color="#FFD700" />
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
        </View>

        {/* ACCOUNT SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>

          <TouchableOpacity 
            style={styles.settingItem}
            onPress={handleAccountInfo}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="person-outline" size={20} color="#FFD700" />
            </View>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Account Information</Text>
              <Text style={styles.settingSubtitle}>
                View your profile details and status
              </Text>
            </View>
            <FontAwesome5 name="chevron-right" size={18} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="shield-account" size={20} color="#FFD700" />
            </View>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Security</Text>
              <Text style={styles.settingSubtitle}>PIN, Biometric, 2FA</Text>
            </View>
            <FontAwesome5 name="chevron-right" size={18} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.settingItem}
            onPress={handleSwitchAccount}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="swap-horizontal" size={20} color="#FFD700" />
            </View>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Switch Account</Text>
              <Text style={styles.settingSubtitle}>
                {auth.savedAccounts.length} account(s) available
              </Text>
            </View>
            <FontAwesome5 name="chevron-right" size={18} color="#666" />
          </TouchableOpacity>
        </View>

        {/* PREFERENCES SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PREFERENCES</Text>

          <View style={styles.settingItem}>
            <View style={styles.iconCircle}>
              <Ionicons name="notifications-outline" size={20} color="#FFD700" />
            </View>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Push Notifications</Text>
            </View>
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ false: '#333', true: '#FFD700' }}
              thumbColor={notifications ? "#000" : "#f4f3f4"}
              ios_backgroundColor="#333"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.iconCircle}>
              <Ionicons name="finger-print" size={20} color="#FFD700" />
            </View>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Biometric Login</Text>
            </View>
            <Switch
              value={biometric}
              onValueChange={setBiometric}
              trackColor={{ false: '#333', true: '#FFD700' }}
              thumbColor={biometric ? "#000" : "#f4f3f4"}
              ios_backgroundColor="#333"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.iconCircle}>
              <Ionicons name="moon" size={20} color="#FFD700" />
            </View>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Dark Mode</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={(value) => setColorScheme(value ? "dark" : "light")}
              trackColor={{ false: '#333', true: '#FFD700' }}
              thumbColor={isDark ? "#000" : "#f4f3f4"}
              ios_backgroundColor="#333"
            />
          </View>
        </View>

        {/* SUPPORT SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SUPPORT</Text>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.iconCircle}>
              <Ionicons name="help-circle-outline" size={20} color="#FFD700" />
            </View>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Help Center</Text>
            </View>
            <FontAwesome5 name="chevron-right" size={18} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="message-outline" size={20} color="#FFD700" />
            </View>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Contact Support</Text>
            </View>
            <FontAwesome5 name="chevron-right" size={18} color="#666" />
          </TouchableOpacity>
        </View>

        {/* LOGOUT BUTTON */}
        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={handleLogoutPress}
        >
          <Ionicons name="log-out-outline" size={20} color="#FF4444" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        {/* VERSION INFO */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>B-PAY v1.0.0</Text>
          <Text style={styles.copyrightText}>© 2025 B-PAY. All rights reserved.</Text>
        </View>
      </ScrollView>

      {/* LOGOUT ALERT MODAL */}
      <LogoutAlertModal
        visible={showLogoutAlert}
        onClose={handleLogoutCancel}
        onConfirm={handleLogoutConfirm}
        countdown={logoutCountdown}
      />

      {/* ACCOUNT INFO MODAL */}
      <AccountInfoModal
        visible={showAccountInfo}
        onClose={() => setShowAccountInfo(false)}
        user={auth.user}
        currentAccount={auth.currentAccount}
      />
    </Animated.View>
  );
}

/* ─────────────────────────────── STYLES ─────────────────────────────── */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
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
    paddingHorizontal: 16,
    zIndex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFD700',
    fontSize: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 28,
  },
  backButton: {
    padding: 4,
  },
  title: {
    color: "#FFD700",
    fontSize: 28,
    fontWeight: "700",
    marginLeft: 12,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
    opacity: 0.9,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  settingSubtitle: {
    color: "#aaa",
    fontSize: 13,
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 68, 68, 0.1)",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 68, 68, 0.3)",
    gap: 12,
  },
  logoutText: {
    color: "#FF4444",
    fontSize: 16,
    fontWeight: "700",
  },
  versionContainer: {
    alignItems: "center",
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    marginBottom: 40,
  },
  versionText: {
    color: "#666",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4,
  },
  copyrightText: {
    color: "#666",
    fontSize: 12,
    opacity: 0.8,
  },
});