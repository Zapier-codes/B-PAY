// app/(app)/get-tag.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
  Animated,
  Easing,
  Alert,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "@/config/supabase";
import { bpay, BPayError } from "@/services/edgeFunctions";
import { useAuth } from "@/stores/auth-store";
import * as Haptics from "expo-haptics";

const SCREEN_WIDTH = Dimensions.get("window").width;

type FormStep = 'firstName' | 'lastName' | 'phone' | 'tag';

export default function GetTagScreen() {
  const router = useRouter();
  const { currentAccount } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("NG");
  const [tag, setTag] = useState("");
  
  const [currentStep, setCurrentStep] = useState<FormStep>('firstName');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [cooldown, setCooldown] = useState<string | null>(null);
  const [initialTagCreated, setInitialTagCreated] = useState(false);
  const [formValid, setFormValid] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null);

  const cleanTag = tag.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15);
  const displayTag = cleanTag ? `@${cleanTag}` : "";

  // Pulse watermark animation
  const pulseAnim = new Animated.Value(1);
  
  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    
    pulseAnimation.start();
    
    return () => {
      pulseAnimation.stop();
    };
  }, []);

  // Load user profile data
  useEffect(() => {
    if (!currentAccount?.user_id) return;

    const loadProfile = async () => {
      console.log("🔍 Loading profile for user:", currentAccount.user_id);
      console.log("📧 Current account email:", currentAccount.email);
      
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, email, phone, country, country_code, bpay_tag, tag_created_at, tag_changed_at, tag_change_count")
        .eq("id", currentAccount.user_id)
        .single();

      if (error) {
        console.error("❌ Error loading profile:", error);
        // Still set email from currentAccount even if profile fails
        setEmail(currentAccount.email || "");
        return;
      }

      console.log("📋 Profile data loaded:", data);

      // Fill name fields directly from first_name and last_name
      setFirstName(data.first_name || "");
      setLastName(data.last_name || "");
      
      // CRITICAL: Set email from profile OR currentAccount
      const userEmail = data.email || currentAccount.email || "";
      setEmail(userEmail);
      console.log("✅ Email set to:", userEmail);
      
      // Format phone to E.164 if needed
      let formattedPhone = data.phone || "";
      if (formattedPhone && !formattedPhone.startsWith("234")) {
        formattedPhone = `234${formattedPhone.replace(/^0+/, "")}`;
      }
      setPhone(formattedPhone);
      
      // Set country from profile or default to NG
      const userCountry = data.country || data.country_code || "NG";
      setCountry(userCountry);

      // If tag already exists, load it and check cooldown
      if (data?.bpay_tag) {
        setTag(data.bpay_tag);
        setInitialTagCreated(true);
        checkCooldown(data);
        setCurrentStep('tag');
      } else if (data.first_name) {
        setCurrentStep('lastName');
      }
    };

    loadProfile();
  }, [currentAccount?.user_id, currentAccount?.email]);

  // Validate form
  useEffect(() => {
    const isValid = 
      firstName.length >= 2 &&
      lastName.length >= 2 &&
      email.length >= 5 &&
      phone.length >= 10 &&
      cleanTag.length >= 4 &&
      available === true;
    
    setFormValid(isValid);
    console.log("✅ Form validation:", { 
      isValid, 
      firstName: firstName.length, 
      lastName: lastName.length, 
      email: email.length, 
      phone: phone.length, 
      cleanTag: cleanTag.length, 
      available 
    });
  }, [firstName, lastName, email, phone, cleanTag, available]);

  const checkCooldown = (profile: any) => {
    if (!profile?.tag_changed_at) return;
    const last = new Date(profile.tag_changed_at);
    const next = new Date(last);
    next.setMonth(next.getMonth() + 3);
    if (new Date() < next && profile.tag_change_count > 0) {
      const days = Math.ceil((next.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      setCooldown(`Change available in ${days} day${days > 1 ? "s" : ""}`);
    }
  };

  const checkAvailability = async (customTag?: string) => {
    const tagToCheck = customTag || cleanTag;
    
    if (!tagToCheck || tagToCheck.length < 4) {
      setAvailable(null);
      return;
    }
    
    setChecking(true);
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("bpay_tag", tagToCheck)
      .maybeSingle();
    setChecking(false);
    setAvailable(!data);
  };

  const handlePhoneChange = (text: string) => {
    // Allow only numbers
    const numbersOnly = text.replace(/[^0-9]/g, "");
    
    // Auto-format for Nigerian numbers
    if (numbersOnly.startsWith("0")) {
      setPhone(numbersOnly);
    } else if (numbersOnly.startsWith("234")) {
      setPhone(numbersOnly);
    } else if (numbersOnly.length > 0) {
      setPhone(`234${numbersOnly}`);
    } else {
      setPhone(numbersOnly);
    }
  };

  const formatPhoneDisplay = (phoneNum: string) => {
    if (phoneNum.startsWith("234")) {
      return `0${phoneNum.slice(3)}`;
    }
    return phoneNum;
  };

  const getCurrentPlaceholder = () => {
    switch (currentStep) {
      case 'firstName':
        return "Enter your first name";
      case 'lastName':
        return "Enter your last name";
      case 'phone':
        return "Enter phone number";
      case 'tag':
        return "Choose your BPAY tag";
      default:
        return "";
    }
  };

  const getCurrentValue = () => {
    switch (currentStep) {
      case 'firstName':
        return firstName;
      case 'lastName':
        return lastName;
      case 'phone':
        return formatPhoneDisplay(phone);
      case 'tag':
        return tag;
      default:
        return "";
    }
  };

  const handleInputChange = (text: string) => {
    // Clear existing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    switch (currentStep) {
      case 'firstName':
        setFirstName(text);
        // Wait for user to stop typing for 1 second before auto-advancing
        if (text.length >= 2) {
          const timeout = setTimeout(() => {
            setCurrentStep('lastName');
          }, 1000);
          setTypingTimeout(timeout);
        }
        break;
      case 'lastName':
        setLastName(text);
        if (text.length >= 2) {
          const timeout = setTimeout(() => {
            setCurrentStep('phone');
          }, 1000);
          setTypingTimeout(timeout);
        }
        break;
      case 'phone':
        handlePhoneChange(text);
        if (formatPhoneDisplay(text).length >= 10) {
          const timeout = setTimeout(() => {
            setCurrentStep('tag');
          }, 1000);
          setTypingTimeout(timeout);
        }
        break;
      case 'tag':
        setTag(text);
        break;
    }
  };

  const handleInputSubmit = () => {
    // Clear any existing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    switch (currentStep) {
      case 'firstName':
        if (firstName.length >= 2) setCurrentStep('lastName');
        break;
      case 'lastName':
        if (lastName.length >= 2) setCurrentStep('phone');
        break;
      case 'phone':
        if (formatPhoneDisplay(phone).length >= 10) setCurrentStep('tag');
        break;
      case 'tag':
        if (cleanTag.length >= 4) checkAvailability();
        break;
    }
  };

  const goToStep = (step: FormStep) => {
    // Clear any existing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    setCurrentStep(step);
  };

  const goBack = () => {
    // Clear any existing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    const steps: FormStep[] = ['firstName', 'lastName', 'phone', 'tag'];
    const currentIndex = steps.indexOf(currentStep);
    
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  const canGoBack = () => {
    const steps: FormStep[] = ['firstName', 'lastName', 'phone', 'tag'];
    return steps.indexOf(currentStep) > 0;
  };

  // Send notification to Supabase AND show Alert
  const sendNotification = async (title: string, message: string, type: "success" | "error" = "success") => {
    console.log(`[${type.toUpperCase()}] ${title}: ${message}`);
    
    // Show Alert to user
    Alert.alert(title, message);
    
    // Also save to database if user is logged in
    if (!currentAccount?.user_id) return;

    await supabase.from("notifications").insert({
      user_id: currentAccount.user_id,
      title,
      message,
      type,
      read: false,
      created_at: new Date().toISOString(),
    });
  };

  const createBpayCustomer = async () => {
    // Ensure phone is in E.164 format for Nigeria
    let formattedPhone = phone;
    if (formattedPhone.startsWith("0")) {
      formattedPhone = `234${formattedPhone.slice(1)}`;
    } else if (!formattedPhone.startsWith("234")) {
      formattedPhone = `234${formattedPhone}`;
    }

    // CRITICAL: Validate all required fields
    if (!email || email.length < 5) {
      await sendNotification("Missing Information", "Email is required to create your account", "error");
      return null;
    }

    console.log("📤 Creating BPay customer");

    try {
      // Onboard the customer via BPay. No screen ever calls a provider
      // directly or holds a provider credential — see
      // services/edgeFunctions.ts.
      const { customer_id } = await bpay.createCustomer({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: formattedPhone.trim(),
      });

      console.log("✅ BPay customer created successfully:", customer_id);
      return { customer_id, tier: null as number | null };
    } catch (error) {
      const errorMsg = error instanceof BPayError ? error.message : "Failed to create customer";
      console.error("❌ BPay error:", errorMsg);
      await sendNotification("Account Setup Error", errorMsg, "error");
      return null;
    }
  };

// In get-tag.tsx, update the saveCustomerAndTag function:
const saveCustomerAndTag = async () => {
  if (!formValid || saving || cooldown) return;

  setSaving(true);
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

  console.log("🚀 Creating BPay customer and BPAY tag...");

  // Step 1: Create BPay customer
  const bpayResult = await createBpayCustomer();
  if (!bpayResult) {
    setSaving(false);
    return;
  }

  const { customer_id, tier } = bpayResult;

  // Step 2: Save everything to Supabase
  const { data: current } = await supabase
    .from("profiles")
    .select("tag_change_count")
    .eq("id", currentAccount?.user_id)
    .single();

  const newCount = (current?.tag_change_count || 0) + (initialTagCreated ? 1 : 0);

  const updateData: any = {
    first_name: firstName,
    last_name: lastName,
    email: email,
    phone: phone,
    country: country,
    bpay_tag: cleanTag,
    bpay_customer_id: customer_id,
    tag_created_at: initialTagCreated ? undefined : new Date().toISOString(),
    tag_changed_at: new Date().toISOString(),
    tag_change_count: newCount,
  };

  if (tier !== undefined && tier !== null) {
    updateData.tier = tier;
  }

  const { error } = await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", currentAccount?.user_id);

  setSaving(false);

  if (error) {
    console.error("❌ Database error:", error);
    await sendNotification("Error", "Failed to save customer profile", "error");
  } else {
    console.log("✅ Customer and tag successfully created!");
    console.log("📊 Customer details:", {
      customer_id,
      tier: tier || 'NULL (not set)',
      bpay_tag: cleanTag,
      email,
      first_name: firstName,
      last_name: lastName
    });
    
    // CRITICAL: Update the auth store with the new BPAY tag
    // Method 1: Update just the tag (fast)
    updateCurrentAccountTag(cleanTag);
    
    // Method 2: Force refresh entire profile from Supabase (more thorough)
    await forceRefreshProfile();
    
    await sendNotification(
      "🎉 BPAY Tag Created!",
      `Your BPAY tag is @${cleanTag}. Share it with others to receive money!`,
      "success"
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    // Give a small delay for the store update to propagate
    setTimeout(() => {
      router.back();
    }, 500);
  }
};

  useEffect(() => {
    if (currentStep === 'tag' && cleanTag.length >= 4) {
      const t = setTimeout(() => checkAvailability(), 600);
      return () => clearTimeout(t);
    }
  }, [cleanTag, currentStep]);

  const renderProgressSteps = () => {
    const steps: FormStep[] = ['firstName', 'lastName', 'phone', 'tag'];
    const currentIndex = steps.indexOf(currentStep);

    return (
      <View style={styles.progressContainer}>
        {steps.map((step, index) => (
          <TouchableOpacity
            key={step}
            style={styles.stepContainer}
            onPress={() => goToStep(step)}
            disabled={index > currentIndex}
          >
            <View
              style={[
                styles.stepDot,
                index <= currentIndex ? styles.stepActive : styles.stepInactive,
                index < currentIndex && styles.stepCompleted,
              ]}
            >
              {index < currentIndex && (
                <Ionicons name="checkmark" size={8} color="#000" />
              )}
            </View>
            {index < steps.length - 1 && (
              <View
                style={[
                  styles.stepLine,
                  index < currentIndex ? styles.stepLineActive : styles.stepLineInactive,
                ]}
              />
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      {/* Animated Watermark with Pulse Effect */}
      <Animated.Image
        source={require("../../assets/icons/home.png")}
        style={[
          styles.watermark,
          {
            transform: [{ scale: pulseAnim }],
            opacity: pulseAnim.interpolate({
              inputRange: [1, 1.1],
              outputRange: [0.08, 0.12]
            })
          }
        ]}
        resizeMode="contain"
      />

      <View style={styles.content}>
        {/* Back Button */}
        {canGoBack() && (
          <TouchableOpacity style={styles.backButton} onPress={goBack}>
            <Ionicons name="arrow-back" size={28} color="#FFD700" />
          </TouchableOpacity>
        )}

        <Text style={styles.title}>Get @B-PAY Tag</Text>
        
        <View style={styles.subtitleContainer}>
          <Text style={styles.subtitle}>
            Complete your profile to get your unique{" "}
            <Text style={styles.sendMoneyText}>
              BPAY tag
            </Text>{" "}
            and start receiving money.
          </Text>
          <View style={styles.underline} />
        </View>

        {/* Progress Steps */}
        {renderProgressSteps()}

        {/* Single Input Field */}
        <View style={styles.inputSection}>
          <View style={styles.inputContainer}>
            {currentStep === 'tag' && <Text style={styles.prefix}>@</Text>}
            <TextInput
              style={[styles.input, currentStep === 'tag' && styles.tagInput]}
              value={getCurrentValue()}
              onChangeText={handleInputChange}
              onSubmitEditing={handleInputSubmit}
              placeholder={getCurrentPlaceholder()}
              placeholderTextColor="#666"
              autoCapitalize={currentStep === 'tag' ? "none" : "words"}
              autoCorrect={false}
              keyboardType={currentStep === 'phone' ? "phone-pad" : "default"}
              maxLength={currentStep === 'tag' ? 15 : undefined}
              returnKeyType={currentStep === 'tag' ? "done" : "next"}
              autoFocus={true}
            />
            {currentStep === 'tag' && checking && (
              <Ionicons name="sync" size={22} color="#FFD700" style={styles.checkIcon} />
            )}
            {currentStep === 'tag' && available === true && !checking && (
              <Ionicons name="checkmark-circle" size={28} color="#00FF7F" />
            )}
            {currentStep === 'tag' && available === false && !checking && (
              <Ionicons name="close-circle" size={28} color="#FF6B6B" />
            )}
          </View>

          {currentStep === 'tag' && (
            <Text style={[
              styles.status,
              available === true && styles.available,
              available === false && styles.taken
            ]}>
              {displayTag || "Enter a tag"}
              {available === true && " • Available!"}
              {available === false && " • Taken"}
            </Text>
          )}
        </View>

        {cooldown && (
          <View style={styles.cooldown}>
            <MaterialCommunityIcons name="lock-clock" size={18} color="#FF6B6B" />
            <Text style={styles.cooldownText}>{cooldown}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.saveButton,
            (!formValid || saving || cooldown) && styles.disabled,
          ]}
          onPress={saveCustomerAndTag}
          disabled={!formValid || saving || cooldown}
        >
          <Text style={styles.saveText}>
            {saving ? "Creating Account..." : initialTagCreated ? "Update Profile" : "Get Tag 🌍"}
          </Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <MaterialCommunityIcons name="information-outline" size={16} color="#FF6B6B" />
          <Text style={styles.footerText}>
            {initialTagCreated 
              ? "You can change your tag once every 3 months"
              : "Your BPAY tag lets others send you money instantly"
            }
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a"
  },
  watermark: {
    position: "absolute",
    top: "25%",
    left: "50%",
    marginLeft: -100,
    width: 200,
    height: 200,
    zIndex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 40,
    justifyContent: "center",
    zIndex: 2,
  },
  backButton: {
    position: "absolute",
    top: 50,
    left: 20,
    padding: 8,
    zIndex: 3,
  },
  title: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
    marginTop: 20,
  },
  subtitleContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  subtitle: {
    color: "#aaa",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  sendMoneyText: {
    color: "#00FF7F",
    fontWeight: "600",
  },
  underline: {
    width: 100,
    height: 2,
    backgroundColor: "#FFD700",
    marginTop: 4,
    borderRadius: 1,
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 40,
  },
  stepContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  stepActive: {
    backgroundColor: "#FFD700",
  },
  stepInactive: {
    backgroundColor: "#333",
  },
  stepCompleted: {
    backgroundColor: "#00FF7F",
  },
  stepLine: {
    width: 40,
    height: 2,
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: "#FFD700",
  },
  stepLineInactive: {
    backgroundColor: "#333",
  },
  inputSection: {
    marginBottom: 30,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 16,
    paddingHorizontal: 20,
    height: 60,
    borderWidth: 2,
    borderColor: "#333",
    marginBottom: 12,
  },
  input: {
    flex: 1,
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
    backgroundColor: "transparent",
  },
  tagInput: {
    marginLeft: 0,
  },
  prefix: {
    color: "#FFD700",
    fontSize: 20,
    fontWeight: "700",
    marginRight: 8
  },
  checkIcon: {
    marginLeft: 10
  },
  status: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#aaa",
  },
  available: {
    color: "#00FF7F"
  },
  taken: {
    color: "#FF6B6B"
  },
  cooldown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    backgroundColor: "#1a1a1a",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignSelf: "center",
  },
  cooldownText: {
    color: "#FF6B6B",
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "600",
  },
  saveButton: {
    backgroundColor: "transparent",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    marginTop: 20,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFD700",
    alignSelf: "center",
    minWidth: 200,
  },
  disabled: {
    backgroundColor: "transparent",
    opacity: 0.3,
    borderColor: "#666",
  },
  saveText: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "700"
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
    backgroundColor: "#111",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  footerText: {
    color: "#666",
    textAlign: "center",
    fontSize: 13,
    marginLeft: 8,
  },
});