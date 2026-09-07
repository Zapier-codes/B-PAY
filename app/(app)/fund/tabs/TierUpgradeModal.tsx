// components/TierUpgradeModal.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Alert,
  ScrollView,
  SafeAreaView,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "@/config/supabase";
import { bpay, BPayError } from "@/services/edgeFunctions";
import { useAuth } from "@/stores/auth-store";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";

const { width, height } = Dimensions.get("window");

type FormStep = "dob" | "address" | "identification" | "review";

interface AddressData {
  street: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
}

interface TierUpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  onUpgradeSuccess: () => void; // Simplified callback
  customerId: string;
}

// State postal code mapping for Nigerian states
const STATE_POSTAL_CODES: Record<string, string> = {
  "Lagos": "100001",
  "FCT": "900001",
  "Oyo": "200001",
  "Rivers": "500001",
  "Kano": "700001",
  "Kaduna": "800001",
  "Abia": "440001",
  "Akwa Ibom": "520001",
  "Anambra": "420001",
  "Benue": "970001",
  "Cross River": "540001",
  "Delta": "320001",
  "Edo": "300001",
  "Ekiti": "370001",
  "Enugu": "400001",
  "Gombe": "760001",
  "Imo": "460001",
  "Jigawa": "720001",
  "Katsina": "820001",
  "Kebbi": "860001",
  "Kogi": "260001",
  "Kwara": "240001",
  "Nasarawa": "960001",
  "Niger": "920001",
  "Ogun": "110001",
  "Ondo": "340001",
  "Osun": "230001",
  "Plateau": "930001",
  "Sokoto": "840001",
  "Taraba": "660001",
  "Yobe": "320001",
  "Zamfara": "880001",
  "Adamawa": "640001",
  "Bayelsa": "561001",
  "Ebonyi": "840001",
};

export default function TierUpgradeModal({
  visible,
  onClose,
  onUpgradeSuccess,
  customerId,
}: TierUpgradeModalProps) {
  const { currentAccount, forceRefreshProfile } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  const [dob, setDob] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [address, setAddress] = useState<AddressData>({
    street: "",
    city: "",
    state: "",
    country: "NG",
    postal_code: "",
  });
  const [identificationNumber, setIdentificationNumber] = useState("");
  const [currentStep, setCurrentStep] = useState<FormStep>("dob");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formValid, setFormValid] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdVaAccount, setCreatedVaAccount] = useState(false);

  useEffect(() => {
    if (visible) {
      loadUserData();
      setSuccess(false);
      setCreatedVaAccount(false);
    }
  }, [visible]);

  useEffect(() => {
    // Auto-assign postal code when state is entered
    if (address.state.length >= 2 && !address.postal_code) {
      const stateMatch = Object.keys(STATE_POSTAL_CODES).find(s =>
        s.toLowerCase().includes(address.state.toLowerCase()) ||
        address.state.toLowerCase().includes(s.toLowerCase())
      );
      
      if (stateMatch) {
        setAddress(prev => ({ ...prev, postal_code: STATE_POSTAL_CODES[stateMatch] }));
      }
    }
  }, [address.state]);

  const loadUserData = async () => {
    if (!currentAccount?.user_id) return;
    try {
      const { data } = await supabase
        .from("profiles")
        .select(
          "country, date_of_birth, address_street, address_city, address_state, address_postal_code, identification_number, tier, bpay_account_number, bpay_customer_id, first_name, last_name, email, phone"
        )
        .eq("id", currentAccount.user_id)
        .single();
      
      if (data) {
        if (data.date_of_birth) {
          setDob(new Date(data.date_of_birth));
        }
        if (data.address_street) {
          setAddress((prev) => ({
            ...prev,
            street: data.address_street || "",
            city: data.address_city || "",
            state: data.address_state || "",
            postal_code: data.address_postal_code || "",
            country: data.country || "NG",
          }));
        }
        if (data.identification_number) {
          setIdentificationNumber(data.identification_number || "");
        }
        
        // If user already has tier 1, skip to success
        if (data.tier === 1 || data.bpay_account_number) {
          setCreatedVaAccount(true);
        }
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  const saveCustomerDetailsToSupabase = async (customerId?: string): Promise<boolean> => {
    if (!currentAccount?.user_id || !dob) return false;
    try {
      const updateData: any = {
        date_of_birth: dob.toISOString().split("T")[0],
        address_street: address.street,
        address_city: address.city,
        address_state: address.state,
        address_postal_code: address.postal_code,
        identification_type: "BVN",
        identification_number: identificationNumber,
        tier: 1,
        verification_status: "verified",
        updated_at: new Date().toISOString(),
      };

      // If we have a customer id from BPay, save it
      if (customerId) {
        updateData.bpay_customer_id = customerId;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", currentAccount.user_id);

      if (profileError) {
        console.error("Supabase profile update error:", profileError);
        return false;
      }

      console.log("✅ Profile updated successfully for Tier 1");
      return true;
    } catch (error) {
      console.error("Error saving customer details:", error);
      return false;
    }
  };

  const createVirtualAccount = async (customerId: string): Promise<boolean> => {
    try {
      // Get fresh profile data to ensure we have the latest identification_number
      const { data: freshProfile } = await supabase
        .from("profiles")
        .select("identification_number, first_name, last_name")
        .eq("id", currentAccount?.user_id)
        .single();

      console.log("🔍 Creating permanent account for customer:", customerId);

      // Create a collection account for this customer via BPay. No screen
      // ever calls a provider directly or holds a provider credential —
      // see services/edgeFunctions.ts.
      let account: { account_number: string; bank_name: string; account_name: string } | null = null;
      let creationError: string | null = null;

      try {
        account = await bpay.createVirtualAccount({
          customer_id: customerId,
          ...(freshProfile?.identification_number
            ? { bvn: freshProfile.identification_number }
            : {}),
        });
      } catch (err) {
        creationError = err instanceof BPayError ? err.message : "Failed to create virtual account";
      }

      if (account?.account_number) {
        const accountNumber = account.account_number;
        const bankName = account.bank_name || "9PSB";
        const accountName = account.account_name || `${freshProfile?.first_name} ${freshProfile?.last_name}`;

        console.log("✅ Virtual account created successfully:", {
          accountNumber,
          bankName,
          accountName
        });

        // Update profile with account number
        const { error } = await supabase
          .from("profiles")
          .update({
            bpay_account_number: accountNumber,
            bpay_bank_name: bankName,
            bpay_account_name: accountName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentAccount?.user_id);

        if (error) {
          console.error("❌ Error updating profile with VA:", error);
          throw new Error("Failed to save account number to your profile");
        } else {
          console.log("✅ Profile updated with virtual account");
          setCreatedVaAccount(true);
          return true;
        }
      } else {
        const errorMsg = creationError || "Failed to create virtual account";
        console.error("❌ Virtual account creation error:", errorMsg);

        // Handle specific error cases
        if (errorMsg.includes("not found")) {
          throw new Error("Customer not found. Please verify your customer account.");
        } else if (errorMsg.includes("already exists")) {
          // Check if account already exists in our database
          const { data: existingAccount } = await supabase
            .from("profiles")
            .select("bpay_account_number")
            .eq("id", currentAccount?.user_id)
            .single();

          if (existingAccount?.bpay_account_number) {
            setCreatedVaAccount(true);
            return true; // Account already exists, treat as success
          }
          throw new Error("Virtual account already exists for this customer.");
        } else {
          throw new Error(errorMsg);
        }
      }
    } catch (error: any) {
      console.error("❌ Error creating virtual account:", error);
      throw error;
    }
  };

  // Auto-advance logic for keyboard inputs
  useEffect(() => {
    let valid = false;
    switch (currentStep) {
      case "dob":
        valid = !!dob && isOver18(dob);
        break;
      case "address":
        valid = address.state.length >= 2 && 
                address.city.length >= 2 && 
                address.street.length >= 3;
        break;
      case "identification":
        valid = validateBVN(identificationNumber);
        break;
      case "review":
        valid = !!dob && isOver18(dob) && 
                address.state.length >= 2 && 
                address.city.length >= 2 && 
                address.street.length >= 3 &&
                validateBVN(identificationNumber);
        break;
    }
    setFormValid(valid);
  }, [currentStep, dob, address, identificationNumber]);

  const isOver18 = (date: Date) => {
    const today = new Date();
    const eighteenYearsAgo = new Date(
      today.getFullYear() - 18,
      today.getMonth(),
      today.getDate()
    );
    return date <= eighteenYearsAgo;
  };

  const validateBVN = (bvn: string) => /^\d{11}$/.test(bvn);

  const goToStep = (step: FormStep) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentStep(step);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const goBack = () => {
    const steps: FormStep[] = ["dob", "address", "identification", "review"];
    const idx = steps.indexOf(currentStep);
    if (idx > 0) goToStep(steps[idx - 1]);
  };

  const handleTier1UpgradeAndVA = async () => {
    if (!formValid || isSubmitting || !dob) return;
    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Get fresh profile data
      const { data: profile } = await supabase
        .from("profiles")
        .select("bpay_customer_id, email, first_name, last_name, phone")
        .eq("id", currentAccount?.user_id)
        .single();

      let customerId = customerId || profile?.bpay_customer_id;

      // Step 1: Upgrade this customer's KYC tier via BPay. No screen ever
      // calls a provider directly or holds a provider credential — see
      // services/edgeFunctions.ts.
      console.log("🚀 Starting tier upgrade...");

      if (!customerId) {
        throw new Error("Missing customer id — cannot upgrade tier");
      }

      await bpay.upgradeCustomerTier({
        customer_id: customerId,
        bvn: identificationNumber,
      });

      console.log("✅ Tier upgrade successful");

      // Step 2: Save details to Supabase
      const saved = await saveCustomerDetailsToSupabase(customerId);
      if (!saved) {
        throw new Error("Failed to save customer details");
      }

      // Step 3: Create Virtual Account (Permanent/Static)
      console.log("🔄 Creating permanent virtual account...");
      const vaCreated = await createVirtualAccount(customerId);
      
      if (!vaCreated) {
        throw new Error("Virtual account creation failed");
      }

      // Step 4: Success!
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
      
      // Refresh auth store to get updated tier and VA info
      await forceRefreshProfile();
      
      // Auto-close after 3 seconds
      setTimeout(() => {
        onUpgradeSuccess();
        onClose();
      }, 3000);

    } catch (err: any) {
      console.error("❌ Upgrade failed:", err);
      
      // More specific error messages
      let errorMessage = err.message || "Please try again. Make sure all information is correct.";
      
      if (err.message.includes("Customer not found")) {
        errorMessage = "Customer not found. Please contact support.";
      } else if (err.message.includes("not eligible")) {
        errorMessage = "Your account needs to be Tier 1 verified first. Please complete the verification.";
      } else if (err.message.includes("already exists")) {
        errorMessage = "Virtual account already exists for your account. Check your account details.";
      } else if (err.message.includes("Invalid BVN")) {
        errorMessage = "Please enter a valid 11-digit BVN.";
      } else if (err.message.includes("400")) {
        errorMessage = "Invalid request. Please check all fields and try again.";
      } else if (err.message.includes("401") || err.message.includes("403")) {
        errorMessage = "Authentication failed. Please contact support.";
      }
      
      Alert.alert("Upgrade Failed", errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDateSelect = (date: Date) => {
    setDob(date);
    if (isOver18(date)) {
      setTimeout(() => goToStep("address"), 500);
    }
  };

  const handleIDSubmit = () => {
    if (validateBVN(identificationNumber)) {
      setTimeout(() => goToStep("review"), 300);
    }
  };

  const renderProgressSteps = () => {
    const steps = ["dob", "address", "identification", "review"];
    const currentIndex = steps.indexOf(currentStep);
    return (
      <View style={styles.progressContainer}>
        {steps.map((step, i) => (
          <View key={step} style={styles.stepWrapper}>
            <View
              style={[
                styles.stepCircle,
                i <= currentIndex ? styles.activeCircle : styles.inactiveCircle,
                i < currentIndex && styles.completedCircle,
              ]}
            >
              {i < currentIndex ? (
                <Ionicons name="checkmark" size={16} color="#000" />
              ) : (
                <Text style={i <= currentIndex ? styles.activeText : styles.inactiveText}>
                  {i + 1}
                </Text>
              )}
            </View>
            {i < steps.length - 1 && (
              <View
                style={[
                  styles.stepLine,
                  i < currentIndex ? styles.activeLine : styles.inactiveLine,
                ]}
              />
            )}
          </View>
        ))}
      </View>
    );
  };

  const renderSuccessView = () => (
    <View style={styles.successContainer}>
      <View style={styles.successIcon}>
        <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
      </View>
      <Text style={styles.successTitle}>Congratulations! 🎉</Text>
      <Text style={styles.successSubtitle}>
        You're now Tier 1 verified and your virtual account has been created!
      </Text>
      
      <View style={styles.successDetails}>
        <View style={styles.successItem}>
          <Ionicons name="shield-checkmark" size={24} color="#4CAF50" />
          <Text style={styles.successItemText}>Tier 1 Verified</Text>
        </View>
        
        <View style={styles.successItem}>
          <MaterialCommunityIcons name="bank" size={24} color="#4CAF50" />
          <Text style={styles.successItemText}>Virtual Account Active</Text>
        </View>
        
        <View style={styles.successItem}>
          <Ionicons name="flash" size={24} color="#4CAF50" />
          <Text style={styles.successItemText}>Higher Transaction Limits</Text>
        </View>
      </View>
      
      <Text style={styles.autoCloseText}>
        This will close automatically in 3 seconds...
      </Text>
    </View>
  );

  const renderStepContent = () => {
    if (success) {
      return renderSuccessView();
    }

    switch (currentStep) {
      case "dob":
        return (
          <View style={styles.stepContent}>
            <Text style={styles.label}>Date of Birth</Text>
            <TouchableOpacity style={styles.dateInput} onPress={() => setShowDatePicker(true)}>
              <Text style={dob ? styles.dateText : styles.placeholderText}>
                {dob ? dob.toLocaleDateString("en-GB") : "Tap to select date"}
              </Text>
              <Ionicons name="calendar" size={24} color="#FFD700" />
            </TouchableOpacity>

            {showDatePicker && Platform.OS === 'ios' && (
              <View style={styles.datePickerContainer}>
                <DateTimePicker
                  value={dob || new Date(2000, 0, 1)}
                  mode="date"
                  display="spinner"
                  themeVariant="dark"
                  textColor="#FFD700"
                  accentColor="#FFD700"
                  onChange={(e, selectedDate) => {
                    setShowDatePicker(false);
                    if (selectedDate) handleDateSelect(selectedDate);
                  }}
                />
              </View>
            )}

            {showDatePicker && Platform.OS === 'android' && (
              <DateTimePicker
                value={dob || new Date(2000, 0, 1)}
                mode="date"
                display="default"
                themeVariant="dark"
                textColor="#FFD700"
                onChange={(e, selectedDate) => {
                  setShowDatePicker(false);
                  if (selectedDate) handleDateSelect(selectedDate);
                }}
              />
            )}
            <Text style={styles.helper}>You must be 18 years or older</Text>
          </View>
        );

      case "address":
        return (
          <View style={styles.stepContent}>
            <Text style={styles.label}>State</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your state"
              placeholderTextColor="#666"
              value={address.state}
              onChangeText={(text) => setAddress(prev => ({ ...prev, state: text }))}
              autoFocus={true}
            />
            
            <Text style={styles.label}>City</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your city"
              placeholderTextColor="#666"
              value={address.city}
              onChangeText={(text) => setAddress(prev => ({ ...prev, city: text }))}
            />
            
            <Text style={styles.label}>Street Address</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., No 16, Adeola Odeku Street, Victoria Island"
              placeholderTextColor="#666"
              value={address.street}
              onChangeText={(text) => setAddress(prev => ({ ...prev, street: text }))}
              multiline={true}
              numberOfLines={2}
            />
            
            {address.postal_code && (
              <View style={styles.postalCodeContainer}>
                <MaterialCommunityIcons name="map-marker-check" size={16} color="#4CAF50" />
                <Text style={styles.postalCodeText}>Postal Code: {address.postal_code}</Text>
              </View>
            )}
          </View>
        );

      case "identification":
        return (
          <View style={styles.stepContent}>
            <Text style={styles.label}>Bank Verification Number (BVN)</Text>
            <View style={styles.bvnInfoContainer}>
              <MaterialCommunityIcons name="alert-circle" size={20} color="#FF4444" />
              <Text style={styles.bvnInfoText}>
                Your BVN is an 11-digit number issued by your bank for identity verification
              </Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Enter your 11-digit BVN"
              placeholderTextColor="#666"
              value={identificationNumber}
              onChangeText={setIdentificationNumber}
              keyboardType="number-pad"
              maxLength={11}
              returnKeyType="done"
              onSubmitEditing={handleIDSubmit}
            />
          </View>
        );

      case "review":
        return (
          <View style={styles.reviewStepContent}>
            <View style={styles.reviewCard}>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewSectionTitle}>
                  <Ionicons name="person-outline" size={16} color="#FFD700" /> Personal Information
                </Text>
                <View style={styles.reviewItem}>
                  <Text style={styles.reviewLabel}>Date of Birth:</Text>
                  <Text style={styles.reviewValue}>{dob?.toLocaleDateString("en-GB")}</Text>
                </View>
              </View>
              
              <View style={styles.reviewSection}>
                <Text style={styles.reviewSectionTitle}>
                  <Ionicons name="location-outline" size={16} color="#FFD700" /> Address Details
                </Text>
                <View style={styles.reviewItem}>
                  <Text style={styles.reviewLabel}>Street:</Text>
                  <Text style={styles.reviewValue}>{address.street}</Text>
                </View>
                <View style={styles.reviewItem}>
                  <Text style={styles.reviewLabel}>City:</Text>
                  <Text style={styles.reviewValue}>{address.city}</Text>
                </View>
                <View style={styles.reviewItem}>
                  <Text style={styles.reviewLabel}>State:</Text>
                  <Text style={styles.reviewValue}>{address.state}</Text>
                </View>
                <View style={styles.reviewItem}>
                  <Text style={styles.reviewLabel}>Country:</Text>
                  <Text style={styles.reviewValue}>{address.country}</Text>
                </View>
                {address.postal_code && (
                  <View style={styles.reviewItem}>
                    <Text style={styles.reviewLabel}>Postal Code:</Text>
                    <Text style={styles.reviewValue}>{address.postal_code}</Text>
                  </View>
                )}
              </View>
              
              <View style={styles.reviewSection}>
                <Text style={styles.reviewSectionTitle}>
                  <MaterialCommunityIcons name="shield-account" size={16} color="#FFD700" /> Verification
                </Text>
                <View style={styles.reviewItem}>
                  <Text style={styles.reviewLabel}>Bank Verification Number (BVN):</Text>
                  <Text style={styles.reviewValue}>*******{identificationNumber.slice(-4)}</Text>
                </View>
              </View>
            </View>

            {/* Combined Upgrade Button */}
            <TouchableOpacity
              style={[styles.upgradeBtn, (!formValid || isSubmitting) && styles.disabledBtn]}
              onPress={handleTier1UpgradeAndVA}
              disabled={!formValid || isSubmitting}
              activeOpacity={0.7}
            >
              {isSubmitting ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#FFD700" size="small" />
                  <Text style={styles.upgradeText}>Processing...</Text>
                </View>
              ) : (
                <View style={styles.upgradeButtonContent}>
                  <Ionicons name="rocket" size={20} color="#FFD700" />
                  <Text style={styles.upgradeText}>Upgrade to Tier 1 & Create Account</Text>
                </View>
              )}
            </TouchableOpacity>
            
            <View style={styles.upgradeBenefits}>
              <Text style={styles.benefitsTitle}>What you get:</Text>
              <View style={styles.benefitItem}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <Text style={styles.benefitText}>Tier 1 verification status</Text>
              </View>
              <View style={styles.benefitItem}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <Text style={styles.benefitText}>Virtual bank account</Text>
              </View>
              <View style={styles.benefitItem}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <Text style={styles.benefitText}>Higher transaction limits</Text>
              </View>
            </View>
          </View>
        );
    }
  };

  const renderPermanentFooter = () => {
    if (success) return null;
    
    return (
      <View style={styles.permanentFooter}>
        <View style={styles.cautionBox}>
          <MaterialCommunityIcons name="shield-alert-outline" size={20} color="#FF4444" />
          <Text style={styles.cautionText}>
            B-PAY does not store your personal details. This information is used only to
            create your verified <Text style={styles.goldText}>Bank-PAY</Text> account with our{' '}
            <Text style={styles.blueText}>200+ banking partners</Text>.
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <SafeAreaView style={styles.container}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
          >
            <View style={styles.modalContainer}>
              <ScrollView 
                ref={scrollViewRef} 
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <View style={styles.modal}>
                    {!success && (
                      <>
                        <TouchableOpacity 
                          style={styles.closeBtn} 
                          onPress={onClose}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="close" size={28} color="#FFD700" />
                        </TouchableOpacity>
                        <Text style={styles.title}>Upgrade to Tier 1</Text>
                        <Text style={styles.subtitle}>Unlock virtual accounts & higher limits</Text>
                        {renderProgressSteps()}
                        <Text style={styles.stepTitle}>
                          {currentStep === "dob" && "Your Date of Birth"}
                          {currentStep === "address" && "Address Details"}
                          {currentStep === "identification" && "Bank Verification Number (BVN)"}
                          {currentStep === "review" && "Final Review & Upgrade"}
                        </Text>
                        
                        {/* Back button for non-review steps */}
                        {currentStep !== "review" && currentStep !== "dob" && !success && (
                          <TouchableOpacity 
                            style={styles.backBtn} 
                            onPress={goBack}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="arrow-back" size={24} color="#FFD700" />
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                    
                    {renderStepContent()}
                  </View>
                </TouchableWithoutFeedback>
              </ScrollView>
              
              {/* Permanent Footer */}
              {renderPermanentFooter()}
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)" },
  modalContainer: {
    flex: 1,
    marginTop: 40,
  },
  scrollContent: { 
    flexGrow: 1,
  },
  modal: {
    backgroundColor: "#0a0a0a",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    paddingBottom: 10,
    minHeight: height - 200,
  },
  closeBtn: { alignSelf: "flex-end", marginBottom: 5 },
  title: { color: "#FFD700", fontSize: 26, fontWeight: "bold", textAlign: "center" },
  subtitle: { color: "#aaa", textAlign: "center", fontSize: 14, marginBottom: 15 },
  progressContainer: { flexDirection: "row", justifyContent: "center", marginVertical: 15 },
  stepWrapper: { flexDirection: "row", alignItems: "center" },
  stepCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  activeCircle: { backgroundColor: "#FFD700" },
  inactiveCircle: { backgroundColor: "#333" },
  completedCircle: { backgroundColor: "#4CAF50" },
  activeText: { color: "#000", fontWeight: "bold", fontSize: 14 },
  inactiveText: { color: "#666", fontSize: 14 },
  stepLine: { width: 35, height: 3, marginHorizontal: 6 },
  activeLine: { backgroundColor: "#FFD700" },
  inactiveLine: { backgroundColor: "#333" },
  stepTitle: { color: "#fff", fontSize: 16, fontWeight: "600", marginBottom: 15, textAlign: "center" },
  stepContent: { marginBottom: 15 },
  reviewStepContent: { marginBottom: 5 },
  label: { color: "#aaa", marginBottom: 6, fontSize: 14 },
  input: {
    backgroundColor: "#1a1a1a",
    color: "#fff",
    padding: 14,
    borderRadius: 10,
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  postalCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  postalCodeText: {
    color: "#4CAF50",
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  dateInput: {
    backgroundColor: "#1a1a1a",
    padding: 14,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  dateText: { color: "#fff", fontSize: 15 },
  placeholderText: { color: "#666", fontSize: 15 },
  datePickerContainer: {
    backgroundColor: '#0a0a0a',
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  bvnInfoContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 68, 68, 0.1)",
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  bvnInfoText: {
    color: "#FF4444",
    fontSize: 11,
    flex: 1,
    marginLeft: 6,
  },
  reviewCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 15,
    padding: 5,
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 15,
  },
  reviewSection: {
    marginBottom: 8,
  },
  reviewSectionTitle: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  reviewLabel: {
    color: "#aaa",
    fontSize: 13,
    flex: 1,
  },
  reviewValue: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
    textAlign: 'right',
    flex: 1,
  },
  permanentFooter: {
    backgroundColor: "#0a0a0a",
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  cautionBox: {
    flexDirection: "row",
    backgroundColor: "#1a1a1a",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
  },
  cautionText: { 
    color: "#aaa", 
    fontSize: 11, 
    flex: 1, 
    marginLeft: 8,
    lineHeight: 14,
  },
  goldText: {
    color: "#FFD700",
    fontWeight: "600",
  },
  blueText: {
    color: "#4A90E2",
    fontWeight: "600",
  },
  backBtn: { 
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "transparent",
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 10,
    marginBottom: 10,
  },
  upgradeBtn: { 
    backgroundColor: "transparent", 
    padding: 16, 
    borderRadius: 20, 
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#4CAF50",
    marginBottom: 15,
  },
  upgradeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: { 
    opacity: 0.5,
    borderColor: "#666",
  },
  upgradeText: { 
    color: "#FFD700", 
    fontWeight: "bold", 
    fontSize: 16,
    marginLeft: 8,
  },
  helper: { 
    color: "#666", 
    fontSize: 11, 
    fontStyle: "italic", 
    marginTop: 6,
  },
  // Success Styles
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  successIcon: {
    marginBottom: 20,
  },
  successTitle: {
    color: '#4CAF50',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  successSubtitle: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  successDetails: {
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    padding: 20,
    width: '100%',
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#333',
  },
  successItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  successItemText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
  },
  autoCloseText: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 20,
  },
  // Upgrade Benefits
  upgradeBenefits: {
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
    borderRadius: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  benefitsTitle: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  benefitText: {
    color: '#fff',
    fontSize: 13,
    marginLeft: 8,
  },
});